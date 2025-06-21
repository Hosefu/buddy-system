/**
 * Репозиторий для работы с назначениями потоков
 * 
 * Управляет всем жизненным циклом назначений:
 * - Создание назначений и снапшотов
 * - Отслеживание прогресса и статусов
 * - Управление дедлайнами и паузами
 * - Поиск назначений по различным критериям
 * - Аналитика и статистика
 */

import { 
    FlowAssignment, 
    AssignmentStatus, 
    FlowSnapshot,
    FlowStepSnapshot,
    ComponentSnapshot,
    FlowProgress,
    Prisma 
  } from '@buddybot/database'
  import { BaseRepository, RepositoryOptions, PaginationParams, RepositoryError, RepositoryErrorType } from './base/BaseRepository'
  import { 
    FlowAssignment as FlowAssignmentEntity, 
    CreateFlowAssignmentInput, 
    UpdateFlowAssignmentInput,
    DeadlineCheck 
  } from '../entities/FlowAssignment'
  import { addDays, subDays, isAfter, isBefore } from 'date-fns'
  
  /**
   * Интерфейс для фильтрации назначений
   */
  export interface FlowAssignmentFilter {
    userId?: string
    buddyIds?: string[]
    status?: AssignmentStatus[]
    isOverdue?: boolean
    isAtRisk?: boolean
    flowId?: string
    dateRange?: {
      from: Date
      to: Date
    }
  }
  
  /**
   * Статистика назначений
   */
  export interface AssignmentStats {
    total: number
    byStatus: Record<AssignmentStatus, number>
    overdue: number
    atRisk: number
    avgCompletionDays: number
    completionRate: number
    thisMonth: {
      assigned: number
      completed: number
      started: number
    }
  }
  
  /**
   * Назначение со снапшотом и прогрессом
   */
  export interface AssignmentWithDetails extends FlowAssignmentEntity {
    flowSnapshot: FlowSnapshotData
    flowProgress: FlowProgressData | null
    user: UserBasicData
    buddies: UserBasicData[]
  }
  
  /**
   * Данные снапшота потока
   */
  export interface FlowSnapshotData {
    id: string
    title: string
    description: string
    originalFlowId: string
    stepsCount: number
    steps: FlowStepSnapshotData[]
  }
  
  /**
   * Данные снапшота этапа
   */
  export interface FlowStepSnapshotData {
    id: string
    title: string
    description: string
    order: number
    isRequired: boolean
    componentsCount: number
    components: ComponentSnapshotData[]
  }
  
  /**
   * Данные снапшота компонента
   */
  export interface ComponentSnapshotData {
    id: string
    type: string
    typeVersion: string
    order: number
    isRequired: boolean
    data: any
  }
  
  /**
   * Данные прогресса потока
   */
  export interface FlowProgressData {
    id: string
    status: string
    currentStepOrder: number
    completedSteps: number
    totalSteps: number
    percentage: number
    timeSpent: number
    lastActivity: Date | null
  }
  
  /**
   * Базовые данные пользователя
   */
  export interface UserBasicData {
    id: string
    name: string
    telegramUsername: string | null
    avatarUrl: string | null
  }
  
  /**
   * Репозиторий для работы с назначениями потоков
   * 
   * Центральный компонент для управления процессом обучения.
   * Обеспечивает создание снапшотов, отслеживание прогресса
   * и управление всем жизненным циклом назначений.
   */
  export class FlowAssignmentRepository extends BaseRepository<FlowAssignmentEntity, CreateFlowAssignmentInput, UpdateFlowAssignmentInput> {
    constructor() {
      super('flowAssignment')
    }
  
    /**
     * Создает назначение потока с автоматическим созданием снапшота
     */
    async createWithSnapshot(
      input: CreateFlowAssignmentInput & { flowId: string },
      options?: RepositoryOptions
    ): Promise<AssignmentWithDetails> {
      return this.transaction(async (tx) => {
        // 1. Получаем оригинальный поток со всеми данными
        const flow = await tx.flow.findUnique({
          where: { id: input.flowId },
          include: {
            steps: {
              include: {
                components: true
              },
              orderBy: { order: 'asc' }
            },
            settings: true
          }
        })
  
        if (!flow) {
          throw new RepositoryError(
            RepositoryErrorType.NOT_FOUND,
            'Поток для назначения не найден'
          )
        }
  
        if (!flow.isActive) {
          throw new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Нельзя назначить неактивный поток'
          )
        }
  
        if (flow.stepsCount === 0) {
          throw new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Нельзя назначить поток без этапов'
          )
        }
  
        // 2. Создаем снапшот потока
        const flowSnapshot = await tx.flowSnapshot.create({
          data: {
            title: flow.title,
            description: flow.description,
            originalFlowId: flow.id,
            originalFlowVersion: flow.version,
            stepsCount: flow.stepsCount
          }
        })
  
        // 3. Создаем снапшоты этапов и компонентов
        const stepSnapshots: FlowStepSnapshotData[] = []
        for (const step of flow.steps) {
          const stepSnapshot = await tx.flowStepSnapshot.create({
            data: {
              title: step.title,
              description: step.description,
              order: step.order,
              isRequired: step.isRequired,
              flowSnapshotId: flowSnapshot.id,
              componentsCount: step.componentsCount
            }
          })
  
          const componentSnapshots: ComponentSnapshotData[] = []
          for (const component of step.components) {
            const componentSnapshot = await tx.componentSnapshot.create({
              data: {
                type: component.type,
                typeVersion: component.typeVersion,
                order: component.order,
                isRequired: component.isRequired,
                data: component.data,
                stepSnapshotId: stepSnapshot.id
              }
            })
  
            componentSnapshots.push({
              id: componentSnapshot.id,
              type: componentSnapshot.type,
              typeVersion: componentSnapshot.typeVersion,
              order: componentSnapshot.order,
              isRequired: componentSnapshot.isRequired,
              data: componentSnapshot.data
            })
          }
  
          stepSnapshots.push({
            id: stepSnapshot.id,
            title: stepSnapshot.title,
            description: stepSnapshot.description,
            order: stepSnapshot.order,
            isRequired: stepSnapshot.isRequired,
            componentsCount: stepSnapshot.componentsCount,
            components: componentSnapshots
          })
        }
  
        // 4. Создаем назначение
        const assignment = await tx.flowAssignment.create({
          data: {
            userId: input.userId,
            flowSnapshotId: flowSnapshot.id,
            deadline: input.deadline || addDays(new Date(), input.customDeadlineDays || 7),
            buddyIds: input.buddyIds
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                telegramUsername: true,
                avatarUrl: true
              }
            }
          }
        })
  
        // 5. Создаем запись прогресса
        const flowProgress = await tx.flowProgress.create({
          data: {
            assignmentId: assignment.id,
            totalSteps: flow.stepsCount,
            currentStepOrder: 1
          }
        })
  
        // 6. Получаем данные наставников
        const buddies = await tx.user.findMany({
          where: {
            id: { in: input.buddyIds }
          },
          select: {
            id: true,
            name: true,
            telegramUsername: true,
            avatarUrl: true
          }
        })
  
        return {
          ...this.mapToEntity(assignment),
          flowSnapshot: {
            id: flowSnapshot.id,
            title: flowSnapshot.title,
            description: flowSnapshot.description,
            originalFlowId: flowSnapshot.originalFlowId,
            stepsCount: flowSnapshot.stepsCount,
            steps: stepSnapshots
          },
          flowProgress: {
            id: flowProgress.id,
            status: flowProgress.status,
            currentStepOrder: flowProgress.currentStepOrder,
            completedSteps: flowProgress.completedSteps,
            totalSteps: flowProgress.totalSteps,
            percentage: flowProgress.percentage,
            timeSpent: flowProgress.timeSpent,
            lastActivity: flowProgress.lastActivity
          },
          user: assignment.user,
          buddies
        }
      })
    }
  
    /**
     * Получает назначение с полными деталями
     */
    async findByIdWithDetails(id: string, options?: RepositoryOptions): Promise<AssignmentWithDetails | null> {
      try {
        const model = this.getModel(options?.transaction)
        const result = await model.findUnique({
          where: { id },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                telegramUsername: true,
                avatarUrl: true
              }
            },
            flowSnapshot: {
              include: {
                steps: {
                  include: {
                    components: {
                      orderBy: { order: 'asc' }
                    }
                  },
                  orderBy: { order: 'asc' }
                }
              }
            },
            flowProgress: true
          }
        })
  
        if (!result) return null
  
        // Получаем данные наставников
        const buddies = await this.db.user.findMany({
          where: {
            id: { in: result.buddyIds }
          },
          select: {
            id: true,
            name: true,
            telegramUsername: true,
            avatarUrl: true
          }
        })
  
        return {
          ...this.mapToEntity(result),
          flowSnapshot: {
            id: result.flowSnapshot.id,
            title: result.flowSnapshot.title,
            description: result.flowSnapshot.description,
            originalFlowId: result.flowSnapshot.originalFlowId,
            stepsCount: result.flowSnapshot.stepsCount,
            steps: result.flowSnapshot.steps.map(step => ({
              id: step.id,
              title: step.title,
              description: step.description,
              order: step.order,
              isRequired: step.isRequired,
              componentsCount: step.componentsCount,
              components: step.components.map(comp => ({
                id: comp.id,
                type: comp.type,
                typeVersion: comp.typeVersion,
                order: comp.order,
                isRequired: comp.isRequired,
                data: comp.data
              }))
            }))
          },
          flowProgress: result.flowProgress ? {
            id: result.flowProgress.id,
            status: result.flowProgress.status,
            currentStepOrder: result.flowProgress.currentStepOrder,
            completedSteps: result.flowProgress.completedSteps,
            totalSteps: result.flowProgress.totalSteps,
            percentage: result.flowProgress.percentage,
            timeSpent: result.flowProgress.timeSpent,
            lastActivity: result.flowProgress.lastActivity
          } : null,
          user: result.user,
          buddies
        }
      } catch (error) {
        throw this.handleDatabaseError(error)
      }
    }
  
    /**
     * Находит назначения пользователя
     */
    async findByUser(
      userId: string,
      filter?: Omit<FlowAssignmentFilter, 'userId'>,
      pagination?: PaginationParams,
      options?: RepositoryOptions
    ) {
      const where: Prisma.FlowAssignmentWhereInput = {
        userId,
        ...this.buildAssignmentFilterWhere(filter)
      }
  
      return this.findManyPaginated(
        where,
        pagination,
        {
          ...options,
          include: this.getBasicInclude(),
          orderBy: [
            { status: 'asc' },
            { deadline: 'asc' },
            { assignedAt: 'desc' }
          ]
        }
      )
    }
  
    /**
     * Находит назначения наставника
     */
    async findByBuddy(
      buddyId: string,
      filter?: Omit<FlowAssignmentFilter, 'buddyIds'>,
      pagination?: PaginationParams,
      options?: RepositoryOptions
    ) {
      const where: Prisma.FlowAssignmentWhereInput = {
        buddyIds: {
          has: buddyId
        },
        ...this.buildAssignmentFilterWhere(filter)
      }
  
      return this.findManyPaginated(
        where,
        pagination,
        {
          ...options,
          include: this.getBasicInclude(),
          orderBy: [
            { isOverdue: 'desc' },
            { deadline: 'asc' },
            { status: 'asc' }
          ]
        }
      )
    }
  
    /**
     * Находит просроченные назначения
     */
    async findOverdue(
      pagination?: PaginationParams,
      options?: RepositoryOptions
    ) {
      const where: Prisma.FlowAssignmentWhereInput = {
        OR: [
          { isOverdue: true },
          {
            deadline: { lt: new Date() },
            status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
          }
        ]
      }
  
      return this.findManyPaginated(
        where,
        pagination,
        {
          ...options,
          include: this.getBasicInclude(),
          orderBy: { deadline: 'asc' }
        }
      )
    }
  
    /**
     * Находит назначения в зоне риска (приближается дедлайн)
     */
    async findAtRisk(
      daysBeforeDeadline: number = 2,
      pagination?: PaginationParams,
      options?: RepositoryOptions
    ) {
      const riskDate = addDays(new Date(), daysBeforeDeadline)
      
      const where: Prisma.FlowAssignmentWhereInput = {
        deadline: {
          gte: new Date(),
          lte: riskDate
        },
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        isOverdue: false
      }
  
      return this.findManyPaginated(
        where,
        pagination,
        {
          ...options,
          include: this.getBasicInclude(),
          orderBy: { deadline: 'asc' }
        }
      )
    }
  
    /**
     * Находит неактивные назначения (долго нет активности)
     */
    async findInactive(
      daysSinceActivity: number = 3,
      pagination?: PaginationParams,
      options?: RepositoryOptions
    ) {
      const cutoffDate = subDays(new Date(), daysSinceActivity)
      
      const where: Prisma.FlowAssignmentWhereInput = {
        status: 'IN_PROGRESS',
        OR: [
          { lastActivity: null },
          { lastActivity: { lt: cutoffDate } }
        ]
      }
  
      return this.findManyPaginated(
        where,
        pagination,
        {
          ...options,
          include: this.getBasicInclude(),
          orderBy: { lastActivity: 'asc' }
        }
      )
    }
  
    /**
     * Обновляет статус назначения
     */
    async updateStatus(
      assignmentId: string,
      status: AssignmentStatus,
      metadata?: Record<string, any>,
      options?: RepositoryOptions
    ): Promise<FlowAssignmentEntity> {
      const updateData: any = { status }
  
      // Устанавливаем дополнительные поля в зависимости от статуса
      switch (status) {
        case AssignmentStatus.IN_PROGRESS:
          updateData.startedAt = new Date()
          updateData.lastActivity = new Date()
          break
        case AssignmentStatus.COMPLETED:
          updateData.completedAt = new Date()
          updateData.lastActivity = new Date()
          // Сбрасываем паузу если была
          updateData.pausedAt = null
          updateData.pausedById = null
          updateData.pauseReason = null
          break
        case AssignmentStatus.PAUSED:
          updateData.pausedAt = new Date()
          if (metadata?.pausedById) updateData.pausedById = metadata.pausedById
          if (metadata?.pauseReason) updateData.pauseReason = metadata.pauseReason
          break
        case AssignmentStatus.CANCELLED:
          updateData.pausedAt = new Date()
          if (metadata?.cancelledById) updateData.pausedById = metadata.cancelledById
          if (metadata?.reason) updateData.pauseReason = metadata.reason
          break
      }
  
      return this.update(assignmentId, updateData, options)
    }
  
    /**
     * Обновляет дедлайн назначения
     */
    async updateDeadline(
      assignmentId: string,
      newDeadline: Date,
      extendedById: string,
      reason: string,
      options?: RepositoryOptions
    ): Promise<FlowAssignmentEntity> {
      return this.transaction(async (tx) => {
        // Обновляем назначение
        const assignment = await this.update(
          assignmentId,
          { 
            deadline: newDeadline,
            isOverdue: false // Сбрасываем флаг просрочки
          },
          { ...options, transaction: tx }
        )
  
        // Записываем корректировку дедлайна
        await tx.deadlineAdjustment.create({
          data: {
            assignmentId,
            type: 'BUDDY_EXTENSION',
            reason,
            daysDelta: Math.ceil((newDeadline.getTime() - assignment.deadline.getTime()) / (1000 * 60 * 60 * 24)),
            adjustedById: extendedById
          }
        })
  
        return assignment
      })
    }
  
    /**
     * Обновляет время прохождения
     */
    async addTimeSpent(
      assignmentId: string,
      additionalSeconds: number,
      options?: RepositoryOptions
    ): Promise<void> {
      try {
        const model = this.getModel(options?.transaction)
        await model.update({
          where: { id: assignmentId },
          data: {
            timeSpent: { increment: additionalSeconds },
            lastActivity: new Date()
          }
        })
      } catch (error) {
        throw this.handleDatabaseError(error)
      }
    }
  
    /**
     * Проверяет и обновляет просроченные назначения
     */
    async updateOverdueStatus(options?: RepositoryOptions): Promise<number> {
      try {
        const model = this.getModel(options?.transaction)
        const result = await model.updateMany({
          where: {
            deadline: { lt: new Date() },
            status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
            isOverdue: false
          },
          data: {
            isOverdue: true
          }
        })
  
        return result.count
      } catch (error) {
        throw this.handleDatabaseError(error)
      }
    }
  
    /**
     * Получает статистику назначений
     */
    async getStats(filter?: FlowAssignmentFilter, options?: RepositoryOptions): Promise<AssignmentStats> {
      try {
        const model = this.getModel(options?.transaction)
        const where = this.buildAssignmentFilterWhere(filter)
  
        const [
          total,
          statusCounts,
          overdue,
          atRisk,
          completedAssignments,
          thisMonthStats
        ] = await Promise.all([
          model.count({ where }),
          
          // Подсчет по статусам
          Promise.all(Object.values(AssignmentStatus).map(async (status) => ({
            status,
            count: await model.count({ where: { ...where, status } })
          }))),
          
          // Просроченные
          model.count({
            where: {
              ...where,
              OR: [
                { isOverdue: true },
                {
                  deadline: { lt: new Date() },
                  status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
                }
              ]
            }
          }),
          
          // В зоне риска
          model.count({
            where: {
              ...where,
              deadline: {
                gte: new Date(),
                lte: addDays(new Date(), 2)
              },
              status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
            }
          }),
          
          // Завершенные назначения для расчета среднего времени
          model.findMany({
            where: {
              ...where,
              status: 'COMPLETED',
              assignedAt: { not: null },
              completedAt: { not: null }
            },
            select: {
              assignedAt: true,
              completedAt: true
            }
          }),
          
          // Статистика за текущий месяц
          {
            assigned: await model.count({
              where: {
                assignedAt: {
                  gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
              }
            }),
            completed: await model.count({
              where: {
                status: 'COMPLETED',
                completedAt: {
                  gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
              }
            }),
            started: await model.count({
              where: {
                status: { in: ['IN_PROGRESS', 'COMPLETED'] },
                startedAt: {
                  gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                }
              }
            })
          }
        ])
  
        // Формируем объект статусов
        const byStatus = statusCounts.reduce((acc, { status, count }) => {
          acc[status] = count
          return acc
        }, {} as Record<AssignmentStatus, number>)
  
        // Рассчитываем среднее время завершения
        const avgCompletionDays = completedAssignments.length > 0
          ? completedAssignments.reduce((sum, assignment) => {
              const days = Math.ceil(
                (assignment.completedAt!.getTime() - assignment.assignedAt.getTime()) / (1000 * 60 * 60 * 24)
              )
              return sum + days
            }, 0) / completedAssignments.length
          : 0
  
        // Рассчитываем коэффициент завершения
        const completionRate = total > 0 ? (byStatus.COMPLETED || 0) / total * 100 : 0
  
        return {
          total,
          byStatus,
          overdue,
          atRisk,
          avgCompletionDays: Math.round(avgCompletionDays * 100) / 100,
          completionRate: Math.round(completionRate * 100) / 100,
          thisMonth: thisMonthStats
        }
      } catch (error) {
        throw this.handleDatabaseError(error)
      }
    }
  
    /**
     * Проверяет дедлайн назначения
     */
    async checkDeadline(assignmentId: string, options?: RepositoryOptions): Promise<DeadlineCheck> {
      const assignment = await this.findByIdOrThrow(assignmentId, options)
      return assignment.checkDeadline()
    }
  
    /**
     * Преобразует запись БД в доменную сущность
     */
    protected mapToEntity(dbRecord: any): FlowAssignmentEntity {
      return new FlowAssignmentEntity(
        dbRecord.id,
        dbRecord.userId,
        dbRecord.flowSnapshotId,
        dbRecord.status,
        dbRecord.deadline,
        dbRecord.isOverdue,
        dbRecord.assignedAt,
        dbRecord.startedAt,
        dbRecord.completedAt,
        dbRecord.buddyIds,
        dbRecord.pausedAt,
        dbRecord.pausedById,
        dbRecord.pauseReason,
        dbRecord.timeSpent,
        dbRecord.lastActivity
      )
    }
  
    /**
     * Возвращает базовые include для назначений
     */
    private getBasicInclude(): any {
      return {
        user: {
          select: {
            id: true,
            name: true,
            telegramUsername: true,
            avatarUrl: true
          }
        },
        flowSnapshot: {
          select: {
            id: true,
            title: true,
            description: true,
            originalFlowId: true,
            stepsCount: true
          }
        },
        flowProgress: {
          select: {
            id: true,
            status: true,
            currentStepOrder: true,
            completedSteps: true,
            totalSteps: true,
            percentage: true,
            timeSpent: true,
            lastActivity: true
          }
        }
      }
    }
  
    /**
     * Строит where условие из фильтра назначений
     */
    private buildAssignmentFilterWhere(filter?: FlowAssignmentFilter): Prisma.FlowAssignmentWhereInput {
      if (!filter) return {}
  
      const where: Prisma.FlowAssignmentWhereInput = {}
  
      if (filter.userId) {
        where.userId = filter.userId
      }
  
      if (filter.buddyIds && filter.buddyIds.length > 0) {
        where.buddyIds = { hasSome: filter.buddyIds }
      }
  
      if (filter.status && filter.status.length > 0) {
        where.status = { in: filter.status }
      }
  
      if (filter.isOverdue !== undefined) {
        if (filter.isOverdue) {
          where.OR = [
            { isOverdue: true },
            {
              deadline: { lt: new Date() },
              status: { in: ['NOT_STARTED', 'IN_PROGRESS'] }
            }
          ]
        } else {
          where.isOverdue = false
          where.deadline = { gte: new Date() }
        }
      }
  
      if (filter.isAtRisk) {
        const riskDate = addDays(new Date(), 2)
        where.deadline = {
          gte: new Date(),
          lte: riskDate
        }
        where.status = { in: ['NOT_STARTED', 'IN_PROGRESS'] }
      }
  
      if (filter.flowId) {
        where.flowSnapshot = {
          originalFlowId: filter.flowId
        }
      }
  
      if (filter.dateRange) {
        where.assignedAt = {
          gte: filter.dateRange.from,
          lte: filter.dateRange.to
        }
      }
  
      return where
    }
  }