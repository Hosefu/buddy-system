/**
 * ComponentProgressRepository - репозиторий для работы с прогрессом компонентов
 * 
 * Обеспечивает доступ к данным прогресса пользователей по компонентам.
 * Поддерживает сложные запросы для аналитики и отчетности.
 * 
 * Работает с таблицей component_progress в PostgreSQL через Prisma.
 */

import { PrismaClient } from '@prisma/client'
import { ComponentProgress } from '../entities/ComponentProgress'
import { BaseRepository } from './base/BaseRepository'
import { logger } from '../../utils/logger'

// ===== ИНТЕРФЕЙСЫ =====

export interface IComponentProgressRepository {
  // Основные CRUD операции
  create(progress: ComponentProgress): Promise<ComponentProgress>
  findById(id: string): Promise<ComponentProgress | null>
  update(id: string, progress: ComponentProgress): Promise<ComponentProgress>
  delete(id: string): Promise<void>
  
  // Специализированные поисковые методы
  findByUserAndComponent(
    userId: string, 
    assignmentId: string, 
    componentSnapshotId: string
  ): Promise<ComponentProgress | null>
  
  findByUserAndAssignment(userId: string, assignmentId: string): Promise<ComponentProgress[]>
  findByAssignment(assignmentId: string): Promise<ComponentProgress[]>
  findByUser(userId: string): Promise<ComponentProgress[]>
  
  // Фильтрация по статусу
  findByStatus(
    assignmentId: string, 
    status: string
  ): Promise<ComponentProgress[]>
  
  findCompletedByUser(userId: string, assignmentId: string): Promise<ComponentProgress[]>
  findInProgressByUser(userId: string, assignmentId: string): Promise<ComponentProgress[]>
  
  // Аналитические запросы
  getProgressStats(assignmentId: string): Promise<{
    totalUsers: number
    completedComponents: number
    averageCompletionTime: number
    averageAttempts: number
  }>
  
  getUserProgressStats(userId: string, assignmentId: string): Promise<{
    totalComponents: number
    completedComponents: number
    totalTimeSpent: number
    totalAttempts: number
    averageTimePerComponent: number
  }>
  
  // Операции для отчетности
  findUsersWithProgress(assignmentId: string): Promise<Array<{
    userId: string
    completedComponents: number
    totalTimeSpent: number
    lastActivity: Date
  }>>
  
  findStrugglingUsers(assignmentId: string): Promise<Array<{
    userId: string
    strugglingComponents: number
    averageAttempts: number
    totalTimeSpent: number
  }>>
  
  // Временные запросы
  findProgressByDateRange(
    assignmentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComponentProgress[]>
  
  findRecentActivity(assignmentId: string, hours: number): Promise<ComponentProgress[]>
}

// ===== ОСНОВНОЙ КЛАСС РЕПОЗИТОРИЯ =====

export class ComponentProgressRepository extends BaseRepository implements IComponentProgressRepository {
  constructor(prisma: PrismaClient) {
    super(prisma)
  }

  // ===== ОСНОВНЫЕ CRUD ОПЕРАЦИИ =====

  /**
   * Создает новую запись прогресса
   */
  async create(progress: ComponentProgress): Promise<ComponentProgress> {
    try {
      const data = progress.toData()
      
      const record = await this.prisma.componentProgress.create({
        data: {
          id: data.id,
          userId: data.userId,
          assignmentId: data.assignmentId,
          componentSnapshotId: data.componentSnapshotId,
          status: data.status,
          componentType: data.componentType,
          progressData: data.progressData,
          createdAt: data.timestamps.createdAt,
          updatedAt: data.timestamps.updatedAt,
          startedAt: data.timestamps.startedAt,
          completedAt: data.timestamps.completedAt,
          version: data.metadata.version,
          platform: data.metadata.platform,
          ipAddress: data.metadata.ipAddress,
          additionalData: data.metadata.additionalData || {}
        }
      })

      logger.info('Прогресс компонента создан', { 
        progressId: record.id, 
        userId: data.userId,
        componentSnapshotId: data.componentSnapshotId 
      })

      return this.mapToEntity(record)
    } catch (error) {
      logger.error('Ошибка при создании прогресса компонента', { 
        progressId: progress.id, 
        error: error.message 
      })
      throw new Error(`Не удалось создать прогресс: ${error.message}`)
    }
  }

