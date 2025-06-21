/**
 * FlowSnapshotRepository - репозиторий для работы со снапшотами потоков
 * 
 * Обеспечивает доступ к данным снапшотов в базе данных.
 * Включает операции CRUD для всех типов снапшотов:
 * - FlowSnapshot (снапшоты потоков)
 * - FlowStepSnapshot (снапшоты шагов)
 * - ComponentSnapshot (снапшоты компонентов)
 * 
 * Использует Prisma для взаимодействия с PostgreSQL базой данных.
 */

import { PrismaClient } from '@prisma/client'
import { FlowSnapshot } from '../entities/FlowSnapshot'
import { FlowStepSnapshot } from '../entities/FlowStepSnapshot'
import { ComponentSnapshot } from '../entities/ComponentSnapshot'
import { BaseRepository } from './base/BaseRepository'
import { logger } from '../../utils/logger'

// ===== ИНТЕРФЕЙСЫ =====

export interface IFlowSnapshotRepository {
  // FlowSnapshot операции
  findById(id: string): Promise<FlowSnapshot | null>
  findByAssignmentId(assignmentId: string): Promise<FlowSnapshot | null>
  createFlowSnapshot(snapshot: FlowSnapshot): Promise<FlowSnapshot>
  updateFlowSnapshot(id: string, updates: Partial<FlowSnapshot>): Promise<FlowSnapshot>
  deleteFlowSnapshot(id: string): Promise<void>
  
  // FlowStepSnapshot операции
  findStepById(id: string): Promise<FlowStepSnapshot | null>
  findStepsByFlowSnapshotId(flowSnapshotId: string): Promise<FlowStepSnapshot[]>
  createStepSnapshot(snapshot: FlowStepSnapshot): Promise<FlowStepSnapshot>
  updateStepSnapshot(id: string, updates: Partial<FlowStepSnapshot>): Promise<FlowStepSnapshot>
  deleteStepSnapshot(id: string): Promise<void>
  
  // ComponentSnapshot операции
  findComponentById(id: string): Promise<ComponentSnapshot | null>
  findComponentsByStepSnapshotId(stepSnapshotId: string): Promise<ComponentSnapshot[]>
  findComponentsByStepSnapshotIds(stepSnapshotIds: string[]): Promise<ComponentSnapshot[]>
  createComponentSnapshot(snapshot: ComponentSnapshot): Promise<ComponentSnapshot>
  updateComponentSnapshot(id: string, updates: Partial<ComponentSnapshot>): Promise<ComponentSnapshot>
  deleteComponentSnapshot(id: string): Promise<void>
  
  // Пакетные операции
  findFullSnapshotStructure(flowSnapshotId: string): Promise<{
    flowSnapshot: FlowSnapshot
    stepSnapshots: FlowStepSnapshot[]
    componentSnapshots: ComponentSnapshot[]
  } | null>
  
  // Статистика и аналитика
  getSnapshotStats(assignmentId: string): Promise<{
    totalSteps: number
    totalComponents: number
    createdAt: Date
    sizeInBytes: number
  }>
}

// ===== ОСНОВНОЙ КЛАСС РЕПОЗИТОРИЯ =====

export class FlowSnapshotRepository extends BaseRepository implements IFlowSnapshotRepository {
  constructor(prisma: PrismaClient) {
    super(prisma)
  }

  // ===== FLOWSNAPSHOT ОПЕРАЦИИ =====

  /**
   * Находит снапшот потока по ID
   */
  async findById(id: string): Promise<FlowSnapshot | null> {
    try {
      const record = await this.prisma.flowSnapshot.findUnique({
        where: { id },
        include: {
          assignment: {
            select: { id: true, userId: true }
          }
        }
      })

      if (!record) {
        return null
      }

      return this.mapToFlowSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при поиске снапшота потока по ID', { id, error: error.message })
      throw new Error(`Не удалось найти снапшот потока: ${error.message}`)
    }
  }

