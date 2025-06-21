/**
 * FlowSnapshotRepository - репозиторий для работы со снапшотами потоков
 * 
 * Файл: packages/api/src/core/repositories/FlowSnapshotRepository.ts
 * 
 * Обеспечивает доступ к данным снапшотов потоков с учетом особенностей их структуры.
 * Поддерживает эффективные запросы для получения снапшотов со всеми связанными данными.
 */

import { FlowSnapshot, FlowSnapshotProps } from '../entities/FlowSnapshot'
import { BaseRepository } from './base/BaseRepository'

// ===== ИНТЕРФЕЙСЫ ДЛЯ ПОИСКА И ФИЛЬТРАЦИИ =====

export interface FlowSnapshotFilters {
  /** Фильтр по назначению */
  assignmentId?: string
  /** Фильтр по создателю */
  createdBy?: string
  /** Фильтр по оригинальному потоку */
  originalFlowId?: string
  /** Фильтр по диапазону размеров (в байтах) */
  sizeRange?: {
    min?: number
    max?: number
  }
  /** Фильтр по дате создания */
  createdDateRange?: {
    from?: Date
    to?: Date
  }
  /** Фильтр по версии снапшота */
  snapshotVersion?: string
  /** Фильтр по количеству шагов */
  stepCountRange?: {
    min?: number
    max?: number
  }
  /** Фильтр по количеству компонентов */
  componentCountRange?: {
    min?: number
    max?: number
  }
}

export interface FlowSnapshotSearchOptions {
  /** Включить связанные шаги */
  includeSteps?: boolean
  /** Включить связанные компоненты */
  includeComponents?: boolean
  /** Включить метаданные оригинального потока */
  includeOriginalFlow?: boolean
  /** Пагинация */
  pagination?: {
    limit: number
    offset: number
  }
  /** Сортировка */
  sorting?: {
    field: 'createdAt' | 'updatedAt' | 'size' | 'stepCount' | 'componentCount'
    direction: 'ASC' | 'DESC'
  }
}

export interface FlowSnapshotWithRelations {
  snapshot: FlowSnapshot
  stepSnapshots?: any[] // FlowStepSnapshot[]
  componentSnapshots?: any[] // ComponentSnapshot[]
  originalFlow?: any
  assignment?: any
}

// ===== ОСНОВНОЙ ИНТЕРФЕЙС РЕПОЗИТОРИЯ =====

export interface IFlowSnapshotRepository extends BaseRepository<FlowSnapshot> {
  
  // ===== ОСНОВНЫЕ CRUD ОПЕРАЦИИ =====
  
  /**
   * Находит снапшот по ID с возможностью включения связанных данных
   */
  findByIdWithRelations(
    id: string, 
    options?: FlowSnapshotSearchOptions
  ): Promise<FlowSnapshotWithRelations | null>

  /**
   * Находит снапшот по ID назначения
   */
  findByAssignmentId(assignmentId: string): Promise<FlowSnapshot | null>

  /**
   * Находит все снапшоты для пользователя
   */
  findByUserId(
    userId: string, 
    options?: FlowSnapshotSearchOptions
  ): Promise<FlowSnapshotWithRelations[]>

  /**
   * Находит снапшоты с фильтрацией
   */
  findByFilters(
    filters: FlowSnapshotFilters,
    options?: FlowSnapshotSearchOptions
  ): Promise<FlowSnapshotWithRelations[]>

  // ===== СПЕЦИАЛЬНЫЕ МЕТОДЫ ДЛЯ СНАПШОТОВ =====

  /**
   * Создает полный снапшот с транзакционным сохранением
   */
  createWithStepsAndComponents(
    snapshot: FlowSnapshot,
    stepSnapshots: any[], // FlowStepSnapshot[]
    componentSnapshots: any[] // ComponentSnapshot[]
  ): Promise<FlowSnapshot>

  /**
   * Проверяет целостность снапшота
   */
  validateSnapshotIntegrity(snapshotId: string): Promise<{
    isValid: boolean
    issues: string[]
    suggestions: string[]
  }>

  /**
   * Получает статистику по снапшотам
   */
  getSnapshotStatistics(filters?: FlowSnapshotFilters): Promise<{
    totalSnapshots: number
    totalSizeBytes: number
    averageSizeBytes: number
    averageStepCount: number
    averageComponentCount: number
    oldestSnapshot: Date | null
    newestSnapshot: Date | null
    snapshotsByVersion: Record<string, number>
  }>