  /**
   * Находит прогресс по ID
   */
  async findById(id: string): Promise<ComponentProgress | null> {
    try {
      const record = await this.prisma.componentProgress.findUnique({
        where: { id }
      })

      if (!record) {
        return null
      }

      return this.mapToEntity(record)
    } catch (error) {
      logger.error('Ошибка при поиске прогресса по ID', { id, error: error.message })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  /**
   * Обновляет прогресс
   */
  async update(id: string, progress: ComponentProgress): Promise<ComponentProgress> {
    try {
      const data = progress.toData()
      
      const record = await this.prisma.componentProgress.update({
        where: { id },
        data: {
          status: data.status,
          progressData: data.progressData,
          updatedAt: data.timestamps.updatedAt,
          startedAt: data.timestamps.startedAt,
          completedAt: data.timestamps.completedAt,
          platform: data.metadata.platform,
          ipAddress: data.metadata.ipAddress,
          additionalData: data.metadata.additionalData || {}
        }
      })

      logger.info('Прогресс компонента обновлен', { 
        progressId: id, 
        status: data.status,
        completion: progress.getCompletionPercentage()
      })

      return this.mapToEntity(record)
    } catch (error) {
      logger.error('Ошибка при обновлении прогресса', { id, error: error.message })
      throw new Error(`Не удалось обновить прогресс: ${error.message}`)
    }
  }

  /**
   * Удаляет прогресс
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.componentProgress.delete({
        where: { id }
      })

      logger.info('Прогресс компонента удален', { progressId: id })
    } catch (error) {
      logger.error('Ошибка при удалении прогресса', { id, error: error.message })
      throw new Error(`Не удалось удалить прогресс: ${error.message}`)
    }
  }

  // ===== СПЕЦИАЛИЗИРОВАННЫЕ ПОИСКОВЫЕ МЕТОДЫ =====

  /**
   * Находит прогресс пользователя по конкретному компоненту
   */
  async findByUserAndComponent(
    userId: string,
    assignmentId: string,
    componentSnapshotId: string
  ): Promise<ComponentProgress | null> {
    try {
      const record = await this.prisma.componentProgress.findFirst({
        where: {
          userId,
          assignmentId,
          componentSnapshotId
        }
      })

      if (!record) {
        return null
      }

      return this.mapToEntity(record)
    } catch (error) {
      logger.error('Ошибка при поиске прогресса пользователя по компоненту', {
        userId,
        assignmentId,
        componentSnapshotId,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  /**
   * Находит весь прогресс пользователя по назначению
   */
  async findByUserAndAssignment(userId: string, assignmentId: string): Promise<ComponentProgress[]> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: {
          userId,
          assignmentId
        },
        orderBy: [
          { createdAt: 'asc' }
        ]
      })

      return records.map(record => this.mapToEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске прогресса пользователя по назначению', {
        userId,
        assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  /**
   * Находит весь прогресс по назначению (всех пользователей)
   */
  async findByAssignment(assignmentId: string): Promise<ComponentProgress[]> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: { assignmentId },
        orderBy: [
          { userId: 'asc' },
          { createdAt: 'asc' }
        ]
      })

      return records.map(record => this.mapToEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске прогресса по назначению', {
        assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  /**
   * Находит весь прогресс пользователя (по всем назначениям)
   */
  async findByUser(userId: string): Promise<ComponentProgress[]> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: { userId },
        orderBy: [
          { assignmentId: 'asc' },
          { createdAt: 'asc' }
        ]
      })

      return records.map(record => this.mapToEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске прогресса пользователя', {
        userId,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  // ===== ФИЛЬТРАЦИЯ ПО СТАТУСУ =====

  /**
   * Находит прогресс по статусу
   */
  async findByStatus(assignmentId: string, status: string): Promise<ComponentProgress[]> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: {
          assignmentId,
          status
        },
        orderBy: { updatedAt: 'desc' }
      })

      return records.map(record => this.mapToEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске прогресса по статусу', {
        assignmentId,
        status,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  /**
   * Находит завершенные компоненты пользователя
   */
  async findCompletedByUser(userId: string, assignmentId: string): Promise<ComponentProgress[]> {
    return this.findByUserAndAssignmentWithStatus(userId, assignmentId, 'COMPLETED')
  }

  /**
   * Находит компоненты в процессе прохождения
   */
  async findInProgressByUser(userId: string, assignmentId: string): Promise<ComponentProgress[]> {
    return this.findByUserAndAssignmentWithStatus(userId, assignmentId, 'IN_PROGRESS')
  }

  private async findByUserAndAssignmentWithStatus(
    userId: string,
    assignmentId: string,
    status: string
  ): Promise<ComponentProgress[]> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: {
          userId,
          assignmentId,
          status
        },
        orderBy: { updatedAt: 'desc' }
      })

