/**
 * FlowStepSnapshot - доменная сущность снапшота шага потока
 * 
 * Файл: packages/api/src/core/entities/FlowStepSnapshot.ts
 * 
 * Представляет неизменяемую копию шага потока со всеми компонентами.
 * Создается при назначении потока пользователю и остается неизменным
 * на протяжении всего процесса обучения.
 */

import { Entity } from './base/Entity'
import { DomainError } from '../errors/DomainError'

// ===== VALUE OBJECTS =====

export interface StepSnapshotMetadata {
  /** Версия снапшота шага */
  snapshotVersion: string
  /** Количество компонентов в шаге */
  totalComponents: number
  /** Количество обязательных компонентов */
  requiredComponents: number
  /** Приблизительное время прохождения в минутах */
  estimatedDurationMinutes?: number
  /** Размер содержимого шага */
  contentSize: number
}

export interface OriginalStepReference {
  /** ID оригинального шага */
  originalStepId: string
  /** Название оригинального шага */
  originalStepTitle: string
  /** Описание оригинального шага */
  originalStepDescription?: string
  /** Порядковый номер в оригинальном потоке */
  originalOrder: number
}

export interface StepAccessSettings {
  /** Требуется ли завершение предыдущих шагов */
  requiresPreviousCompletion: boolean
  /** Можно ли пропустить этот шаг */
  isSkippable: boolean
  /** Максимальное количество попыток прохождения */
  maxAttempts?: number
  /** Временные ограничения */
  timeLimit?: {
    /** Максимальное время на прохождение (в минутах) */
    maxMinutes: number
    /** Показывать ли таймер пользователю */
    showTimer: boolean
  }
}

// ===== ОСНОВНАЯ СУЩНОСТЬ =====