  /**
   * Находит снапшот потока по ID назначения
   */
  async findByAssignmentId(assignmentId: string): Promise<FlowSnapshot | null> {
    try {
      const record = await this.prisma.flowSnapshot.findFirst({
        where: { assignmentId },
        include: {
          assignment: {
            select: { id: true, userId: true }
          }
        }
      })

      if (!record) {
        return null
      }

      return this.mapToFlowSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при поиске снапшота по assignmentId', { assignmentId, error: error.message })
      throw new Error(`Не удалось найти снапшот: ${error.message}`)
    }
  }

  /**
   * Создает новый снапшот потока
   */
  async createFlowSnapshot(snapshot: FlowSnapshot): Promise<FlowSnapshot> {
    try {
      const data = snapshot.toData()
      
      const record = await this.prisma.flowSnapshot.create({
        data: {
          id: data.id,
          assignmentId: data.assignmentId,
          originalFlowId: data.originalFlowId,
          title: data.flowMeta.title,
          description: data.flowMeta.description,
          version: data.flowMeta.version,
          estimatedDuration: data.flowMeta.estimatedDuration,
          difficulty: data.flowMeta.difficulty,
          tags: data.flowMeta.tags,
          stepSnapshotIds: data.stepSnapshotIds,
          snapshotVersion: data.snapshotMeta.snapshotVersion,
          createdBy: data.snapshotMeta.createdBy,
          createdAt: data.snapshotMeta.createdAt,
          context: data.snapshotMeta.context || {}
        }
      })

      logger.info('Снапшот потока создан', { flowSnapshotId: record.id })
      return this.mapToFlowSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при создании снапшота потока', { snapshotId: snapshot.id, error: error.message })
      throw new Error(`Не удалось создать снапшот потока: ${error.message}`)
    }
  }

  /**
   * Обновляет снапшот потока
   */
  async updateFlowSnapshot(id: string, updates: Partial<FlowSnapshot>): Promise<FlowSnapshot> {
    try {
      // Снапшоты по определению неизменяемы, поэтому обновления должны быть ограничены
      // Разрешаем обновлять только контекст
      const record = await this.prisma.flowSnapshot.update({
        where: { id },
        data: {
          // Здесь можно добавить разрешенные для обновления поля
          context: (updates as any).context
        }
      })

      return this.mapToFlowSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при обновлении снапшота потока', { id, error: error.message })
      throw new Error(`Не удалось обновить снапшот потока: ${error.message}`)
    }
  }

  /**
   * Удаляет снапшот потока и все связанные данные
   */
  async deleteFlowSnapshot(id: string): Promise<void> {
    try {
      // Удаляем в правильном порядке: сначала компоненты, потом шаги, потом поток
      await this.prisma.$transaction(async (tx) => {
        // Сначала находим все связанные шаги
        const stepSnapshots = await tx.flowStepSnapshot.findMany({
          where: { flowSnapshotId: id },
          select: { id: true }
        })

        const stepSnapshotIds = stepSnapshots.map(step => step.id)

        // Удаляем все компоненты
        if (stepSnapshotIds.length > 0) {
          await tx.componentSnapshot.deleteMany({
            where: { stepSnapshotId: { in: stepSnapshotIds } }
          })
        }

        // Удаляем все шаги
        await tx.flowStepSnapshot.deleteMany({
          where: { flowSnapshotId: id }
        })

        // Удаляем сам снапшот потока
        await tx.flowSnapshot.delete({
          where: { id }
        })
      })

      logger.info('Снапшот потока удален', { flowSnapshotId: id })
    } catch (error) {
      logger.error('Ошибка при удалении снапшота потока', { id, error: error.message })
      throw new Error(`Не удалось удалить снапшот потока: ${error.message}`)
    }
  }

  // ===== FLOWSTEPSNAPSHOT ОПЕРАЦИИ =====