  // ===== ОПЕРАЦИИ ДЛЯ ОЧИСТКИ И АРХИВИРОВАНИЯ =====

  /**
   * Находит старые или неиспользуемые снапшоты для архивирования
   */
  findSnapshotsForArchival(criteria: {
    olderThanDays: number
    unusedForDays?: number
    excludeActiveAssignments?: boolean
  }): Promise<FlowSnapshot[]>

  /**
   * Вычисляет размер снапшота в базе данных
   */
  calculateSnapshotSize(snapshotId: string): Promise<{
    totalSizeBytes: number
    snapshotSizeBytes: number
    stepsSizeBytes: number
    componentsSizeBytes: number
  }>

  // ===== МЕТОДЫ ДЛЯ ПРОИЗВОДИТЕЛЬНОСТИ =====

  /**
   * Предзагружает данные для множества снапшотов
   */
  preloadSnapshotsData(
    snapshotIds: string[],
    options?: FlowSnapshotSearchOptions
  ): Promise<Map<string, FlowSnapshotWithRelations>>

  /**
   * Получает базовую информацию о снапшотах без загрузки полного содержимого
   */
  getSnapshotsSummary(
    snapshotIds: string[]
  ): Promise<Array<{
    id: string
    assignmentId: string
    originalFlowId: string
    stepCount: number
    componentCount: number
    sizeBytes: number
    createdAt: Date
  }>>
}

// ===== РЕАЛИЗАЦИЯ РЕПОЗИТОРИЯ =====

export class FlowSnapshotRepository implements IFlowSnapshotRepository {
  
  constructor(
    private readonly prisma: any, // PrismaClient
    private readonly logger: any
  ) {}

  // ===== БАЗОВЫЕ CRUD ОПЕРАЦИИ =====

  async create(snapshot: FlowSnapshot): Promise<FlowSnapshot> {
    try {
      this.logger.debug('Создание снапшота потока', { snapshotId: snapshot.id })

      const data = this.mapToDatabase(snapshot)
      const created = await this.prisma.flowSnapshot.create({ data })
      
      this.logger.info('Снапшот потока создан', { 
        snapshotId: snapshot.id,
        assignmentId: snapshot.assignmentId 
      })

      return this.mapToDomain(created)
    } catch (error) {
      this.logger.error('Ошибка создания снапшота потока', error, { snapshotId: snapshot.id })
      throw error
    }
  }

  async findById(id: string): Promise<FlowSnapshot | null> {
    try {
      const snapshot = await this.prisma.flowSnapshot.findUnique({
        where: { id }
      })

      return snapshot ? this.mapToDomain(snapshot) : null
    } catch (error) {
      this.logger.error('Ошибка поиска снапшота по ID', error, { snapshotId: id })
      throw error
    }
  }