export interface FlowStepSnapshotProps {
  id: string
  flowSnapshotId: string
  componentSnapshotIds: string[]
  originalStepReference: OriginalStepReference
  metadata: StepSnapshotMetadata
  accessSettings: StepAccessSettings
  unlockConditions?: Record<string, any>
  customData?: Record<string, any>
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export class FlowStepSnapshot extends Entity<FlowStepSnapshotProps> {
  
  constructor(props: FlowStepSnapshotProps) {
    super(props)
    this.validate()
  }

  // ===== GETTERS =====

  get flowSnapshotId(): string {
    return this.props.flowSnapshotId
  }

  get componentSnapshotIds(): string[] {
    return [...this.props.componentSnapshotIds]
  }

  get originalStepReference(): OriginalStepReference {
    return { ...this.props.originalStepReference }
  }

  get metadata(): StepSnapshotMetadata {
    return { ...this.props.metadata }
  }

  get accessSettings(): StepAccessSettings {
    return { ...this.props.accessSettings }
  }

  get unlockConditions(): Record<string, any> | undefined {
    return this.props.unlockConditions ? { ...this.props.unlockConditions } : undefined
  }

  get customData(): Record<string, any> | undefined {
    return this.props.customData ? { ...this.props.customData } : undefined
  }

  get createdBy(): string {
    return this.props.createdBy
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  // ===== ВЫЧИСЛЯЕМЫЕ СВОЙСТВА =====

  get title(): string {
    return this.props.originalStepReference.originalStepTitle
  }

  get description(): string | undefined {
    return this.props.originalStepReference.originalStepDescription
  }

  get order(): number {
    return this.props.originalStepReference.originalOrder
  }

  get hasComponents(): boolean {
    return this.props.componentSnapshotIds.length > 0
  }

  get componentCount(): number {
    return this.props.componentSnapshotIds.length
  }

  get requiredComponentCount(): number {
    return this.props.metadata.requiredComponents
  }

  get hasRequiredComponents(): boolean {
    return this.props.metadata.requiredComponents > 0
  }

  get hasOptionalComponents(): boolean {
    return this.props.metadata.totalComponents > this.props.metadata.requiredComponents
  }

  get isSkippable(): boolean {
    return this.props.accessSettings.isSkippable
  }

  get requiresPreviousCompletion(): boolean {
    return this.props.accessSettings.requiresPreviousCompletion
  }

  get hasTimeLimit(): boolean {
    return !!this.props.accessSettings.timeLimit
  }

  get estimatedDuration(): number | undefined {
    return this.props.metadata.estimatedDurationMinutes
  }

  // ===== МЕТОДЫ ДОСТУПА К КОМПОНЕНТАМ =====

  /**
   * Получает ID первого компонента
   */
  getFirstComponentId(): string | null {
    return this.props.componentSnapshotIds.length > 0 ? this.props.componentSnapshotIds[0] : null
  }

  /**
   * Получает ID последнего компонента
   */
  getLastComponentId(): string | null {
    const components = this.props.componentSnapshotIds
    return components.length > 0 ? components[components.length - 1] : null
  }

  /**
   * Получает ID следующего компонента
   */
  getNextComponentId(currentComponentId: string): string | null {
    const currentIndex = this.props.componentSnapshotIds.indexOf(currentComponentId)
    if (currentIndex === -1 || currentIndex === this.props.componentSnapshotIds.length - 1) {
      return null
    }
    return this.props.componentSnapshotIds[currentIndex + 1]
  }

  /**
   * Получает ID предыдущего компонента
   */
  getPreviousComponentId(currentComponentId: string): string | null {
    const currentIndex = this.props.componentSnapshotIds.indexOf(currentComponentId)
    if (currentIndex <= 0) {
      return null
    }
    return this.props.componentSnapshotIds[currentIndex - 1]
  }

  /**
   * Проверяет, содержит ли шаг указанный компонент
   */
  containsComponent(componentSnapshotId: string): boolean {
    return this.props.componentSnapshotIds.includes(componentSnapshotId)
  }

  /**
   * Получает позицию компонента в шаге (начиная с 0)
   */
  getComponentPosition(componentSnapshotId: string): number {
    return this.props.componentSnapshotIds.indexOf(componentSnapshotId)
  }

  // ===== МЕТОДЫ ПРОВЕРКИ ДОСТУПА =====

  /**
   * Проверяет, может ли пользователь получить доступ к шагу
   */
  canAccess(context: {
    previousStepsCompleted: boolean
    userRole?: string
    customConditions?: Record<string, any>
  }): {
    canAccess: boolean
    reasons: string[]
  } {
    const reasons: string[] = []

    // Проверка завершения предыдущих шагов
    if (this.requiresPreviousCompletion && !context.previousStepsCompleted) {
      reasons.push('Необходимо завершить предыдущие шаги')
    }

    // Проверка кастомных условий разблокировки
    if (this.unlockConditions && context.customConditions) {
      for (const [key, requiredValue] of Object.entries(this.unlockConditions)) {
        if (context.customConditions[key] !== requiredValue) {
          reasons.push(`Не выполнено условие: ${key}`)
        }
      }
    }

    return {
      canAccess: reasons.length === 0,
      reasons
    }
  }

  /**
   * Проверяет, можно ли пропустить шаг
   */
  canSkip(context: {
    userRole?: string
    adminOverride?: boolean
  }): {
    canSkip: boolean
    reason?: string
  } {
    if (context.adminOverride) {
      return { canSkip: true }
    }

    if (!this.isSkippable) {
      return { 
        canSkip: false, 
        reason: 'Шаг не может быть пропущен' 
      }
    }

    if (this.hasRequiredComponents) {
      return { 
        canSkip: false, 
        reason: 'Шаг содержит обязательные компоненты' 
      }
    }

    return { canSkip: true }
  }

  // ===== МЕТОДЫ ОБНОВЛЕНИЯ =====

  /**
   * Обновляет кастомные данные шага
   */
  updateCustomData(newData: Record<string, any>): FlowStepSnapshot {
    return new FlowStepSnapshot({
      ...this.props,
      customData: { ...this.props.customData, ...newData },
      updatedAt: new Date()
    })
  }

  /**
   * Обновляет условия разблокировки
   */
  updateUnlockConditions(newConditions: Record<string, any>): FlowStepSnapshot {
    return new FlowStepSnapshot({
      ...this.props,
      unlockConditions: { ...this.props.unlockConditions, ...newConditions },
      updatedAt: new Date()
    })
  }

  /**
   * Помечает шаг как обновленный
   */
  touch(): FlowStepSnapshot {
    return new FlowStepSnapshot({
      ...this.props,
      updatedAt: new Date()
    })
  }

  // ===== ВАЛИДАЦИЯ =====

  private validate(): void {
    if (!this.props.flowSnapshotId?.trim()) {
      throw new DomainError('FlowStepSnapshot должен принадлежать FlowSnapshot')
    }

    if (!Array.isArray(this.props.componentSnapshotIds)) {
      throw new DomainError('componentSnapshotIds должен быть массивом')
    }

    if (!this.props.originalStepReference?.originalStepId?.trim()) {
      throw new DomainError('FlowStepSnapshot должен содержать ссылку на оригинальный шаг')
    }

    if (!this.props.originalStepReference?.originalStepTitle?.trim()) {
      throw new DomainError('FlowStepSnapshot должен иметь название')
    }

    if (this.props.originalStepReference.originalOrder < 0) {
      throw new DomainError('Порядковый номер шага не может быть отрицательным')
    }

    if (!this.props.metadata?.snapshotVersion?.trim()) {
      throw new DomainError('FlowStepSnapshot должен иметь версию снапшота')
    }

    if (this.props.metadata.totalComponents !== this.props.componentSnapshotIds.length) {
      throw new DomainError('Количество компонентов в метаданных не соответствует количеству ID компонентов')
    }

    if (this.props.metadata.requiredComponents > this.props.metadata.totalComponents) {
      throw new DomainError('Количество обязательных компонентов не может превышать общее количество')
    }

    if (!this.props.createdBy?.trim()) {
      throw new DomainError('FlowStepSnapshot должен иметь создателя')
    }

    // Валидация временных ограничений
    if (this.props.accessSettings.timeLimit) {
      if (this.props.accessSettings.timeLimit.maxMinutes <= 0) {
        throw new DomainError('Временное ограничение должно быть положительным числом')
      }
    }
  }

  // ===== ПРЕОБРАЗОВАНИЯ =====

  /**
   * Преобразует в объект для сериализации
   */
  toJSON(): any {
    return {
      id: this.id,
      flowSnapshotId: this.flowSnapshotId,
      componentSnapshotIds: this.componentSnapshotIds,
      originalStepReference: this.originalStepReference,
      metadata: this.metadata,
      accessSettings: this.accessSettings,
      unlockConditions: this.unlockConditions,
      customData: this.customData,
      createdBy: this.createdBy,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    }
  }

  /**
   * Создает краткое представление для логов
   */
  toLogString(): string {
    return `FlowStepSnapshot(${this.id}, flow: ${this.flowSnapshotId}, components: ${this.componentCount}, order: ${this.order})`
  }
}

// ===== ФАБРИКА ДЛЯ СОЗДАНИЯ СНАПШОТОВ ШАГОВ =====

export interface CreateFlowStepSnapshotInput {
  flowSnapshotId: string
  originalStep: {
    id: string
    title: string
    description?: string
    order: number
    isRequired?: boolean
    estimatedDuration?: number
    accessSettings?: {
      requiresPreviousCompletion?: boolean
      isSkippable?: boolean
      maxAttempts?: number
      timeLimit?: {
        maxMinutes: number
        showTimer: boolean
      }
    }
    unlockConditions?: Record<string, any>
  }
  componentSnapshotIds: string[]
  requiredComponentsCount: number
  createdBy: string
  snapshotVersion: string
  customData?: Record<string, any>
}

export class FlowStepSnapshotFactory {
  
  /**
   * Создает новый снапшот шага
   */
  static createFromStep(input: CreateFlowStepSnapshotInput): FlowStepSnapshot {
    const now = new Date()
    const id = this.generateStepSnapshotId(input.flowSnapshotId, input.originalStep.id)
    
    // Вычисляем размер содержимого
    const contentSize = this.estimateContentSize(input)

    const props: FlowStepSnapshotProps = {
      id,
      flowSnapshotId: input.flowSnapshotId,
      componentSnapshotIds: [...input.componentSnapshotIds],
      originalStepReference: {
        originalStepId: input.originalStep.id,
        originalStepTitle: input.originalStep.title,
        originalStepDescription: input.originalStep.description,
        originalOrder: input.originalStep.order
      },
      metadata: {
        snapshotVersion: input.snapshotVersion,
        totalComponents: input.componentSnapshotIds.length,
        requiredComponents: input.requiredComponentsCount,
        estimatedDurationMinutes: input.originalStep.estimatedDuration,
        contentSize
      },
      accessSettings: {
        requiresPreviousCompletion: input.originalStep.accessSettings?.requiresPreviousCompletion ?? true,
        isSkippable: input.originalStep.accessSettings?.isSkippable ?? false,
        maxAttempts: input.originalStep.accessSettings?.maxAttempts,
        timeLimit: input.originalStep.accessSettings?.timeLimit
      },
      unlockConditions: input.originalStep.unlockConditions,
      customData: input.customData,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    }

    return new FlowStepSnapshot(props)
  }

  /**
   * Генерирует уникальный ID для снапшота шага
   */
  private static generateStepSnapshotId(flowSnapshotId: string, stepId: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 6)
    return `fss_${flowSnapshotId}_${stepId}_${timestamp}_${random}`
  }

  /**
   * Оценивает размер содержимого шага
   */
  private static estimateContentSize(input: CreateFlowStepSnapshotInput): number {
    let size = 512 // Базовый размер метаданных
    
    // Размер названия и описания
    size += (input.originalStep.title?.length || 0) * 2
    size += (input.originalStep.description?.length || 0) * 2
    
    // Размер кастомных данных
    if (input.customData) {
      size += JSON.stringify(input.customData).length * 2
    }
    
    // Приблизительный размер на компонент
    size += input.componentSnapshotIds.length * 1024 // 1KB на компонент
    
    return size
  }
}