      return records.map(record => this.mapToEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске прогресса по статусу пользователя', {
        userId,
        assignmentId,
        status,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  // ===== АНАЛИТИЧЕСКИЕ ЗАПРОСЫ =====

  /**
   * Получает общую статистику прогресса по назначению
   */
  async getProgressStats(assignmentId: string): Promise<{
    totalUsers: number
    completedComponents: number
    averageCompletionTime: number
    averageAttempts: number
  }> {
    try {
      const [totalUsers, completedComponents, progressRecords] = await Promise.all([
        this.prisma.componentProgress.findMany({
          where: { assignmentId },
          select: { userId: true },
          distinct: ['userId']
        }),
        this.prisma.componentProgress.count({
          where: {
            assignmentId,
            status: 'COMPLETED'
          }
        }),
        this.prisma.componentProgress.findMany({
          where: {
            assignmentId,
            status: 'COMPLETED'
          },
          select: {
            progressData: true
          }
        })
      ])

      // Подсчитываем среднее время и попытки
      let totalTime = 0
      let totalAttempts = 0
      let recordsWithTime = 0

      progressRecords.forEach(record => {
        const data = record.progressData as any
        
        // Извлекаем время в зависимости от типа компонента
        if (data.totalReadTime) {
          totalTime += data.totalReadTime
          recordsWithTime++
        } else if (data.totalWatchTime) {
          totalTime += data.totalWatchTime
          recordsWithTime++
        } else if (data.attemptHistory && Array.isArray(data.attemptHistory)) {
          const timeSpent = data.attemptHistory.reduce((sum: number, attempt: any) => 
            sum + (attempt.timeSpentSeconds || 0), 0)
          totalTime += timeSpent
          totalAttempts += data.attempts || 0
          recordsWithTime++
        }
      })

      return {
        totalUsers: totalUsers.length,
        completedComponents,
        averageCompletionTime: recordsWithTime > 0 ? Math.round(totalTime / recordsWithTime) : 0,
        averageAttempts: progressRecords.length > 0 ? Math.round(totalAttempts / progressRecords.length) : 0
      }
    } catch (error) {
      logger.error('Ошибка при получении статистики прогресса', {
        assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось получить статистику: ${error.message}`)
    }
  }

  /**
   * Получает статистику прогресса конкретного пользователя
   */
  async getUserProgressStats(userId: string, assignmentId: string): Promise<{
    totalComponents: number
    completedComponents: number
    totalTimeSpent: number
    totalAttempts: number
    averageTimePerComponent: number
  }> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: {
          userId,
          assignmentId
        }
      })

      const progressEntities = records.map(record => this.mapToEntity(record))
      
      const completedComponents = progressEntities.filter(p => p.isCompleted()).length
      const totalTimeSpent = progressEntities.reduce((sum, p) => sum + p.getTotalTimeSpent(), 0)
      const totalAttempts = progressEntities.reduce((sum, p) => sum + p.getAttemptCount(), 0)

      return {
        totalComponents: records.length,
        completedComponents,
        totalTimeSpent,
        totalAttempts,
        averageTimePerComponent: records.length > 0 ? Math.round(totalTimeSpent / records.length) : 0
      }
    } catch (error) {
      logger.error('Ошибка при получении статистики пользователя', {
        userId,
        assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось получить статистику: ${error.message}`)
    }
  }

  // ===== ОПЕРАЦИИ ДЛЯ ОТЧЕТНОСТИ =====

  /**
   * Находит пользователей с прогрессом по назначению
   */
  async findUsersWithProgress(assignmentId: string): Promise<Array<{
    userId: string
    completedComponents: number
    totalTimeSpent: number
    lastActivity: Date
  }>> {
    try {
      const result = await this.prisma.componentProgress.groupBy({
        by: ['userId'],
        where: { assignmentId },
        _count: {
          _all: true
        },
        _max: {
          updatedAt: true
        }
      })

      const usersWithProgress = await Promise.all(
        result.map(async (group) => {
          const userStats = await this.getUserProgressStats(group.userId, assignmentId)
          
          return {
            userId: group.userId,
            completedComponents: userStats.completedComponents,
            totalTimeSpent: userStats.totalTimeSpent,
            lastActivity: group._max.updatedAt || new Date()
          }
        })
      )

      return usersWithProgress
    } catch (error) {
      logger.error('Ошибка при получении пользователей с прогрессом', {
        assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось получить данные: ${error.message}`)
    }
  }

  /**
   * Находит пользователей с проблемами в прохождении
   */
  async findStrugglingUsers(assignmentId: string): Promise<Array<{
    userId: string
    strugglingComponents: number
    averageAttempts: number
    totalTimeSpent: number
  }>> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: { assignmentId }
      })

      const userProgress = new Map<string, ComponentProgress[]>()
      
      // Группируем по пользователям
      records.forEach(record => {
        const entity = this.mapToEntity(record)
        if (!userProgress.has(entity.userId)) {
          userProgress.set(entity.userId, [])
        }
        userProgress.get(entity.userId)!.push(entity)
      })

      // Анализируем каждого пользователя
      const strugglingUsers = []
      
      for (const [userId, progressList] of userProgress.entries()) {
        const strugglingComponents = progressList.filter(p => 
          p.getAttemptCount() > 2 || p.getTotalTimeSpent() > 600 // Более 2 попыток или 10 минут
        ).length

        if (strugglingComponents > 0) {
          const totalAttempts = progressList.reduce((sum, p) => sum + p.getAttemptCount(), 0)
          const averageAttempts = Math.round(totalAttempts / progressList.length)
          const totalTimeSpent = progressList.reduce((sum, p) => sum + p.getTotalTimeSpent(), 0)

          strugglingUsers.push({
            userId,
            strugglingComponents,
            averageAttempts,
            totalTimeSpent
          })
        }
      }

      return strugglingUsers.sort((a, b) => b.strugglingComponents - a.strugglingComponents)
    } catch (error) {
      logger.error('Ошибка при поиске проблемных пользователей', {
        assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось найти данные: ${error.message}`)
    }
  }

  // ===== ВРЕМЕННЫЕ ЗАПРОСЫ =====

  /**
   * Находит прогресс в диапазоне дат
   */
  async findProgressByDateRange(
    assignmentId: string,
    startDate: Date,
    endDate: Date
  ): Promise<ComponentProgress[]> {
    try {
      const records = await this.prisma.componentProgress.findMany({
        where: {
          assignmentId,
          updatedAt: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: { updatedAt: 'desc' }
      })

      return records.map(record => this.mapToEntity(record))
    } catch (error) {
      logger.error('Ошибка при поиске прогресса по датам', {
        assignmentId,
        startDate,
        endDate,
        error: error.message
      })
      throw new Error(`Не удалось найти прогресс: ${error.message}`)
    }
  }

  /**
   * Находит недавнюю активность
   */
  async findRecentActivity(assignmentId: string, hours: number): Promise<ComponentProgress[]> {
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000)
    const endDate = new Date()
    
    return this.findProgressByDateRange(assignmentId, startDate, endDate)
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ =====

  /**
   * Преобразует запись БД в доменную сущность
   */
  private mapToEntity(record: any): ComponentProgress {
    return ComponentProgress.fromData({
      id: record.id,
      userId: record.userId,
      assignmentId: record.assignmentId,
      componentSnapshotId: record.componentSnapshotId,
      status: record.status,
      progressData: record.progressData,
      componentType: record.componentType,
      timestamps: {
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        startedAt: record.startedAt,
        completedAt: record.completedAt
      },
      metadata: {
        version: record.version,
        platform: record.platform,
        ipAddress: record.ipAddress,
        additionalData: record.additionalData
      }
    })
  }
}