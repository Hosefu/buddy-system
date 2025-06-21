/**
 * FlowSnapshot - доменная сущность снапшота потока
 * 
 * Файл: packages/api/src/core/entities/FlowSnapshot.ts
 * 
 * КЛЮЧЕВАЯ ОСОБЕННОСТЬ АРХИТЕКТУРЫ:
 * Когда поток назначается пользователю, создается полная неизменяемая копия (снапшот).
 * Пользователь взаимодействует ТОЛЬКО со снапшотом, а не с оригинальным потоком.
 * Это гарантирует стабильность обучения при изменениях в оригинальном контенте.
 */

import { Entity } from './base/Entity'
import { DomainError } from '../errors/DomainError'

// ===== VALUE OBJECTS =====

export interface FlowSnapshotMetadata {
  /** Версия снапшота для обратной совместимости */
  snapshotVersion: string
  /** Размер снапшота в байтах */
  sizeBytes: number
  /** Время создания снапшота */
  creationTimeMs: number
  /** Количество шагов в снапшоте */
  totalSteps: number
  /** Количество компонентов в снапшоте */
  totalComponents: number
  /** Хеш содержимого для проверки целостности */
  contentHash: string
}

export interface OriginalFlowReference {
  /** ID оригинального потока */
  originalFlowId: string
  /** Версия оригинального потока на момент создания снапшота */
  originalFlowVersion: string
  /** Название оригинального потока */
  originalFlowTitle: string
  /** Описание оригинального потока */
  originalFlowDescription?: string
}

// ===== ОСНОВНАЯ СУЩНОСТЬ =====

