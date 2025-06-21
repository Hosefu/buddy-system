/**
 * Доменная сущность FlowAssignment
 * 
 * Представляет назначение потока обучения конкретному пользователю.
 * Это центральная сущность, которая управляет всем процессом обучения:
 * - Связывает пользователя с снапшотом потока
 * - Управляет статусом и дедлайнами
 * - Отслеживает прогресс и активность
 * - Контролирует наставников и паузы
 */

import { AssignmentStatus } from '@prisma/client'
import { addDays, addBusinessDays, isAfter, isBefore } from 'date-fns'

/**
 * Интерфейс для создания нового назначения
 */
export interface CreateFlowAssignmentInput {
  userId: string
  flowSnapshotId: string
  buddyIds: string[]
  deadline?: Date
  customDeadlineDays?: number
}

/**
 * Интерфейс для обновления назначения
 */
export interface UpdateFlowAssignmentInput {
  status?: AssignmentStatus
  deadline?: Date
  buddyIds?: string[]
  pauseReason?: string
}

/**
 * Результат проверки дедлайна
 */
export interface DeadlineCheck {
  isOverdue: boolean
  daysRemaining: number
  isAtRisk: boolean        // Меньше 2 дней до дедлайна
  isCritical: boolean      // Меньше 1 дня до дедлайна
}

/**
 * Причины постановки на паузу
 */
export enum PauseReason {
  USER_REQUEST = 'Запрос пользователя',
  BUDDY_DECISION = 'Решение наставника', 
  TECHNICAL_ISSUES = 'Технические проблемы',
  PERSONAL_CIRCUMSTANCES = 'Личные обстоятельства',
  WORKLOAD = 'Высокая загруженность',
  VACATION = 'Отпуск',
  ILLNESS = 'Болезнь'
}

/**
 * Доменная сущность назначения потока
 * 
 * Содержит бизнес-логику для:
 * - Управления жизненным циклом назначения
 * - Контроля дедлайнов и статусов
 * - Работы с паузами и возобновлением
 * - Отслеживания активности и времени
 */