  async update(id: string, snapshot: FlowSnapshot): Promise<FlowSnapshot> {
    try {
      this.logger.debug('Обновление снапшота потока', { snapshotId: id })

      const data = this.mapToDatabase(snapshot)
      const updated = await this.prisma.flowSnapshot.update({
        where: { id },
        data
      })

      this.logger.info('Снапшот потока обновлен', { snapshotId: id })
      return this.mapToDomain(updated)
    } catch (error) {
      this.logger.error('Ошибка обновления снапшота', error, { snapshotId: id })
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    try {
      this.logger.debug('Удаление снапшота потока', { snapshotId: id })

      // В транзакции удаляем снапшот со всеми связанными данными
      await this.prisma.$transaction(async (tx: any) => {
        // Сначала удаляем компоненты
        await tx.componentSnapshot.deleteMany({
          where: {
            stepSnapshot: {
              flowSnapshotId: id
            }
          }
        })

        // Затем удаляем шаги
        await tx.flowStepSnapshot.deleteMany({
          where: { flowSnapshotId: id }
        })

        // Наконец удаляем сам снапшот
        await tx.flowSnapshot.delete({
          where: { id }
        })
      })

      this.logger.info('Снапшот потока удален', { snapshotId: id })
    } catch (error) {
      this.logger.error('Ошибка удаления снапшота', error, { snapshotId: id })
      throw error
    }
  }

  async findAll(): Promise<FlowSnapshot[]> {
    try {
      const snapshots = await this.prisma.flowSnapshot.findMany({
        orderBy: { createdAt: 'desc' }
      })

      return snapshots.map(this.mapToDomain)
    } catch (error) {
      this.logger.error('Ошибка получения всех снапшотов', error)
      throw error
    }
  }

  // ===== СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ =====

  async findByIdWithRelations(
    id: string, 
    options: FlowSnapshotSearchOptions = {}
  ): Promise<FlowSnapshotWithRelations | null> {
    try {
      const include: any = {}

      if (options.includeSteps) {
        include.stepSnapshots = {
          orderBy: { originalOrder: 'asc' },
          ...(options.includeComponents && {
            include: {
              componentSnapshots: {
                orderBy: { originalOrder: 'asc' }
              }
            }
          })
        }
      }

      if (options.includeOriginalFlow) {
        include.assignment = {
          include: {
            flow: true
          }
        }
      }

      const snapshot = await this.prisma.flowSnapshot.findUnique({
        where: { id },
        include
      })

      if (!snapshot) return null

      return {
        snapshot: this.mapToDomain(snapshot),
        stepSnapshots: snapshot.stepSnapshots || [],
        componentSnapshots: options.includeComponents 
          ? snapshot.stepSnapshots?.flatMap((step: any) => step.componentSnapshots || []) || []
          : undefined,
        originalFlow: snapshot.assignment?.flow,
        assignment: snapshot.assignment
      }
    } catch (error) {
      this.logger.error('Ошибка поиска снапшота с связями', error, { snapshotId: id })
      throw error
    }
  }

  async findByAssignmentId(assignmentId: string): Promise<FlowSnapshot | null> {
    try {
      const snapshot = await this.prisma.flowSnapshot.findUnique({
        where: { assignmentId }
      })

      return snapshot ? this.mapToDomain(snapshot) : null
    } catch (error) {
      this.logger.error('Ошибка поиска снапшота по назначению', error, { assignmentId })
      throw error
    }
  }

  async findByUserId(
    userId: string, 
    options: FlowSnapshotSearchOptions = {}
  ): Promise<FlowSnapshotWithRelations[]> {
    try {
      const include: any = {}

      if (options.includeSteps) {
        include.stepSnapshots = {
          orderBy: { originalOrder: 'asc' }
        }
      }

      const snapshots = await this.prisma.flowSnapshot.findMany({
        where: {
          assignment: {
            userId
          }
        },
        include: {
          assignment: true,
          ...include
        },
        ...(options.pagination && {
          skip: options.pagination.offset,
          take: options.pagination.limit
        }),
        ...(options.sorting && {
          orderBy: this.buildOrderBy(options.sorting)
        })
      })

      return snapshots.map((snapshot: any) => ({
        snapshot: this.mapToDomain(snapshot),
        stepSnapshots: snapshot.stepSnapshots,
        assignment: snapshot.assignment
      }))
    } catch (error) {
      this.logger.error('Ошибка поиска снапшотов пользователя', error, { userId })
      throw error
    }
  }

  async createWithStepsAndComponents(
    snapshot: FlowSnapshot,
    stepSnapshots: any[],
    componentSnapshots: any[]
  ): Promise<FlowSnapshot> {
    try {
      this.logger.debug('Создание полного снапшота с шагами и компонентами', {
        snapshotId: snapshot.id,
        stepsCount: stepSnapshots.length,
        componentsCount: componentSnapshots.length
      })

      const result = await this.prisma.$transaction(async (tx: any) => {
        // 1. Создаем основной снапшот
        const snapshotData = this.mapToDatabase(snapshot)
        const createdSnapshot = await tx.flowSnapshot.create({ data: snapshotData })

        // 2. Создаем снапшоты шагов
        const stepSnapshotData = stepSnapshots.map(step => ({
          ...step,
          flowSnapshotId: snapshot.id
        }))
        
        await tx.flowStepSnapshot.createMany({
          data: stepSnapshotData
        })

        // 3. Создаем снапшоты компонентов
        const componentSnapshotData = componentSnapshots.map(component => ({
          ...component
        }))
        
        await tx.componentSnapshot.createMany({
          data: componentSnapshotData
        })

        return createdSnapshot
      })

      this.logger.info('Полный снапшот создан успешно', {
        snapshotId: snapshot.id,
        stepsCount: stepSnapshots.length,
        componentsCount: componentSnapshots.length
      })

      return this.mapToDomain(result)
    } catch (error) {
      this.logger.error('Ошибка создания полного снапшота', error, {
        snapshotId: snapshot.id
      })
      throw error
    }
  }

  async validateSnapshotIntegrity(snapshotId: string): Promise<{
    isValid: boolean
    issues: string[]
    suggestions: string[]
  }> {
    try {
      const issues: string[] = []
      const suggestions: string[] = []

      // Получаем снапшот с полными данными
      const snapshotData = await this.findByIdWithRelations(snapshotId, {
        includeSteps: true,
        includeComponents: true
      })

      if (!snapshotData) {
        issues.push('Снапшот не найден')
        return { isValid: false, issues, suggestions }
      }

      const { snapshot, stepSnapshots, componentSnapshots } = snapshotData

      // Проверяем соответствие количества шагов
      if (snapshot.metadata.totalSteps !== (stepSnapshots?.length || 0)) {
        issues.push(`Количество шагов в метаданных (${snapshot.metadata.totalSteps}) не соответствует фактическому (${stepSnapshots?.length || 0})`)
        suggestions.push('Обновите метаданные снапшота')
      }

      // Проверяем соответствие количества компонентов
      if (snapshot.metadata.totalComponents !== (componentSnapshots?.length || 0)) {
        issues.push(`Количество компонентов в метаданных (${snapshot.metadata.totalComponents}) не соответствует фактическому (${componentSnapshots?.length || 0})`)
        suggestions.push('Обновите метаданные снапшота')
      }

      // Проверяем связи между шагами и компонентами
      const stepIds = stepSnapshots?.map(step => step.id) || []
      const orphanedComponents = componentSnapshots?.filter(comp => 
        !stepIds.includes(comp.stepSnapshotId)
      ) || []

      if (orphanedComponents.length > 0) {
        issues.push(`Найдено ${orphanedComponents.length} компонентов без связанных шагов`)
        suggestions.push('Удалите или переназначьте осиротевшие компоненты')
      }

      // Проверяем хеш содержимого (если реализована проверка хешей)
      // TODO: Реализовать проверку contentHash

      return {
        isValid: issues.length === 0,
        issues,
        suggestions
      }
    } catch (error) {
      this.logger.error('Ошибка валидации целостности снапшота', error, { snapshotId })
      throw error
    }
  }

  async getSnapshotStatistics(filters: FlowSnapshotFilters = {}): Promise<{
    totalSnapshots: number
    totalSizeBytes: number
    averageSizeBytes: number
    averageStepCount: number
    averageComponentCount: number
    oldestSnapshot: Date | null
    newestSnapshot: Date | null
    snapshotsByVersion: Record<string, number>
  }> {
    try {
      const where = this.buildWhereClause(filters)

      const stats = await this.prisma.flowSnapshot.aggregate({
        where,
        _count: { id: true },
        _sum: { 
          sizeBytes: true,
          totalSteps: true,
          totalComponents: true
        },
        _avg: {
          sizeBytes: true,
          totalSteps: true,
          totalComponents: true
        },
        _min: { createdAt: true },
        _max: { createdAt: true }
      })

      // Получаем статистику по версиям
      const versionStats = await this.prisma.flowSnapshot.groupBy({
        where,
        by: ['snapshotVersion'],
        _count: { snapshotVersion: true }
      })

      const snapshotsByVersion = versionStats.reduce((acc: Record<string, number>, item: any) => {
        acc[item.snapshotVersion] = item._count.snapshotVersion
        return acc
      }, {})

      return {
        totalSnapshots: stats._count.id,
        totalSizeBytes: stats._sum.sizeBytes || 0,
        averageSizeBytes: stats._avg.sizeBytes || 0,
        averageStepCount: stats._avg.totalSteps || 0,
        averageComponentCount: stats._avg.totalComponents || 0,
        oldestSnapshot: stats._min.createdAt,
        newestSnapshot: stats._max.createdAt,
        snapshotsByVersion
      }
    } catch (error) {
      this.logger.error('Ошибка получения статистики снапшотов', error)
      throw error
    }
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  private mapToDomain(data: any): FlowSnapshot {
    const props: FlowSnapshotProps = {
      id: data.id,
      assignmentId: data.assignmentId,
      stepSnapshotIds: data.stepSnapshotIds || [],
      originalFlowReference: {
        originalFlowId: data.originalFlowId,
        originalFlowVersion: data.originalFlowVersion,
        originalFlowTitle: data.originalFlowTitle,
        originalFlowDescription: data.originalFlowDescription
      },
      metadata: {
        snapshotVersion: data.snapshotVersion,
        sizeBytes: data.sizeBytes,
        creationTimeMs: data.creationTimeMs,
        totalSteps: data.totalSteps,
        totalComponents: data.totalComponents,
        contentHash: data.contentHash
      },
      context: data.context,
      createdBy: data.createdBy,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    }

    return new FlowSnapshot(props)
  }

  private mapToDatabase(snapshot: FlowSnapshot): any {
    return {
      id: snapshot.id,
      assignmentId: snapshot.assignmentId,
      stepSnapshotIds: snapshot.stepSnapshotIds,
      originalFlowId: snapshot.originalFlowReference.originalFlowId,
      originalFlowVersion: snapshot.originalFlowReference.originalFlowVersion,
      originalFlowTitle: snapshot.originalFlowReference.originalFlowTitle,
      originalFlowDescription: snapshot.originalFlowReference.originalFlowDescription,
      snapshotVersion: snapshot.metadata.snapshotVersion,
      sizeBytes: snapshot.metadata.sizeBytes,
      creationTimeMs: snapshot.metadata.creationTimeMs,
      totalSteps: snapshot.metadata.totalSteps,
      totalComponents: snapshot.metadata.totalComponents,
      contentHash: snapshot.metadata.contentHash,
      context: snapshot.context,
      createdBy: snapshot.createdBy,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt
    }
  }

  private buildWhereClause(filters: FlowSnapshotFilters): any {
    const where: any = {}

    if (filters.assignmentId) {
      where.assignmentId = filters.assignmentId
    }

    if (filters.createdBy) {
      where.createdBy = filters.createdBy
    }

    if (filters.originalFlowId) {
      where.originalFlowId = filters.originalFlowId
    }

    if (filters.snapshotVersion) {
      where.snapshotVersion = filters.snapshotVersion
    }

    if (filters.sizeRange) {
      where.sizeBytes = {}
      if (filters.sizeRange.min !== undefined) {
        where.sizeBytes.gte = filters.sizeRange.min
      }
      if (filters.sizeRange.max !== undefined) {
        where.sizeBytes.lte = filters.sizeRange.max
      }
    }

    if (filters.createdDateRange) {
      where.createdAt = {}
      if (filters.createdDateRange.from) {
        where.createdAt.gte = filters.createdDateRange.from
      }
      if (filters.createdDateRange.to) {
        where.createdAt.lte = filters.createdDateRange.to
      }
    }

    return where
  }

  private buildOrderBy(sorting: FlowSnapshotSearchOptions['sorting']): any {
    if (!sorting) return { createdAt: 'desc' }

    const field = sorting.field === 'size' ? 'sizeBytes' : 
                 sorting.field === 'stepCount' ? 'totalSteps' :
                 sorting.field === 'componentCount' ? 'totalComponents' :
                 sorting.field

    return { [field]: sorting.direction.toLowerCase() }
  }

  // TODO: Реализовать остальные методы интерфейса
  async findByFilters(filters: FlowSnapshotFilters, options?: FlowSnapshotSearchOptions): Promise<FlowSnapshotWithRelations[]> {
    // TODO: Реализация
    throw new Error('Method not implemented.')
  }

  async findSnapshotsForArchival(criteria: any): Promise<FlowSnapshot[]> {
    // TODO: Реализация  
    throw new Error('Method not implemented.')
  }

  async calculateSnapshotSize(snapshotId: string): Promise<any> {
    // TODO: Реализация
    throw new Error('Method not implemented.')
  }

  async preloadSnapshotsData(snapshotIds: string[], options?: FlowSnapshotSearchOptions): Promise<Map<string, FlowSnapshotWithRelations>> {
    // TODO: Реализация
    throw new Error('Method not implemented.')
  }

  async getSnapshotsSummary(snapshotIds: string[]): Promise<any[]> {
    // TODO: Реализация
    throw new Error('Method not implemented.')
  }
}