export interface FlowSnapshotProps {
  id: string
  assignmentId: string
  stepSnapshotIds: string[]
  originalFlowReference: OriginalFlowReference
  metadata: FlowSnapshotMetadata
  context?: Record<string, any>
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export class FlowSnapshot extends Entity<FlowSnapshotProps> {
  
  constructor(props: FlowSnapshotProps) {
    super(props)
    this.validate()
  }

  // ===== GETTERS =====

  get assignmentId(): string {
    return this.props.assignmentId
  }

  get stepSnapshotIds(): string[] {
    return [...this.props.stepSnapshotIds] // Возвращаем копию для immutability
  }

  get originalFlowReference(): OriginalFlowReference {
    return { ...this.props.originalFlowReference }
  }

  get metadata(): FlowSnapshotMetadata {
    return { ...this.props.metadata }
  }

  get context(): Record<string, any> | undefined {
    return this.props.context ? { ...this.props.context } : undefined
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

  get isLarge(): boolean {
    return this.props.metadata.sizeBytes > 10 * 1024 * 1024 // > 10MB
  }

  get hasSteps(): boolean {
    return this.props.stepSnapshotIds.length > 0
  }

  get stepCount(): number {
    return this.props.stepSnapshotIds.length
  }

  get snapshotAge(): number {
    return Date.now() - this.props.createdAt.getTime()
  }

  get isRecent(): boolean {
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000
    return this.snapshotAge < oneWeekMs
  }

  // ===== МЕТОДЫ ДОСТУПА К ШАГАМ =====

  /**
   * Получает ID первого шага (для навигации)
   */
  getFirstStepId(): string | null {
    return this.props.stepSnapshotIds.length > 0 ? this.props.stepSnapshotIds[0] : null
  }

  /**
   * Получает ID последнего шага
   */
  getLastStepId(): string | null {
    const steps = this.props.stepSnapshotIds
    return steps.length > 0 ? steps[steps.length - 1] : null
  }

  /**
   * Получает ID следующего шага после указанного
   */
  getNextStepId(currentStepId: string): string | null {
    const currentIndex = this.props.stepSnapshotIds.indexOf(currentStepId)
    if (currentIndex === -1 || currentIndex === this.props.stepSnapshotIds.length - 1) {
      return null
    }
    return this.props.stepSnapshotIds[currentIndex + 1]
  }

  /**
   * Получает ID предыдущего шага
   */
  getPreviousStepId(currentStepId: string): string | null {
    const currentIndex = this.props.stepSnapshotIds.indexOf(currentStepId)
    if (currentIndex <= 0) {
      return null
    }
    return this.props.stepSnapshotIds[currentIndex - 1]
  }

  /**
   * Проверяет, содержит ли снапшот указанный шаг
   */
  containsStep(stepSnapshotId: string): boolean {
    return this.props.stepSnapshotIds.includes(stepSnapshotId)
  }

  // ===== МЕТОДЫ ОБНОВЛЕНИЯ =====

  /**
   * Обновляет контекст снапшота
   */
  updateContext(newContext: Record<string, any>): FlowSnapshot {
    return new FlowSnapshot({
      ...this.props,
      context: { ...this.props.context, ...newContext },
      updatedAt: new Date()
    })
  }

  /**
   * Помечает снапшот как обновленный (touch)
   */
  touch(): FlowSnapshot {
    return new FlowSnapshot({
      ...this.props,
      updatedAt: new Date()
    })
  }

  // ===== ВАЛИДАЦИЯ =====

  private validate(): void {
    if (!this.props.assignmentId?.trim()) {
      throw new DomainError('FlowSnapshot должен иметь assignmentId')
    }

    if (!Array.isArray(this.props.stepSnapshotIds)) {
      throw new DomainError('stepSnapshotIds должен быть массивом')
    }

    if (!this.props.originalFlowReference?.originalFlowId?.trim()) {
      throw new DomainError('FlowSnapshot должен содержать ссылку на оригинальный поток')
    }

    if (!this.props.metadata?.snapshotVersion?.trim()) {
      throw new DomainError('FlowSnapshot должен иметь версию снапшота')
    }

    if (!this.props.createdBy?.trim()) {
      throw new DomainError('FlowSnapshot должен иметь создателя')
    }

    if (this.props.metadata.totalSteps !== this.props.stepSnapshotIds.length) {
      throw new DomainError('Количество шагов в метаданных не соответствует количеству ID шагов')
    }
  }

  // ===== ПРЕОБРАЗОВАНИЯ =====

  /**
   * Преобразует в объект для сериализации
   */
  toJSON(): any {
    return {
      id: this.id,
      assignmentId: this.assignmentId,
      stepSnapshotIds: this.stepSnapshotIds,
      originalFlowReference: this.originalFlowReference,
      metadata: this.metadata,
      context: this.context,
      createdBy: this.createdBy,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    }
  }

  /**
   * Создает краткое представление для логов
   */
  toLogString(): string {
    return `FlowSnapshot(${this.id}, assignment: ${this.assignmentId}, steps: ${this.stepCount}, size: ${this.metadata.sizeBytes}b)`
  }
}

// ===== ФАБРИКА ДЛЯ СОЗДАНИЯ СНАПШОТОВ =====

export interface CreateFlowSnapshotInput {
  assignmentId: string
  originalFlow: {
    id: string
    title: string
    description?: string
    version: string
    estimatedDuration?: number
    difficulty?: string
    tags?: string[]
  }
  stepSnapshotIds: string[]
  createdBy: string
  snapshotVersion: string
  context?: Record<string, any>
}

export class FlowSnapshotFactory {
  
  /**
   * Создает новый снапшот потока
   */
  static createFromFlow(input: CreateFlowSnapshotInput): FlowSnapshot {
    const now = new Date()
    const id = this.generateSnapshotId(input.assignmentId, input.originalFlow.id)
    
    // Вычисляем размер снапшота (приблизительно)
    const estimatedSize = this.estimateSnapshotSize(input)
    
    // Создаем хеш содержимого
    const contentHash = this.generateContentHash(input)

    const props: FlowSnapshotProps = {
      id,
      assignmentId: input.assignmentId,
      stepSnapshotIds: [...input.stepSnapshotIds],
      originalFlowReference: {
        originalFlowId: input.originalFlow.id,
        originalFlowVersion: input.originalFlow.version,
        originalFlowTitle: input.originalFlow.title,
        originalFlowDescription: input.originalFlow.description
      },
      metadata: {
        snapshotVersion: input.snapshotVersion,
        sizeBytes: estimatedSize,
        creationTimeMs: Date.now(),
        totalSteps: input.stepSnapshotIds.length,
        totalComponents: 0, // Будет обновлено после создания компонентов
        contentHash
      },
      context: input.context,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    }

    return new FlowSnapshot(props)
  }

  /**
   * Генерирует уникальный ID для снапшота
   */
  private static generateSnapshotId(assignmentId: string, flowId: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `fs_${assignmentId}_${flowId}_${timestamp}_${random}`
  }

  /**
   * Приблизительно оценивает размер снапшота
   */
  private static estimateSnapshotSize(input: CreateFlowSnapshotInput): number {
    // Базовый размер метаданных
    let size = 1024 // 1KB для базовых данных
    
    // Размер контекста
    if (input.context) {
      size += JSON.stringify(input.context).length * 2 // UTF-16
    }
    
    // Размер на шаг (приблизительно)
    size += input.stepSnapshotIds.length * 2048 // 2KB на шаг
    
    return size
  }

  /**
   * Генерирует хеш содержимого для проверки целостности
   */
  private static generateContentHash(input: CreateFlowSnapshotInput): string {
    const content = JSON.stringify({
      flowId: input.originalFlow.id,
      flowVersion: input.originalFlow.version,
      stepIds: input.stepSnapshotIds,
      timestamp: Math.floor(Date.now() / 1000) // Округляем до секунд
    })
    
    // Простой хеш (в реальном проекте стоит использовать crypto)
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Конвертируем в 32-битное число
    }
    
    return `sha256_${Math.abs(hash).toString(16)}`
  }

  /**
   * Обновляет метаданные снапшота после создания всех компонентов
   */
  static updateMetadataAfterCreation(
    snapshot: FlowSnapshot, 
    totalComponents: number, 
    actualSizeBytes: number
  ): FlowSnapshot {
    const updatedMetadata: FlowSnapshotMetadata = {
      ...snapshot.metadata,
      totalComponents,
      sizeBytes: actualSizeBytes
    }

    return new FlowSnapshot({
      ...snapshot.props,
      metadata: updatedMetadata,
      updatedAt: new Date()
    })
  }
}