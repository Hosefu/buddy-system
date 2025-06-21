/**
 * Доменная сущность FlowSnapshot
 * 
 * Представляет неизменяемый снапшот потока на момент назначения пользователю.
 * Это ключевая особенность архитектуры - пользователи никогда не взаимодействуют
 * с оригинальными Flow, только со снапшотами.
 * 
 * Снапшот содержит полную копию потока со всеми его шагами и компонентами
 * на момент создания, что гарантирует стабильность обучения даже при
 * изменении оригинального потока.
 */

export interface FlowSnapshotData {
    /** Уникальный идентификатор снапшота */
    id: string
    
    /** ID назначения, к которому относится снапшот */
    assignmentId: string
    
    /** ID оригинального потока, с которого сделан снапшот */
    originalFlowId: string
    
    /** Метаданные о потоке на момент создания снапшота */
    flowMeta: {
      /** Название потока */
      title: string
      /** Описание потока */
      description: string
      /** Версия потока на момент снапшота */
      version: string
      /** Примерное время прохождения (в минутах) */
      estimatedDuration?: number
      /** Уровень сложности */
      difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
      /** Теги для категоризации */
      tags: string[]
    }
    
    /** Массив ID снапшотов шагов, входящих в поток */
    stepSnapshotIds: string[]
    
