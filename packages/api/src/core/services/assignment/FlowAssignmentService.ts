/**
 * Сервис для работы с назначениями потоков обучения
 * 
 * Содержит бизнес-логику для:
 * - Назначения потоков пользователям
 * - Управления жизненным циклом назначений
 * - Контроля дедлайнов и статусов
 * - Работы с паузами и возобновлениями
 * - Отслеживания прогресса обучения
 * 
 * Это центральный сервис для управления процессом обучения,
 * который координирует работу между пользователями, потоками и прогрессом.
 */

import { AssignmentStatus } from '@buddybot/database'
import { FlowAssignmentRepository, FlowAssignmentFilter, AssignmentStats, AssignmentWithDetails } from '../../repositories/FlowAssignmentRepository'
import { UserRepository } from '../../repositories/UserRepository'
import { FlowRepository } from '../../repositories/FlowRepository'
import { FlowAssignment, CreateFlowAssignmentInput, UpdateFlowAssignmentInput, DeadlineCheck, PauseReason } from '../../entities/FlowAssignment'
import { PaginationParams, RepositoryError, RepositoryErrorType } from '../../repositories/base/BaseRepository'
import { addDays, addBusinessDays } from 'date-fns'

/**
 * Интерфейс для назначения потока пользователю
 */
export interface AssignFlowInput {
  userId: string
  flowId: string
  buddyIds: string[]
  deadline?: Date
  customDeadlineDays?: number
  assignedBy: string
  reason?: string
}

/**
 * Интерфейс для массового назначения потока
 */
export interface BulkAssignFlowInput {
  flowId: string
  assignments: {
    userId: string
    buddyIds: string[]
    deadline?: Date
    customDeadlineDays?: number
  }[]
  assignedBy: string
  reason?: string
}

/**
 * Результат массового назначения
 */
export interface BulkAssignmentResult {
  successful: AssignmentWithDetails[]
  failed: {
    userId: string
    reason: string
    error: string
  }[]
  summary: {
    total: number
    successful: number
    failed: number
  }
}

/**
 * Интерфейс для постановки на паузу
 */
export interface PauseAssignmentInput {
  assignmentId: string
  reason: PauseReason | string
  pausedBy: string
  pauseNote?: string
}

/**
 * Интерфейс для возобновления потока
 */
export interface ResumeAssignmentInput {
  assignmentId: string
  resumedBy: string
  adjustDeadline?: boolean
  resumeNote?: string
}

/**
 * Интерфейс для продления дедлайна
 */
export interface ExtendDeadlineInput {
  assignmentId: string
  newDeadline: Date
  reason: string
  extendedBy: string
}

/**
 * Результат поиска назначений
 */
export interface AssignmentSearchResult {
  assignments: FlowAssignment[]
  pagination: {
    total: number
    page: number
    limit: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

/**
 * Сервис для работы с назначениями потоков
 * 
 * Реализует всю бизнес-логику связанную с назначениями потоков.
 * Обеспечивает валидацию, проверку прав доступа и координацию
 * между различными компонентами системы.
 */
export class FlowAssignmentService {
  constructor(
    private assignmentRepository: FlowAssignmentRepository,
    private userRepository: UserRepository,
    private flowRepository: FlowRepository
  ) {}

  /**
   * Назначает поток пользователю
   * 
   * @param input - данные для назначения
   * @returns созданное назначение с деталями
   */
  async assignFlow(input: AssignFlowInput): Promise<AssignmentWithDetails> {
    // Валидируем входные данные
    await this.validateAssignmentInput(input)

    // Проверяем права на назначение
    await this.validateAssignmentPermissions(input.assignedBy, input.buddyIds)

    // Проверяем, что пользователь не имеет активного назначения этого потока
    await this.validateNoDuplicateAssignment(input.userId, input.flowId)

    // Подготавливаем данные для создания назначения
    const assignmentData: CreateFlowAssignmentInput & { flowId: string } = {
      userId: input.userId,
      flowId: input.flowId,
      buddyIds: input.buddyIds,
      deadline: input.deadline,
      customDeadlineDays: input.customDeadlineDays
    }

    // Создаем назначение со снапшотом
    const assignment = await this.assignmentRepository.createWithSnapshot(assignmentData)

    console.log(`🎯 Назначен поток "${assignment.flowSnapshot.title}" пользователю ${assignment.user.name} (назначено ${input.assignedBy})`)

    // TODO: Отправить уведомление о назначении
    // await this.notificationService.sendFlowAssignedNotification(assignment)

    return assignment
  }

  /**
   * Массово назначает поток нескольким пользователям
   * 
   * @param input - данные для массового назначения
   * @returns результаты назначения
   */
  async bulkAssignFlow(input: BulkAssignFlowInput): Promise<BulkAssignmentResult> {
    // Проверяем права на назначение
    const assignedBy = await this.userRepository.findByIdOrThrow(input.assignedBy)
    if (!assignedBy.canAssignFlows()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Недостаточно прав для назначения потоков'
      )
    }

    // Проверяем существование потока
    const flow = await this.flowRepository.findByIdOrThrow(input.flowId)
    if (!flow.isActive) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Нельзя назначить неактивный поток'
      )
    }

