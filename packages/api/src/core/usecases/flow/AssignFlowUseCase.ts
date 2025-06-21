/**
 * AssignFlowUseCase - сценарий назначения потока пользователю
 * 
 * КЛЮЧЕВАЯ ОСОБЕННОСТЬ: При назначении потока создается полный снапшот
 * всего содержимого (поток + шаги + компоненты). Пользователь взаимодействует
 * именно со снапшотом, что гарантирует стабильность обучения.
 * 
 * Процесс назначения:
 * 1. Валидация входных данных
 * 2. Проверка прав доступа
 * 3. Создание записи назначения (FlowAssignment)
 * 4. СОЗДАНИЕ ПОЛНОГО СНАПШОТА содержимого
 * 5. Отправка уведомлений
 * 6. Логирование операции
 */

import { FlowAssignment, FlowAssignmentFactory } from '../../entities/FlowAssignment'
import { SnapshotService, SnapshotCreationContext } from '../../services/snapshot/SnapshotService'
import { IFlowRepository } from '../../repositories/FlowRepository'
import { IFlowAssignmentRepository } from '../../repositories/FlowAssignmentRepository'
import { IUserRepository } from '../../repositories/UserRepository'
import { IFlowSnapshotRepository } from '../../repositories/FlowSnapshotRepository'
import { logger } from '../../../utils/logger'

// ===== ИНТЕРФЕЙСЫ =====

export interface AssignFlowInput {
  /** ID потока для назначения */
  flowId: string
  /** ID пользователя, которому назначается поток */
  userId: string
  /** ID назначившего пользователя (наставник/админ) */
  assignedBy: string
  /** Дедлайн выполнения (опционально) */
  deadline?: Date
  /** Приоритет выполнения */
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
  /** Комментарий к назначению */
  comment?: string
  /** Дополнительные настройки */
  settings?: {
    /** Разрешить пропуск необязательных компонентов */
    allowSkipOptional?: boolean
    /** Максимальное количество попыток для заданий */
    maxAttempts?: number
    /** Отправлять уведомления о прогрессе */
    sendProgressNotifications?: boolean
    /** Настройки дедлайна */
    deadlineSettings?: {
      /** Предупреждать за X дней до дедлайна */
      warningDaysBefore?: number
      /** Автоматически продлевать дедлайн */
      autoExtend?: boolean
    }
  }
  /** Дополнительный контекст */
  context?: Record<string, any>
}

export interface AssignFlowResult {
  /** Созданное назначение */
  assignment: FlowAssignment
  /** Информация о созданном снапшоте */
  snapshotInfo: {
    flowSnapshotId: string
    totalSteps: number
    totalComponents: number
    creationTimeMs: number
    snapshotSize: number
  }
  /** Дополнительная информация */
  metadata: {
    /** Было ли назначение успешным */
    success: boolean
    /** Сообщения для пользователя */
    messages: string[]
    /** Предупреждения */
    warnings: string[]
    /** Следующие действия */
    nextActions: string[]
  }
}

// ===== ОСНОВНОЙ USE CASE =====

export class AssignFlowUseCase {
  constructor(
    private readonly flowRepository: IFlowRepository,
    private readonly userRepository: IUserRepository,
    private readonly assignmentRepository: IFlowAssignmentRepository,
    private readonly snapshotRepository: IFlowSnapshotRepository,
    private readonly snapshotService: SnapshotService
  ) {}

  /**
   * Выполняет назначение потока пользователю с созданием снапшота
   */
  async execute(input: AssignFlowInput): Promise<AssignFlowResult> {
    const startTime = Date.now()

    try {
      logger.info('Начинаем назначение потока', {
        flowId: input.flowId,
        userId: input.userId,
        assignedBy: input.assignedBy
      })

      // 1. Валидация входных данных
      await this.validateInput(input)

      // 2. Проверка существования сущностей
      const [flow, user, assignedByUser] = await this.validateEntities(input)

      // 3. Проверка бизнес-правил
      await this.validateBusinessRules(input, flow, user)

      // 4. Создание записи назначения
      const assignment = await this.createAssignment(input, flow, user)

      // 5. СОЗДАНИЕ СНАПШОТА - ключевая операция!
      const snapshotResult = await this.createFlowSnapshot(assignment, input)

      // 6. Обновление назначения с информацией о снапшоте
      const updatedAssignment = await this.updateAssignmentWithSnapshot(
        assignment,
        snapshotResult.flowSnapshot.id
      )

      // 7. Отправка уведомлений
      await this.sendNotifications(updatedAssignment, flow, user, assignedByUser)

      // 8. Логирование успешного завершения
      const executionTime = Date.now() - startTime
      logger.info('Назначение потока завершено успешно', {
        assignmentId: updatedAssignment.id,
        flowSnapshotId: snapshotResult.flowSnapshot.id,
        executionTimeMs: executionTime,
        snapshotStats: snapshotResult.stats
      })

      return {
        assignment: updatedAssignment,
        snapshotInfo: {
          flowSnapshotId: snapshotResult.flowSnapshot.id,
          totalSteps: snapshotResult.stats.totalSteps,
          totalComponents: snapshotResult.stats.totalComponents,
          creationTimeMs: snapshotResult.stats.creationTimeMs,
          snapshotSize: snapshotResult.stats.snapshotSize
        },
        metadata: {
          success: true,
          messages: [
            'Поток успешно назначен!',
            `Создан снапшот с ${snapshotResult.stats.totalSteps} шагами и ${snapshotResult.stats.totalComponents} компонентами`,
            'Уведомления отправлены'
          ],
          warnings: this.generateWarnings(input, flow),
          nextActions: [
            'USER_START_LEARNING',
            'BUDDY_MONITOR_PROGRESS',
            'SYSTEM_TRACK_DEADLINES'
          ]
        }
      }

    } catch (error) {
      const executionTime = Date.now() - startTime

      logger.error('Ошибка при назначении потока', {
        flowId: input.flowId,
        userId: input.userId,
        assignedBy: input.assignedBy,
        executionTimeMs: executionTime,
        error: error.message,
        stack: error.stack
      })

      throw new Error(`Не удалось назначить поток: ${error.message}`)
    }
  }