export class FlowAssignment {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly flowSnapshotId: string,
    public status: AssignmentStatus,
    public deadline: Date,
    public isOverdue: boolean,
    public readonly assignedAt: Date,
    public startedAt: Date | null,
    public completedAt: Date | null,
    public buddyIds: string[],
    public pausedAt: Date | null,
    public pausedById: string | null,
    public pauseReason: string | null,
    public timeSpent: number = 0, // В секундах
    public lastActivity: Date | null = null
  ) {
    this.validateAssignment()
  }

  /**
   * Создает новое назначение потока
   */
  static create(input: CreateFlowAssignmentInput): Omit<FlowAssignment, 'id' | 'assignedAt'> {
    // Валидация обязательных полей
    if (!input.userId?.trim()) {
      throw new Error('ID пользователя обязателен')
    }

    if (!input.flowSnapshotId?.trim()) {
      throw new Error('ID снапшота потока обязателен')
    }

    if (!input.buddyIds || input.buddyIds.length === 0) {
      throw new Error('Необходимо указать хотя бы одного наставника')
    }

    if (input.buddyIds.length > 5) {
      throw new Error('Максимальное количество наставников - 5')
    }

    // Проверяем, что пользователь не назначает сам себе
    if (input.buddyIds.includes(input.userId)) {
      throw new Error('Пользователь не может быть наставником самому себе')
    }

    // Рассчитываем дедлайн
    const deadline = input.deadline || FlowAssignment.calculateDefaultDeadline(input.customDeadlineDays)

    // Валидируем дедлайн
    if (isBefore(deadline, new Date())) {
      throw new Error('Дедлайн не может быть в прошлом')
    }

    return {
      userId: input.userId,
      flowSnapshotId: input.flowSnapshotId,
      status: AssignmentStatus.NOT_STARTED,
      deadline,
      isOverdue: false,
      startedAt: null,
      completedAt: null,
      buddyIds: [...input.buddyIds], // Копируем массив
      pausedAt: null,
      pausedById: null,
      pauseReason: null,
      timeSpent: 0,
      lastActivity: null
    }
  }

  /**
   * Начинает прохождение потока
   */
  start(): void {
    if (this.status !== AssignmentStatus.NOT_STARTED) {
      throw new Error('Поток уже начат или завершен')
    }

    if (this.isOverdue) {
      throw new Error('Нельзя начать просроченный поток')
    }

    this.status = AssignmentStatus.IN_PROGRESS
    this.startedAt = new Date()
    this.updateActivity()
  }

  /**
   * Завершает прохождение потока
   */
  complete(): void {
    if (this.status === AssignmentStatus.COMPLETED) {
      throw new Error('Поток уже завершен')
    }

    if (this.status === AssignmentStatus.CANCELLED) {
      throw new Error('Нельзя завершить отмененный поток')
    }

    this.status = AssignmentStatus.COMPLETED
    this.completedAt = new Date()
    this.updateActivity()

    // Сбрасываем паузу если она была
    if (this.isPaused()) {
      this.pausedAt = null
      this.pausedById = null
      this.pauseReason = null
    }
  }

  /**
   * Ставит поток на паузу
   */
  pause(pausedById: string, reason: string = PauseReason.USER_REQUEST): void {
    if (this.status !== AssignmentStatus.IN_PROGRESS) {
      throw new Error('Можно приостановить только активный поток')
    }

    if (this.isPaused()) {
      throw new Error('Поток уже на паузе')
    }

    if (!pausedById?.trim()) {
      throw new Error('Необходимо указать, кто поставил на паузу')
    }

    this.status = AssignmentStatus.PAUSED
    this.pausedAt = new Date()
    this.pausedById = pausedById
    this.pauseReason = reason
  }

  /**
   * Возобновляет поток после паузы
   */
  resume(resumedById: string): void {
    if (!this.isPaused()) {
      throw new Error('Поток не на паузе')
    }

    if (!resumedById?.trim()) {
      throw new Error('Необходимо указать, кто возобновил поток')
    }

    // Рассчитываем, сколько времени поток был на паузе
    const pauseDuration = this.pausedAt ? Date.now() - this.pausedAt.getTime() : 0
    const pauseDays = Math.ceil(pauseDuration / (1000 * 60 * 60 * 24))

    // Продлеваем дедлайн на время паузы
    this.deadline = addDays(this.deadline, pauseDays)

    this.status = AssignmentStatus.IN_PROGRESS
    this.pausedAt = null
    this.pausedById = null
    this.pauseReason = null
    this.updateActivity()
  }

  /**
   * Отменяет назначение потока
   */
  cancel(cancelledById: string, reason: string): void {
    if (this.status === AssignmentStatus.COMPLETED) {
      throw new Error('Нельзя отменить завершенный поток')
    }

    if (this.status === AssignmentStatus.CANCELLED) {
      throw new Error('Поток уже отменен')
    }

    if (!cancelledById?.trim()) {
      throw new Error('Необходимо указать, кто отменил поток')
    }

    this.status = AssignmentStatus.CANCELLED
    this.pauseReason = reason
    this.pausedById = cancelledById
    this.pausedAt = new Date()
  }

  /**
   * Продлевает дедлайн
   */
  extendDeadline(days: number, extendedById: string): void {
    if (days <= 0 || days > 365) {
      throw new Error('Продление должно быть от 1 до 365 дней')
    }

    if (!extendedById?.trim()) {
      throw new Error('Необходимо указать, кто продлил дедлайн')
    }

    this.deadline = addDays(this.deadline, days)
    
    // Если поток был просрочен, снимаем флаг
    if (this.isOverdue && isAfter(this.deadline, new Date())) {
      this.isOverdue = false
    }
  }

  /**
   * Обновляет список наставников
   */
  updateBuddies(newBuddyIds: string[]): void {
    if (!newBuddyIds || newBuddyIds.length === 0) {
      throw new Error('Необходимо указать хотя бы одного наставника')
    }

    if (newBuddyIds.length > 5) {
      throw new Error('Максимальное количество наставников - 5')
    }

    if (newBuddyIds.includes(this.userId)) {
      throw new Error('Пользователь не может быть наставником самому себе')
    }

    this.buddyIds = [...newBuddyIds]
  }

  /**
   * Добавляет время прохождения (в секундах)
   */
  addTimeSpent(seconds: number): void {
    if (seconds < 0) {
      throw new Error('Время не может быть отрицательным')
    }

    this.timeSpent += seconds
    this.updateActivity()
  }

  /**
   * Проверяет статус дедлайна
   */
  checkDeadline(): DeadlineCheck {
    const now = new Date()
    const msRemaining = this.deadline.getTime() - now.getTime()
    const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24))

    const isOverdue = isAfter(now, this.deadline)
    const isAtRisk = daysRemaining <= 2 && daysRemaining > 0
    const isCritical = daysRemaining <= 1 && daysRemaining > 0

    // Обновляем флаг просрочки
    if (isOverdue && !this.isOverdue) {
      this.isOverdue = true
    }

    return {
      isOverdue,
      daysRemaining: Math.max(0, daysRemaining),
      isAtRisk,
      isCritical
    }
  }

  /**
   * Проверяет, на паузе ли поток
   */
  isPaused(): boolean {
    return this.status === AssignmentStatus.PAUSED
  }

  /**
   * Проверяет, завершен ли поток
   */
  isCompleted(): boolean {
    return this.status === AssignmentStatus.COMPLETED
  }

  /**
   * Проверяет, активен ли поток (в процессе прохождения)
   */
  isActive(): boolean {
    return this.status === AssignmentStatus.IN_PROGRESS
  }

  /**
   * Проверяет, можно ли взаимодействовать с потоком
   */
  canInteract(): boolean {
    return this.isActive() && !this.isOverdue
  }

  /**
   * Получает основного наставника (первого в списке)
   */
  getPrimaryBuddyId(): string {
    return this.buddyIds[0]
  }

  /**
   * Проверяет, является ли пользователь наставником для этого потока
   */
  isBuddy(userId: string): boolean {
    return this.buddyIds.includes(userId)
  }

  /**
   * Получает время в формате "часы:минуты"
   */
  getFormattedTimeSpent(): string {
    const hours = Math.floor(this.timeSpent / 3600)
    const minutes = Math.floor((this.timeSpent % 3600) / 60)
    return `${hours}:${minutes.toString().padStart(2, '0')}`
  }

  /**
   * Получает количество дней с момента назначения
   */
  getDaysFromAssignment(): number {
    const now = new Date()
    const msElapsed = now.getTime() - this.assignedAt.getTime()
    return Math.floor(msElapsed / (1000 * 60 * 60 * 24))
  }

  /**
   * Получает количество дней с последней активности
   */
  getDaysFromLastActivity(): number {
    if (!this.lastActivity) {
      return this.getDaysFromAssignment()
    }

    const now = new Date()
    const msElapsed = now.getTime() - this.lastActivity.getTime()
    return Math.floor(msElapsed / (1000 * 60 * 60 * 24))
  }

  /**
   * Обновляет время последней активности
   */
  private updateActivity(): void {
    this.lastActivity = new Date()
  }

  /**
   * Рассчитывает дедлайн по умолчанию
   */
  private static calculateDefaultDeadline(customDays?: number): Date {
    const days = customDays || 7
    return addBusinessDays(new Date(), days)
  }

  /**
   * Валидирует назначение
   */
  private validateAssignment(): void {
    if (!this.userId) {
      throw new Error('ID пользователя обязателен')
    }

    if (!this.flowSnapshotId) {
      throw new Error('ID снапшота потока обязателен')
    }

    if (!this.buddyIds || this.buddyIds.length === 0) {
      throw new Error('Необходимо указать хотя бы одного наставника')
    }

    if (this.timeSpent < 0) {
      throw new Error('Время прохождения не может быть отрицательным')
    }

    if (this.buddyIds.includes(this.userId)) {
      throw new Error('Пользователь не может быть наставником самому себе')
    }
  }

  /**
   * Преобразует сущность в простой объект для сериализации
   */
  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      flowSnapshotId: this.flowSnapshotId,
      status: this.status,
      deadline: this.deadline,
      isOverdue: this.isOverdue,
      assignedAt: this.assignedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      buddyIds: this.buddyIds,
      pausedAt: this.pausedAt,
      pausedById: this.pausedById,
      pauseReason: this.pauseReason,
      timeSpent: this.timeSpent,
      lastActivity: this.lastActivity
    }
  }
}