    /** Метаданные создания снапшота */
    snapshotMeta: {
      /** Дата и время создания снапшота */
      createdAt: Date
      /** ID пользователя, который создал снапшот (обычно система) */
      createdBy: string
      /** Версия алгоритма создания снапшота */
      snapshotVersion: string
      /** Дополнительная информация о контексте создания */
      context?: Record<string, any>
    }
  }
  
  export class FlowSnapshot {
    private data: FlowSnapshotData
  
    constructor(data: FlowSnapshotData) {
      this.data = { ...data }
      this.validate()
    }
  
    // ===== ГЕТТЕРЫ =====
  
    get id(): string {
      return this.data.id
    }
  
    get assignmentId(): string {
      return this.data.assignmentId
    }
  
    get originalFlowId(): string {
      return this.data.originalFlowId
    }
  
    get title(): string {
      return this.data.flowMeta.title
    }
  
    get description(): string {
      return this.data.flowMeta.description
    }
  
    get version(): string {
      return this.data.flowMeta.version
    }
  
    get estimatedDuration(): number | undefined {
      return this.data.flowMeta.estimatedDuration
    }
  
    get difficulty(): 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | undefined {
      return this.data.flowMeta.difficulty
    }
  
    get tags(): string[] {
      return [...this.data.flowMeta.tags]
    }
  
    get stepSnapshotIds(): string[] {
      return [...this.data.stepSnapshotIds]
    }
  
    get createdAt(): Date {
      return new Date(this.data.snapshotMeta.createdAt)
    }
  
    get createdBy(): string {
      return this.data.snapshotMeta.createdBy
    }
  
    get snapshotVersion(): string {
      return this.data.snapshotMeta.snapshotVersion
    }
  
    get context(): Record<string, any> | undefined {
      return this.data.snapshotMeta.context
    }
  
    // ===== МЕТОДЫ БИЗНЕС-ЛОГИКИ =====
  
    /**
     * Проверяет, является ли снапшот актуальным
     * (созданным недавно, в зависимости от бизнес-правил)
     */
    isRecent(maxAgeInDays = 30): boolean {
      const now = new Date()
      const daysDiff = (now.getTime() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      return daysDiff <= maxAgeInDays
    }
  
    /**
     * Проверяет, совместим ли снапшот с текущей версией системы
     */
    isCompatible(currentSnapshotVersion: string): boolean {
      // Простая проверка совместимости по major версии
      const currentMajor = currentSnapshotVersion.split('.')[0]
      const snapshotMajor = this.snapshotVersion.split('.')[0]
      return currentMajor === snapshotMajor
    }
  
    /**
     * Возвращает количество шагов в снапшоте
     */
    getStepCount(): number {
      return this.stepSnapshotIds.length
    }
  
    /**
     * Проверяет, содержит ли снапшот определенный шаг
     */
    hasStep(stepSnapshotId: string): boolean {
      return this.stepSnapshotIds.includes(stepSnapshotId)
    }
  
    /**
     * Возвращает позицию шага в последовательности (начиная с 0)
     */
    getStepPosition(stepSnapshotId: string): number {
      return this.stepSnapshotIds.indexOf(stepSnapshotId)
    }
  
    /**
     * Возвращает ID следующего шага после указанного
     */
    getNextStepId(currentStepSnapshotId: string): string | null {
      const currentIndex = this.getStepPosition(currentStepSnapshotId)
      if (currentIndex === -1 || currentIndex === this.stepSnapshotIds.length - 1) {
        return null
      }
      return this.stepSnapshotIds[currentIndex + 1]
    }
  
    /**
     * Возвращает ID предыдущего шага перед указанным
     */
    getPreviousStepId(currentStepSnapshotId: string): string | null {
      const currentIndex = this.getStepPosition(currentStepSnapshotId)
      if (currentIndex <= 0) {
        return null
      }
      return this.stepSnapshotIds[currentIndex - 1]
    }
  
    /**
     * Проверяет, является ли шаг первым в потоке
     */
    isFirstStep(stepSnapshotId: string): boolean {
      return this.stepSnapshotIds[0] === stepSnapshotId
    }
  
    /**
     * Проверяет, является ли шаг последним в потоке
     */
    isLastStep(stepSnapshotId: string): boolean {
      return this.stepSnapshotIds[this.stepSnapshotIds.length - 1] === stepSnapshotId
    }
  
    // ===== МЕТОДЫ СЕРИАЛИЗАЦИИ =====
  
    /**
     * Возвращает копию внутренних данных для сериализации
     */
    toData(): FlowSnapshotData {
      return JSON.parse(JSON.stringify(this.data))
    }
  
    /**
     * Создает новый экземпляр из данных
     */
    static fromData(data: FlowSnapshotData): FlowSnapshot {
      return new FlowSnapshot(data)
    }
  
    /**
     * Создает новый снапшот с обновленными метаданными
     */
    withUpdatedContext(newContext: Record<string, any>): FlowSnapshot {
      const updatedData = {
        ...this.data,
        snapshotMeta: {
          ...this.data.snapshotMeta,
          context: { ...this.data.snapshotMeta.context, ...newContext }
        }
      }
      return new FlowSnapshot(updatedData)
    }
  
    // ===== ПРИВАТНЫЕ МЕТОДЫ =====
  
    /**
     * Валидация данных снапшота
     */
    private validate(): void {
      if (!this.data.id) {
        throw new Error('FlowSnapshot: ID обязателен')
      }
  
      if (!this.data.assignmentId) {
        throw new Error('FlowSnapshot: assignmentId обязателен')
      }
  
      if (!this.data.originalFlowId) {
        throw new Error('FlowSnapshot: originalFlowId обязателен')
      }
  
      if (!this.data.flowMeta.title?.trim()) {
        throw new Error('FlowSnapshot: title обязателен')
      }
  
      if (!this.data.flowMeta.version) {
        throw new Error('FlowSnapshot: version обязательна')
      }
  
      if (!Array.isArray(this.data.stepSnapshotIds)) {
        throw new Error('FlowSnapshot: stepSnapshotIds должен быть массивом')
      }
  
      if (!this.data.snapshotMeta.createdAt) {
        throw new Error('FlowSnapshot: createdAt обязателен')
      }
  
      if (!this.data.snapshotMeta.snapshotVersion) {
        throw new Error('FlowSnapshot: snapshotVersion обязательна')
      }
  
      // Валидация difficulty
      if (this.data.flowMeta.difficulty && 
          !['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].includes(this.data.flowMeta.difficulty)) {
        throw new Error('FlowSnapshot: некорректное значение difficulty')
      }
  
      // Валидация тегов
      if (!Array.isArray(this.data.flowMeta.tags)) {
        throw new Error('FlowSnapshot: tags должен быть массивом')
      }
  
      // Валидация estimatedDuration
      if (this.data.flowMeta.estimatedDuration !== undefined && 
          this.data.flowMeta.estimatedDuration < 0) {
        throw new Error('FlowSnapshot: estimatedDuration не может быть отрицательным')
      }
    }
  }
  
  /**
   * Фабричный метод для создания нового снапшота потока
   */
  export class FlowSnapshotFactory {
    /**
     * Создает новый снапшот потока на основе оригинального потока
     */
    static createFromFlow(params: {
      assignmentId: string
      originalFlow: {
        id: string
        title: string
        description: string
        version: string
        estimatedDuration?: number
        difficulty?: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
        tags: string[]
      }
      stepSnapshotIds: string[]
      createdBy: string
      snapshotVersion: string
      context?: Record<string, any>
    }): FlowSnapshot {
      const snapshotId = `flow_snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      return new FlowSnapshot({
        id: snapshotId,
        assignmentId: params.assignmentId,
        originalFlowId: params.originalFlow.id,
        flowMeta: {
          title: params.originalFlow.title,
          description: params.originalFlow.description,
          version: params.originalFlow.version,
          estimatedDuration: params.originalFlow.estimatedDuration,
          difficulty: params.originalFlow.difficulty,
          tags: [...params.originalFlow.tags]
        },
        stepSnapshotIds: [...params.stepSnapshotIds],
        snapshotMeta: {
          createdAt: new Date(),
          createdBy: params.createdBy,
          snapshotVersion: params.snapshotVersion,
          context: params.context
        }
      })
    }
  }