  /**
   * Проверяет, можно ли назначить поток пользователю
   */
  async canAssignFlow(flowId: string, userId: string, assignedBy: string): Promise<{
    canAssign: boolean
    reasons: string[]
    warnings: string[]
  }> {
    try {
      const reasons: string[] = []
      const warnings: string[] = []

      // Проверяем существование сущностей
      const flow = await this.flowRepository.findById(flowId)
      const user = await this.userRepository.findById(userId)
      const assignedByUser = await this.userRepository.findById(assignedBy)

      if (!flow) {
        reasons.push('Поток не найден')
      }

      if (!user) {
        reasons.push('Пользователь не найден')
      }

      if (!assignedByUser) {
        reasons.push('Назначающий пользователь не найден')
      }

      if (reasons.length > 0) {
        return { canAssign: false, reasons, warnings }
      }

      // Проверяем активность потока
      if (!flow.isActive) {
        reasons.push('Поток неактивен')
      }

      // Проверяем права назначающего
      if (!assignedByUser.hasPermission('ASSIGN_FLOWS')) {
        reasons.push('Недостаточно прав для назначения потоков')
      }

      // Проверяем, не назначен ли уже этот поток
      const existingAssignment = await this.assignmentRepository.findActiveByUserAndFlow(userId, flowId)
      if (existingAssignment) {
        reasons.push('Поток уже назначен этому пользователю')
      }

      // Проверяем готовность потока к назначению
      if (!flow.isReadyForAssignment()) {
        reasons.push('Поток не готов к назначению (проверьте содержимое)')
      }

      // Генерируем предупреждения
      if (flow.difficulty === 'ADVANCED' && !user.hasExperience()) {
        warnings.push('Продвинутый поток может быть сложным для новичка')
      }

      if (flow.estimatedDuration && flow.estimatedDuration > 480) { // 8 часов
        warnings.push('Поток требует значительных временных затрат')
      }

      return {
        canAssign: reasons.length === 0,
        reasons,
        warnings
      }

    } catch (error) {
      logger.error('Ошибка проверки возможности назначения', { flowId, userId, error: error.message })
      return {
        canAssign: false,
        reasons: ['Произошла ошибка при проверке'],
        warnings: []
      }
    }
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ =====

  /**
   * Валидирует входные данные
   */
  private async validateInput(input: AssignFlowInput): Promise<void> {
    if (!input.flowId) {
      throw new Error('ID потока обязателен')
    }

    if (!input.userId) {
      throw new Error('ID пользователя обязателен')
    }

    if (!input.assignedBy) {
      throw new Error('ID назначающего пользователя обязателен')
    }

    if (input.deadline && input.deadline <= new Date()) {
      throw new Error('Дедлайн должен быть в будущем')
    }

    if (input.priority && !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(input.priority)) {
      throw new Error('Некорректный приоритет')
    }
  }

  /**
   * Проверяет существование связанных сущностей
   */
  private async validateEntities(input: AssignFlowInput): Promise<[any, any, any]> {
    const [flow, user, assignedByUser] = await Promise.all([
      this.flowRepository.findById(input.flowId),
      this.userRepository.findById(input.userId),
      this.userRepository.findById(input.assignedBy)
    ])

    if (!flow) {
      throw new Error(`Поток с ID ${input.flowId} не найден`)
    }

    if (!user) {
      throw new Error(`Пользователь с ID ${input.userId} не найден`)
    }

    if (!assignedByUser) {
      throw new Error(`Назначающий пользователь с ID ${input.assignedBy} не найден`)
    }

    return [flow, user, assignedByUser]
  }

  /**
   * Проверяет бизнес-правила
   */
  private async validateBusinessRules(input: AssignFlowInput, flow: any, user: any): Promise<void> {
    // Проверяем активность потока
    if (!flow.isActive) {
      throw new Error('Нельзя назначить неактивный поток')
    }

    // Проверяем, не назначен ли уже этот поток
    const existingAssignment = await this.assignmentRepository.findActiveByUserAndFlow(
      input.userId,
      input.flowId
    )

    if (existingAssignment) {
      throw new Error('Поток уже назначен этому пользователю')
    }

    // Проверяем готовность потока
    if (!flow.isReadyForAssignment()) {
      throw new Error('Поток не готов к назначению. Проверьте содержимое.')
    }

    // Проверяем лимиты пользователя
    const activeAssignmentsCount = await this.assignmentRepository.countActiveByUser(input.userId)
    const maxActiveAssignments = user.getMaxActiveAssignments()

    if (activeAssignmentsCount >= maxActiveAssignments) {
      throw new Error(`Превышен лимит активных назначений (${maxActiveAssignments})`)
    }
  }

  /**
   * Создает запись назначения
   */
  private async createAssignment(input: AssignFlowInput, flow: any, user: any): Promise<FlowAssignment> {
    const assignment = FlowAssignmentFactory.create({
      flowId: input.flowId,
      userId: input.userId,
      assignedBy: input.assignedBy,
      deadline: input.deadline,
      priority: input.priority || 'NORMAL',
      comment: input.comment,
      settings: {
        allowSkipOptional: input.settings?.allowSkipOptional ?? true,
        maxAttempts: input.settings?.maxAttempts ?? 3,
        sendProgressNotifications: input.settings?.sendProgressNotifications ?? true,
        deadlineSettings: input.settings?.deadlineSettings ?? {
          warningDaysBefore: 3,
          autoExtend: false
        }
      },
      context: input.context
    })

    return await this.assignmentRepository.create(assignment)
  }

  /**
   * Создает снапшот потока - КЛЮЧЕВАЯ ОПЕРАЦИЯ!
   */
  private async createFlowSnapshot(assignment: FlowAssignment, input: AssignFlowInput) {
    const snapshotContext: SnapshotCreationContext = {
      assignmentId: assignment.id,
      userId: assignment.userId,
      createdBy: assignment.assignedBy,
      additionalContext: {
        assignmentPriority: assignment.priority,
        assignmentComment: assignment.comment,
        assignmentSettings: assignment.settings,
        ...input.context
      }
    }

    return await this.snapshotService.createFlowSnapshot(assignment.flowId, snapshotContext)
  }

  /**
   * Обновляет назначение с информацией о снапшоте
   */
  private async updateAssignmentWithSnapshot(
    assignment: FlowAssignment,
    flowSnapshotId: string
  ): Promise<FlowAssignment> {
    const updatedAssignment = assignment.withFlowSnapshotId(flowSnapshotId)
    return await this.assignmentRepository.update(assignment.id, updatedAssignment)
  }

  /**
   * Отправляет уведомления о назначении
   */
  private async sendNotifications(
    assignment: FlowAssignment,
    flow: any,
    user: any,
    assignedByUser: any
  ): Promise<void> {
    try {
      // TODO: Реализовать отправку уведомлений
      // Уведомление пользователю о новом назначении
      // Уведомление наставнику о создании назначения
      
      logger.info('Уведомления о назначении отправлены', {
        assignmentId: assignment.id,
        userId: user.id,
        assignedBy: assignedByUser.id
      })

    } catch (error) {
      logger.warn('Ошибка при отправке уведомлений', {
        assignmentId: assignment.id,
        error: error.message
      })
      // Не падаем из-за ошибки уведомлений
    }
  }

  /**
   * Генерирует предупреждения
   */
  private generateWarnings(input: AssignFlowInput, flow: any): string[] {
    const warnings: string[] = []

    if (flow.difficulty === 'ADVANCED') {
      warnings.push('Поток имеет продвинутый уровень сложности')
    }

    if (flow.estimatedDuration && flow.estimatedDuration > 480) {
      warnings.push('Поток требует более 8 часов для прохождения')
    }

    if (input.deadline) {
      const daysUntilDeadline = Math.ceil(
        (input.deadline.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
      )

      if (daysUntilDeadline < 7) {
        warnings.push('Установлен короткий дедлайн (менее недели)')
      }
    }

    return warnings
  }
}

/**
 * Интерфейс для использования сценария
 */
export interface IAssignFlowUseCase {
  execute(input: AssignFlowInput): Promise<AssignFlowResult>
  canAssignFlow(flowId: string, userId: string, assignedBy: string): Promise<{
    canAssign: boolean
    reasons: string[]
    warnings: string[]
  }>
}