    const successful: AssignmentWithDetails[] = []
    const failed: { userId: string; reason: string; error: string }[] = []

    // Обрабатываем каждое назначение
    for (const assignment of input.assignments) {
      try {
        const assignInput: AssignFlowInput = {
          userId: assignment.userId,
          flowId: input.flowId,
          buddyIds: assignment.buddyIds,
          deadline: assignment.deadline,
          customDeadlineDays: assignment.customDeadlineDays,
          assignedBy: input.assignedBy,
          reason: input.reason
        }

        const result = await this.assignFlow(assignInput)
        successful.push(result)
      } catch (error) {
        failed.push({
          userId: assignment.userId,
          reason: input.reason || 'Массовое назначение',
          error: error.message
        })
      }
    }

    const summary = {
      total: input.assignments.length,
      successful: successful.length,
      failed: failed.length
    }

    console.log(`📊 Массовое назначение завершено: ${summary.successful}/${summary.total} успешно`)

    return { successful, failed, summary }
  }

  /**
   * Получает назначение по ID с деталями
   * 
   * @param assignmentId - ID назначения
   * @returns назначение с деталями или null
   */
  async getAssignmentWithDetails(assignmentId: string): Promise<AssignmentWithDetails | null> {
    return this.assignmentRepository.findByIdWithDetails(assignmentId)
  }

  /**
   * Получает назначение по ID с деталями или выбрасывает ошибку
   * 
   * @param assignmentId - ID назначения
   * @returns назначение с деталями
   */
  async getAssignmentWithDetailsOrThrow(assignmentId: string): Promise<AssignmentWithDetails> {
    const assignment = await this.assignmentRepository.findByIdWithDetails(assignmentId)
    if (!assignment) {
      throw new RepositoryError(
        RepositoryErrorType.NOT_FOUND,
        'Назначение потока не найдено'
      )
    }
    return assignment
  }

  /**
   * Получает назначения пользователя
   * 
   * @param userId - ID пользователя
   * @param filter - дополнительные фильтры
   * @param pagination - параметры пагинации
   * @returns назначения пользователя
   */
  async getUserAssignments(
    userId: string,
    filter?: Omit<FlowAssignmentFilter, 'userId'>,
    pagination?: PaginationParams
  ): Promise<AssignmentSearchResult> {
    const result = await this.assignmentRepository.findByUser(userId, filter, pagination)

    return {
      assignments: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает назначения наставника
   * 
   * @param buddyId - ID наставника
   * @param filter - дополнительные фильтры
   * @param pagination - параметры пагинации
   * @returns назначения подопечных
   */
  async getBuddyAssignments(
    buddyId: string,
    filter?: Omit<FlowAssignmentFilter, 'buddyIds'>,
    pagination?: PaginationParams
  ): Promise<AssignmentSearchResult> {
    // Проверяем права наставника
    const buddy = await this.userRepository.findByIdOrThrow(buddyId)
    if (!buddy.canBeBuddy()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Пользователь не может быть наставником'
      )
    }

    const result = await this.assignmentRepository.findByBuddy(buddyId, filter, pagination)

    return {
      assignments: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Начинает прохождение потока
   * 
   * @param assignmentId - ID назначения
   * @param startedBy - ID пользователя, который начинает
   * @returns обновленное назначение
   */
  async startAssignment(assignmentId: string, startedBy: string): Promise<FlowAssignment> {
    const assignment = await this.assignmentRepository.findByIdOrThrow(assignmentId)

    // Проверяем права на начало прохождения
    if (assignment.userId !== startedBy) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Только назначенный пользователь может начать прохождение потока'
      )
    }

    // Обновляем статус
    const updatedAssignment = await this.assignmentRepository.updateStatus(
      assignmentId,
      AssignmentStatus.IN_PROGRESS
    )

    console.log(`🚀 Начато прохождение потока: ${assignmentId} (пользователем ${startedBy})`)

    // TODO: Отправить уведомления наставникам
    // await this.notificationService.sendFlowStartedNotification(updatedAssignment)

    return updatedAssignment
  }

  /**
   * Завершает прохождение потока
   * 
   * @param assignmentId - ID назначения
   * @param completedBy - ID пользователя, который завершает
   * @returns обновленное назначение
   */
  async completeAssignment(assignmentId: string, completedBy: string): Promise<FlowAssignment> {
    const assignment = await this.assignmentRepository.findByIdOrThrow(assignmentId)

    // Проверяем права на завершение
    this.validateCompletionPermissions(assignment, completedBy)

    // TODO: Проверить, что все обязательные компоненты завершены
    // const isFullyCompleted = await this.progressService.isAssignmentFullyCompleted(assignmentId)
    // if (!isFullyCompleted) {
    //   throw new RepositoryError(
    //     RepositoryErrorType.VALIDATION_ERROR,
    //     'Не все обязательные компоненты завершены'
    //   )
    // }

    // Обновляем статус
    const updatedAssignment = await this.assignmentRepository.updateStatus(
      assignmentId,
      AssignmentStatus.COMPLETED
    )

    console.log(`✅ Завершено прохождение потока: ${assignmentId} (пользователем ${completedBy})`)

    // TODO: Отправить уведомления и начислить достижения
    // await this.notificationService.sendFlowCompletedNotification(updatedAssignment)
    // await this.achievementService.processFlowCompletion(updatedAssignment)

    return updatedAssignment
  }

  /**
   * Ставит назначение на паузу
   * 
   * @param input - данные для паузы
   * @returns обновленное назначение
   */
  async pauseAssignment(input: PauseAssignmentInput): Promise<FlowAssignment> {
    const assignment = await this.assignmentRepository.findByIdOrThrow(input.assignmentId)

    // Проверяем права на постановку на паузу
    this.validatePausePermissions(assignment, input.pausedBy)

    // Обновляем статус с метаданными
    const updatedAssignment = await this.assignmentRepository.updateStatus(
      input.assignmentId,
      AssignmentStatus.PAUSED,
      {
        pausedById: input.pausedBy,
        pauseReason: input.reason
      }
    )

    console.log(`⏸️ Поставлено на паузу: ${input.assignmentId} (причина: ${input.reason})`)

    // TODO: Отправить уведомления
    // await this.notificationService.sendFlowPausedNotification(updatedAssignment, input.reason)

    return updatedAssignment
  }

  /**
   * Возобновляет назначение после паузы
   * 
   * @param input - данные для возобновления
   * @returns обновленное назначение
   */
  async resumeAssignment(input: ResumeAssignmentInput): Promise<FlowAssignment> {
    const assignment = await this.assignmentRepository.findByIdOrThrow(input.assignmentId)

    // Проверяем права на возобновление
    this.validateResumePermissions(assignment, input.resumedBy)

    if (!assignment.isPaused()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Назначение не на паузе'
      )
    }

    // Обновляем статус
    const updatedAssignment = await this.assignmentRepository.updateStatus(
      input.assignmentId,
      AssignmentStatus.IN_PROGRESS
    )

    // Корректируем дедлайн если нужно
    if (input.adjustDeadline && assignment.pausedAt) {
      const pauseDuration = Date.now() - assignment.pausedAt.getTime()
      const pauseDays = Math.ceil(pauseDuration / (1000 * 60 * 60 * 24))
      const newDeadline = addBusinessDays(assignment.deadline, pauseDays)
      
      await this.assignmentRepository.updateDeadline(
        input.assignmentId,
        newDeadline,
        input.resumedBy,
        'Корректировка после паузы'
      )
    }

    console.log(`▶️ Возобновлено назначение: ${input.assignmentId} (пользователем ${input.resumedBy})`)

    // TODO: Отправить уведомления
    // await this.notificationService.sendFlowResumedNotification(updatedAssignment)

    return updatedAssignment
  }

  /**
   * Продлевает дедлайн назначения
   * 
   * @param input - данные для продления дедлайна
   * @returns обновленное назначение
   */
  async extendDeadline(input: ExtendDeadlineInput): Promise<FlowAssignment> {
    const assignment = await this.assignmentRepository.findByIdOrThrow(input.assignmentId)

    // Проверяем права на продление дедлайна
    this.validateExtendDeadlinePermissions(assignment, input.extendedBy)

    // Валидируем новый дедлайн
    if (input.newDeadline <= assignment.deadline) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Новый дедлайн должен быть позже текущего'
      )
    }

    const updatedAssignment = await this.assignmentRepository.updateDeadline(
      input.assignmentId,
      input.newDeadline,
      input.extendedBy,
      input.reason
    )

    console.log(`📅 Продлен дедлайн: ${input.assignmentId} до ${input.newDeadline.toISOString().split('T')[0]}`)

    // TODO: Отправить уведомления
    // await this.notificationService.sendDeadlineExtendedNotification(updatedAssignment, input.newDeadline)

    return updatedAssignment
  }

  /**
   * Отменяет назначение
   * 
   * @param assignmentId - ID назначения
   * @param reason - причина отмены
   * @param cancelledBy - ID пользователя, который отменяет
   * @returns отмененное назначение
   */
  async cancelAssignment(assignmentId: string, reason: string, cancelledBy: string): Promise<FlowAssignment> {
    const assignment = await this.assignmentRepository.findByIdOrThrow(assignmentId)

    // Проверяем права на отмену
    this.validateCancelPermissions(assignment, cancelledBy)

    const updatedAssignment = await this.assignmentRepository.updateStatus(
      assignmentId,
      AssignmentStatus.CANCELLED,
      {
        cancelledById: cancelledBy,
        reason
      }
    )

    console.log(`❌ Отменено назначение: ${assignmentId} (причина: ${reason})`)

    // TODO: Отправить уведомления
    // await this.notificationService.sendFlowCancelledNotification(updatedAssignment, reason)

    return updatedAssignment
  }

  /**
   * Получает просроченные назначения
   * 
   * @param pagination - параметры пагинации
   * @returns просроченные назначения
   */
  async getOverdueAssignments(pagination?: PaginationParams): Promise<AssignmentSearchResult> {
    const result = await this.assignmentRepository.findOverdue(pagination)

    return {
      assignments: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает назначения в зоне риска
   * 
   * @param daysBeforeDeadline - количество дней до дедлайна
   * @param pagination - параметры пагинации
   * @returns назначения в зоне риска
   */
  async getAtRiskAssignments(
    daysBeforeDeadline: number = 2,
    pagination?: PaginationParams
  ): Promise<AssignmentSearchResult> {
    const result = await this.assignmentRepository.findAtRisk(daysBeforeDeadline, pagination)

    return {
      assignments: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает неактивные назначения
   * 
   * @param daysSinceActivity - количество дней с последней активности
   * @param pagination - параметры пагинации
   * @returns неактивные назначения
   */
  async getInactiveAssignments(
    daysSinceActivity: number = 3,
    pagination?: PaginationParams
  ): Promise<AssignmentSearchResult> {
    const result = await this.assignmentRepository.findInactive(daysSinceActivity, pagination)

    return {
      assignments: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Проверяет дедлайн назначения
   * 
   * @param assignmentId - ID назначения
   * @returns информация о дедлайне
   */
  async checkAssignmentDeadline(assignmentId: string): Promise<DeadlineCheck> {
    return this.assignmentRepository.checkDeadline(assignmentId)
  }

  /**
   * Обновляет просроченные назначения (системная задача)
   * 
   * @returns количество обновленных назначений
   */
  async updateOverdueAssignments(): Promise<number> {
    const count = await this.assignmentRepository.updateOverdueStatus()
    
    if (count > 0) {
      console.log(`⚠️ Обновлено ${count} просроченных назначений`)
    }

    return count
  }

  /**
   * Получает статистику назначений
   * 
   * @param filter - фильтры для статистики
   * @returns статистика назначений
   */
  async getAssignmentStats(filter?: FlowAssignmentFilter): Promise<AssignmentStats> {
    return this.assignmentRepository.getStats(filter)
  }

  /**
   * Валидирует входные данные для назначения
   * 
   * @param input - данные для валидации
   */
  private async validateAssignmentInput(input: AssignFlowInput): Promise<void> {
    // Проверяем существование пользователя
    const user = await this.userRepository.findByIdOrThrow(input.userId)
    if (!user.isActiveUser()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Нельзя назначить поток неактивному пользователю'
      )
    }

    // Проверяем существование потока
    const flow = await this.flowRepository.findByIdOrThrow(input.flowId)
    if (!flow.isActive) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Нельзя назначить неактивный поток'
      )
    }

    if (!flow.isReadyForAssignment()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Поток не готов для назначения'
      )
    }

    // Проверяем существование наставников
    for (const buddyId of input.buddyIds) {
      const buddy = await this.userRepository.findByIdOrThrow(buddyId)
      if (!buddy.canMentorUser(user)) {
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          `Пользователь ${buddy.name} не может быть наставником для ${user.name}`
        )
      }
    }
  }

  /**
   * Проверяет права на назначение потоков
   * 
   * @param assignedBy - ID назначающего
   * @param buddyIds - ID наставников
   */
  private async validateAssignmentPermissions(assignedBy: string, buddyIds: string[]): Promise<void> {
    const assignor = await this.userRepository.findByIdOrThrow(assignedBy)
    
    // Проверяем права на назначение
    if (!assignor.canAssignFlows()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Недостаточно прав для назначения потоков'
      )
    }

    // Проверяем, что назначающий является одним из наставников (если не админ)
    if (!assignor.hasRole('ADMIN') && !buddyIds.includes(assignedBy)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Наставник должен быть в списке назначенных наставников'
      )
    }
  }

  /**
   * Проверяет отсутствие дублирующих назначений
   * 
   * @param userId - ID пользователя
   * @param flowId - ID потока
   */
  private async validateNoDuplicateAssignment(userId: string, flowId: string): Promise<void> {
    const existingAssignments = await this.assignmentRepository.findByUser(userId, {
      flowId,
      status: ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED']
    })

    if (existingAssignments.data.length > 0) {
      throw new RepositoryError(
        RepositoryErrorType.DUPLICATE,
        'У пользователя уже есть активное назначение этого потока'
      )
    }
  }

  /**
   * Проверяет права на завершение назначения
   * 
   * @param assignment - назначение
   * @param completedBy - ID завершающего
   */
  private validateCompletionPermissions(assignment: FlowAssignment, completedBy: string): void {
    // Пользователь может завершить свое назначение
    if (assignment.userId === completedBy) {
      return
    }

    // Наставники могут завершить назначение подопечного
    if (assignment.isBuddy(completedBy)) {
      return
    }

    throw new RepositoryError(
      RepositoryErrorType.VALIDATION_ERROR,
      'Недостаточно прав для завершения этого назначения'
    )
  }

  /**
   * Проверяет права на постановку на паузу
   * 
   * @param assignment - назначение
   * @param pausedBy - ID ставящего на паузу
   */
  private validatePausePermissions(assignment: FlowAssignment, pausedBy: string): void {
    // Пользователь может поставить свое назначение на паузу
    if (assignment.userId === pausedBy) {
      return
    }

    // Наставники могут ставить назначения на паузу
    if (assignment.isBuddy(pausedBy)) {
      return
    }

    throw new RepositoryError(
      RepositoryErrorType.VALIDATION_ERROR,
      'Недостаточно прав для постановки на паузу'
    )
  }

  /**
   * Проверяет права на возобновление
   * 
   * @param assignment - назначение
   * @param resumedBy - ID возобновляющего
   */
  private validateResumePermissions(assignment: FlowAssignment, resumedBy: string): void {
    // Пользователь может возобновить свое назначение
    if (assignment.userId === resumedBy) {
      return
    }

    // Наставники могут возобновлять назначения
    if (assignment.isBuddy(resumedBy)) {
      return
    }

    throw new RepositoryError(
      RepositoryErrorType.VALIDATION_ERROR,
      'Недостаточно прав для возобновления'
    )
  }

  /**
   * Проверяет права на продление дедлайна
   * 
   * @param assignment - назначение
   * @param extendedBy - ID продлевающего
   */
  private validateExtendDeadlinePermissions(assignment: FlowAssignment, extendedBy: string): void {
    // Только наставники могут продлевать дедлайны
    if (!assignment.isBuddy(extendedBy)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Только наставники могут продлевать дедлайны'
      )
    }
  }

  /**
   * Проверяет права на отмену назначения
   * 
   * @param assignment - назначение
   * @param cancelledBy - ID отменяющего
   */
  private validateCancelPermissions(assignment: FlowAssignment, cancelledBy: string): void {
    // Наставники могут отменять назначения
    if (assignment.isBuddy(cancelledBy)) {
      return
    }

    throw new RepositoryError(
      RepositoryErrorType.VALIDATION_ERROR,
      'Только наставники могут отменять назначения'
    )
  }
}