  /**
   * Находит снапшот шага по ID
   */
  async findStepById(id: string): Promise<FlowStepSnapshot | null> {
    try {
      const record = await this.prisma.flowStepSnapshot.findUnique({
        where: { id }
      })

      if (!record) {
        return null
      }

      return this.mapToStepSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при поиске снапшота шага', { id, error: error.message })
      throw new Error(`Не удалось найти снапшот шага: ${error.message}`)
    }
  }

  /**
   * Находит все снапшоты шагов для снапшота потока
   */
  async findStepsByFlowSnapshotId(flowSnapshotId: string): Promise<FlowStepSnapshot[]> {
    try {
      const records = await this.prisma.flowStepSnapshot.findMany({
        where: { flowSnapshotId },
        orderBy: { order: 'asc' }
      })

      return records.map(record => this.mapToStepSnapshotEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске снапшотов шагов', { flowSnapshotId, error: error.message })
      throw new Error(`Не удалось найти снапшоты шагов: ${error.message}`)
    }
  }

  /**
   * Создает новый снапшот шага
   */
  async createStepSnapshot(snapshot: FlowStepSnapshot): Promise<FlowStepSnapshot> {
    try {
      const data = snapshot.toData()
      
      const record = await this.prisma.flowStepSnapshot.create({
        data: {
          id: data.id,
          flowSnapshotId: data.flowSnapshotId,
          originalStepId: data.originalStepId,
          title: data.stepMeta.title,
          description: data.stepMeta.description,
          order: data.stepMeta.order,
          estimatedDuration: data.stepMeta.estimatedDuration,
          icon: data.stepMeta.icon,
          themeColor: data.stepMeta.themeColor,
          componentSnapshotIds: data.componentSnapshotIds,
          unlockConditions: data.unlockConditions,
          completionRequirements: data.completionRequirements,
          snapshotVersion: data.snapshotMeta.snapshotVersion,
          createdBy: data.snapshotMeta.createdBy,
          createdAt: data.snapshotMeta.createdAt,
          context: data.snapshotMeta.context || {}
        }
      })

      return this.mapToStepSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при создании снапшота шага', { stepId: snapshot.id, error: error.message })
      throw new Error(`Не удалось создать снапшот шага: ${error.message}`)
    }
  }

  /**
   * Обновляет снапшот шага (ограниченно)
   */
  async updateStepSnapshot(id: string, updates: Partial<FlowStepSnapshot>): Promise<FlowStepSnapshot> {
    try {
      const record = await this.prisma.flowStepSnapshot.update({
        where: { id },
        data: {
          context: (updates as any).context
        }
      })

      return this.mapToStepSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при обновлении снапшота шага', { id, error: error.message })
      throw new Error(`Не удалось обновить снапшот шага: ${error.message}`)
    }
  }

  /**
   * Удаляет снапшот шага
   */
  async deleteStepSnapshot(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Сначала удаляем все компоненты шага
        await tx.componentSnapshot.deleteMany({
          where: { stepSnapshotId: id }
        })

        // Затем удаляем сам шаг
        await tx.flowStepSnapshot.delete({
          where: { id }
        })
      })
    } catch (error) {
      logger.error('Ошибка при удалении снапшота шага', { id, error: error.message })
      throw new Error(`Не удалось удалить снапшот шага: ${error.message}`)
    }
  }

  // ===== COMPONENTSNAPSHOT ОПЕРАЦИИ =====

  /**
   * Находит снапшот компонента по ID
   */
  async findComponentById(id: string): Promise<ComponentSnapshot | null> {
    try {
      const record = await this.prisma.componentSnapshot.findUnique({
        where: { id }
      })

      if (!record) {
        return null
      }

      return this.mapToComponentSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при поиске снапшота компонента', { id, error: error.message })
      throw new Error(`Не удалось найти снапшот компонента: ${error.message}`)
    }
  }

  /**
   * Находит все снапшоты компонентов для снапшота шага
   */
  async findComponentsByStepSnapshotId(stepSnapshotId: string): Promise<ComponentSnapshot[]> {
    try {
      const records = await this.prisma.componentSnapshot.findMany({
        where: { stepSnapshotId },
        orderBy: { order: 'asc' }
      })

      return records.map(record => this.mapToComponentSnapshotEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске снапшотов компонентов для шага', { stepSnapshotId, error: error.message })
      throw new Error(`Не удалось найти снапшоты компонентов: ${error.message}`)
    }
  }

  /**
   * Находит все снапшоты компонентов для множества снапшотов шагов
   */
  async findComponentsByStepSnapshotIds(stepSnapshotIds: string[]): Promise<ComponentSnapshot[]> {
    try {
      const records = await this.prisma.componentSnapshot.findMany({
        where: { stepSnapshotId: { in: stepSnapshotIds } },
        orderBy: [
          { stepSnapshotId: 'asc' },
          { order: 'asc' }
        ]
      })

      return records.map(record => this.mapToComponentSnapshotEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске снапшотов компонентов', { stepSnapshotIds, error: error.message })
      throw new Error(`Не удалось найти снапшоты компонентов: ${error.message}`)
    }
  }

  /**
   * Создает новый снапшот компонента
   */
  async createComponentSnapshot(snapshot: ComponentSnapshot): Promise<ComponentSnapshot> {
    try {
      const data = snapshot.toData()
      
      const record = await this.prisma.componentSnapshot.create({
        data: {
          id: data.id,
          stepSnapshotId: data.stepSnapshotId,
          originalComponentId: data.originalComponentId,
          type: data.type,
          typeVersion: data.typeVersion,
          order: data.order,
          isRequired: data.isRequired,
          data: data.data, // JSON поле с содержимым компонента
          snapshotVersion: data.snapshotMeta.snapshotVersion,
          createdBy: data.snapshotMeta.createdBy,
          createdAt: data.snapshotMeta.createdAt,
          context: data.snapshotMeta.context || {}
        }
      })

      return this.mapToComponentSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при создании снапшота компонента', { componentId: snapshot.id, error: error.message })
      throw new Error(`Не удалось создать снапшот компонента: ${error.message}`)
    }
  }

  /**
   * Обновляет снапшот компонента (ограниченно)
   */
  async updateComponentSnapshot(id: string, updates: Partial<ComponentSnapshot>): Promise<ComponentSnapshot> {
    try {
      const record = await this.prisma.componentSnapshot.update({
        where: { id },
        data: {
          context: (updates as any).context
        }
      })

      return this.mapToComponentSnapshotEntity(record)
    } catch (error) {
      logger.error('Ошибка при обновлении снапшота компонента', { id, error: error.message })
      throw new Error(`Не удалось обновить снапшот компонента: ${error.message}`)
    }
  }

  /**
   * Удаляет снапшот компонента
   */
  async deleteComponentSnapshot(id: string): Promise<void> {
    try {
      await this.prisma.componentSnapshot.delete({
        where: { id }
      })
    } catch (error) {
      logger.error('Ошибка при удалении снапшота компонента', { id, error: error.message })
      throw new Error(`Не удалось удалить снапшот компонента: ${error.message}`)
    }
  }

  // ===== КОМПЛЕКСНЫЕ ОПЕРАЦИИ =====

  /**
   * Получает полную структуру снапшота (поток + шаги + компоненты)
   */
  async findFullSnapshotStructure(flowSnapshotId: string): Promise<{
    flowSnapshot: FlowSnapshot
    stepSnapshots: FlowStepSnapshot[]
    componentSnapshots: ComponentSnapshot[]
  } | null> {
    try {
      const flowSnapshot = await this.findById(flowSnapshotId)
      if (!flowSnapshot) {
        return null
      }

      const stepSnapshots = await this.findStepsByFlowSnapshotId(flowSnapshotId)
      const stepSnapshotIds = stepSnapshots.map(step => step.id)
      const componentSnapshots = await this.findComponentsByStepSnapshotIds(stepSnapshotIds)

      return {
        flowSnapshot,
        stepSnapshots,
        componentSnapshots
      }
    } catch (error) {
      logger.error('Ошибка при получении полной структуры снапшота', { flowSnapshotId, error: error.message })
      throw new Error(`Не удалось получить структуру снапшота: ${error.message}`)
    }
  }

  /**
   * Получает статистику снапшота
   */
  async getSnapshotStats(assignmentId: string): Promise<{
    totalSteps: number
    totalComponents: number
    createdAt: Date
    sizeInBytes: number
  }> {
    try {
      const flowSnapshot = await this.findByAssignmentId(assignmentId)
      if (!flowSnapshot) {
        throw new Error('Снапшот не найден')
      }

      const stepSnapshots = await this.findStepsByFlowSnapshotId(flowSnapshot.id)
      const stepSnapshotIds = stepSnapshots.map(step => step.id)
      const componentSnapshots = await this.findComponentsByStepSnapshotIds(stepSnapshotIds)

      // Приблизительный расчет размера
      const sizeInBytes = JSON.stringify({
        flowSnapshot: flowSnapshot.toData(),
        stepSnapshots: stepSnapshots.map(s => s.toData()),
        componentSnapshots: componentSnapshots.map(c => c.toData())
      }).length

      return {
        totalSteps: stepSnapshots.length,
        totalComponents: componentSnapshots.length,
        createdAt: flowSnapshot.createdAt,
        sizeInBytes
      }
    } catch (error) {
      logger.error('Ошибка при получении статистики снапшота', { assignmentId, error: error.message })
      throw new Error(`Не удалось получить статистику: ${error.message}`)
    }
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ МАППИНГА =====

  private mapToFlowSnapshotEntity(record: any): FlowSnapshot {
    return FlowSnapshot.fromData({
      id: record.id,
      assignmentId: record.assignmentId,
      originalFlowId: record.originalFlowId,
      flowMeta: {
        title: record.title,
        description: record.description,
        version: record.version,
        estimatedDuration: record.estimatedDuration,
        difficulty: record.difficulty,
        tags: record.tags || []
      },
      stepSnapshotIds: record.stepSnapshotIds || [],
      snapshotMeta: {
        createdAt: record.createdAt,
        createdBy: record.createdBy,
        snapshotVersion: record.snapshotVersion,
        context: record.context
      }
    })
  }

  private mapToStepSnapshotEntity(record: any): FlowStepSnapshot {
    return FlowStepSnapshot.fromData({
      id: record.id,
      flowSnapshotId: record.flowSnapshotId,
      originalStepId: record.originalStepId,
      stepMeta: {
        title: record.title,
        description: record.description,
        order: record.order,
        estimatedDuration: record.estimatedDuration,
        icon: record.icon,
        themeColor: record.themeColor
      },
      componentSnapshotIds: record.componentSnapshotIds || [],
      unlockConditions: record.unlockConditions || [],
      completionRequirements: record.completionRequirements || { type: 'ALL_COMPONENTS' },
      snapshotMeta: {
        createdAt: record.createdAt,
        createdBy: record.createdBy,
        snapshotVersion: record.snapshotVersion,
        context: record.context
      }
    })
  }

  private mapToComponentSnapshotEntity(record: any): ComponentSnapshot {
    return ComponentSnapshot.fromData({
      id: record.id,
      stepSnapshotId: record.stepSnapshotId,
      originalComponentId: record.originalComponentId,
      type: record.type,
      typeVersion: record.typeVersion,
      order: record.order,
      isRequired: record.isRequired,
      data: record.data, // JSON данные компонента
      snapshotMeta: {
        createdAt: record.createdAt,
        createdBy: record.createdBy,
        snapshotVersion: record.snapshotVersion,
        context: record.context
      }
    } as any)
  }
}