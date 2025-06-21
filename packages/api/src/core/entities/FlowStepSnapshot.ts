/**
 * Доменная сущность FlowStepSnapshot
 * 
 * Представляет неизменяемый снапшот шага потока на момент назначения.
 * Каждый шаг содержит набор компонентов (статьи, задания, квизы) и правила
 * их разблокировки.
 * 
 * Снапшот шага включает:
 * - Метаданные шага (название, описание, порядок)
 * - Список компонентов-снапшотов
 * - Правила разблокировки и прогресса
 * - Условия завершения шага
 */

export interface UnlockCondition {
    /** Тип условия разблокировки */
    type: 'PREVIOUS_STEP_COMPLETED' | 'SPECIFIC_COMPONENT_COMPLETED' | 'TIME_BASED' | 'MANUAL'
    /** Параметры условия (зависят от типа) */
    params?: Record<string, any>
  }
  
  export interface CompletionRequirement {
    /** Тип требования для завершения шага */
    type: 'ALL_COMPONENTS' | 'REQUIRED_COMPONENTS' | 'PERCENTAGE' | 'CUSTOM'
    /** Параметры требования */
    params?: {
      /** Процент компонентов для завершения (для type: 'PERCENTAGE') */
      percentage?: number
      /** Список ID обязательных компонентов (для type: 'REQUIRED_COMPONENTS') */
      requiredComponentIds?: string[]
      /** Кастомная логика (для type: 'CUSTOM') */
      customLogic?: string
    }
  }
  
  export interface FlowStepSnapshotData {
    /** Уникальный идентификатор снапшота шага */
    id: string
    
    /** ID снапшота потока, к которому относится шаг */
    flowSnapshotId: string
    
    /** ID оригинального шага, с которого сделан снапшот */
    originalStepId: string
    
    /** Метаданные шага */
    stepMeta: {
      /** Название шага */
      title: string
      /** Описание шага */
      description: string
      /** Порядковый номер шага в потоке (начиная с 0) */
      order: number
      /** Примерное время прохождения шага (в минутах) */
      estimatedDuration?: number
      /** Иконка или emoji для шага */
      icon?: string
      /** Цвет темы шага (hex) */
      themeColor?: string
    }
    
    /** Массив ID снапшотов компонентов этого шага */
    componentSnapshotIds: string[]
    
    /** Условия разблокировки шага */
    unlockConditions: UnlockCondition[]
    
    /** Требования для завершения шага */
    completionRequirements: CompletionRequirement
    
    /** Метаданные создания снапшота */
    snapshotMeta: {
      /** Дата и время создания снапшота */
      createdAt: Date
      /** ID пользователя, который создал снапшот */
      createdBy: string
      /** Версия алгоритма создания снапшота */
      snapshotVersion: string
      /** Дополнительная информация */
      context?: Record<string, any>
    }
  }
  
  export class FlowStepSnapshot {
    private data: FlowStepSnapshotData
  
    constructor(data: FlowStepSnapshotData) {
      this.data = { ...data }
      this.validate()
    }
  
    // ===== ГЕТТЕРЫ =====
  
    get id(): string {
      return this.data.id
    }
  
    get flowSnapshotId(): string {
      return this.data.flowSnapshotId
    }
  
    get originalStepId(): string {
      return this.data.originalStepId
    }
  
    get title(): string {
      return this.data.stepMeta.title
    }
  
    get description(): string {
      return this.data.stepMeta.description
    }
  
    get order(): number {
      return this.data.stepMeta.order
    }
  
    get estimatedDuration(): number | undefined {
      return this.data.stepMeta.estimatedDuration
    }
  
    get icon(): string | undefined {
      return this.data.stepMeta.icon
    }
  
    get themeColor(): string | undefined {
      return this.data.stepMeta.themeColor
    }
  
    get componentSnapshotIds(): string[] {
      return [...this.data.componentSnapshotIds]
    }
  
    get unlockConditions(): UnlockCondition[] {
      return JSON.parse(JSON.stringify(this.data.unlockConditions))
    }
  
    get completionRequirements(): CompletionRequirement {
      return JSON.parse(JSON.stringify(this.data.completionRequirements))
    }
  
    get createdAt(): Date {
      return new Date(this.data.snapshotMeta.createdAt)
    }
  
    get snapshotVersion(): string {
      return this.data.snapshotMeta.snapshotVersion
    }
  
    // ===== МЕТОДЫ БИЗНЕС-ЛОГИКИ =====
  
    /**
     * Возвращает количество компонентов в шаге
     */
    getComponentCount(): number {
      return this.componentSnapshotIds.length
    }
  
    /**
     * Проверяет, содержит ли шаг определенный компонент
     */
    hasComponent(componentSnapshotId: string): boolean {
      return this.componentSnapshotIds.includes(componentSnapshotId)
    }
  
    /**
     * Возвращает позицию компонента в шаге (начиная с 0)
     */
    getComponentPosition(componentSnapshotId: string): number {
      return this.componentSnapshotIds.indexOf(componentSnapshotId)
    }
  
    /**
     * Возвращает ID следующего компонента после указанного
     */
    getNextComponentId(currentComponentSnapshotId: string): string | null {
      const currentIndex = this.getComponentPosition(currentComponentSnapshotId)
      if (currentIndex === -1 || currentIndex === this.componentSnapshotIds.length - 1) {
        return null
      }
      return this.componentSnapshotIds[currentIndex + 1]
    }
  
    /**
     * Проверяет, является ли компонент первым в шаге
     */
    isFirstComponent(componentSnapshotId: string): boolean {
      return this.componentSnapshotIds[0] === componentSnapshotId
    }
  
    /**
     * Проверяет, является ли компонент последним в шаге
     */
    isLastComponent(componentSnapshotId: string): boolean {
      return this.componentSnapshotIds[this.componentSnapshotIds.length - 1] === componentSnapshotId
    }
  
    /**
     * Проверяет, можно ли разблокировать шаг на основе условий
     */
    canUnlock(context: {
      /** Завершенные шаги */
      completedStepIds: string[]
      /** Завершенные компоненты */
      completedComponentIds: string[]
      /** Текущее время */
      currentTime: Date
      /** Дополнительный контекст */
      additionalContext?: Record<string, any>
    }): boolean {
      return this.unlockConditions.every(condition => {
        switch (condition.type) {
          case 'PREVIOUS_STEP_COMPLETED':
            // Проверяем, что предыдущий шаг завершен
            const previousStepId = condition.params?.stepId
            return previousStepId ? context.completedStepIds.includes(previousStepId) : true
  
          case 'SPECIFIC_COMPONENT_COMPLETED':
            // Проверяем, что определенный компонент завершен
            const requiredComponentId = condition.params?.componentId
            return requiredComponentId ? context.completedComponentIds.includes(requiredComponentId) : true
  
          case 'TIME_BASED':
            // Проверяем временное условие
            const unlockTime = condition.params?.unlockAt ? new Date(condition.params.unlockAt) : null
            return unlockTime ? context.currentTime >= unlockTime : true
  
          case 'MANUAL':
            // Ручная разблокировка - проверяем флаг в контексте
            return context.additionalContext?.manuallyUnlocked === true
  
          default:
            return true
        }
      })
    }
  
    /**
     * Проверяет, завершен ли шаг на основе требований
     */
    isCompleted(context: {
      /** Завершенные компоненты этого шага */
      completedComponentIds: string[]
      /** Дополнительный контекст */
      additionalContext?: Record<string, any>
    }): boolean {
      const requirement = this.completionRequirements
  
      switch (requirement.type) {
        case 'ALL_COMPONENTS':
          // Все компоненты должны быть завершены
          return this.componentSnapshotIds.every(id => context.completedComponentIds.includes(id))
  
        case 'REQUIRED_COMPONENTS':
          // Только обязательные компоненты должны быть завершены
          const requiredIds = requirement.params?.requiredComponentIds || []
          return requiredIds.every(id => context.completedComponentIds.includes(id))
  
        case 'PERCENTAGE':
          // Определенный процент компонентов должен быть завершен
          const requiredPercentage = requirement.params?.percentage || 100
          const completedCount = this.componentSnapshotIds.filter(id => 
            context.completedComponentIds.includes(id)).length
          const completionPercentage = (completedCount / this.componentSnapshotIds.length) * 100
          return completionPercentage >= requiredPercentage
  
        case 'CUSTOM':
          // Кастомная логика - в реальном проекте здесь был бы интерпретатор правил
          return context.additionalContext?.customCompleted === true
  
        default:
          return false
      }
    }
  
    /**
     * Возвращает прогресс завершения шага (0-100)
     */
    getCompletionProgress(completedComponentIds: string[]): number {
      if (this.componentSnapshotIds.length === 0) {
        return 100
      }
  
      const completedCount = this.componentSnapshotIds.filter(id => 
        completedComponentIds.includes(id)).length
      
      return Math.round((completedCount / this.componentSnapshotIds.length) * 100)
    }
  
    /**
     * Возвращает список обязательных компонентов для завершения
     */
    getRequiredComponentIds(): string[] {
      const requirement = this.completionRequirements
  
      switch (requirement.type) {
        case 'ALL_COMPONENTS':
          return [...this.componentSnapshotIds]
  
        case 'REQUIRED_COMPONENTS':
          return requirement.params?.requiredComponentIds || []
  
        case 'PERCENTAGE':
          // Для процентного требования возвращаем все компоненты
          return [...this.componentSnapshotIds]
  
        default:
          return []
      }
    }
  
    // ===== МЕТОДЫ СЕРИАЛИЗАЦИИ =====
  
    /**
     * Возвращает копию внутренних данных для сериализации
     */
    toData(): FlowStepSnapshotData {
      return JSON.parse(JSON.stringify(this.data))
    }
  
    /**
     * Создает новый экземпляр из данных
     */
    static fromData(data: FlowStepSnapshotData): FlowStepSnapshot {
      return new FlowStepSnapshot(data)
    }
  
    // ===== ПРИВАТНЫЕ МЕТОДЫ =====
  
    /**
     * Валидация данных снапшота шага
     */
    private validate(): void {
      if (!this.data.id) {
        throw new Error('FlowStepSnapshot: ID обязателен')
      }
  
      if (!this.data.flowSnapshotId) {
        throw new Error('FlowStepSnapshot: flowSnapshotId обязателен')
      }
  
      if (!this.data.originalStepId) {
        throw new Error('FlowStepSnapshot: originalStepId обязателен')
      }
  
      if (!this.data.stepMeta.title?.trim()) {
        throw new Error('FlowStepSnapshot: title обязателен')
      }
  
      if (typeof this.data.stepMeta.order !== 'number' || this.data.stepMeta.order < 0) {
        throw new Error('FlowStepSnapshot: order должен быть неотрицательным числом')
      }
  
      if (!Array.isArray(this.data.componentSnapshotIds)) {
        throw new Error('FlowStepSnapshot: componentSnapshotIds должен быть массивом')
      }
  
      if (!Array.isArray(this.data.unlockConditions)) {
        throw new Error('FlowStepSnapshot: unlockConditions должен быть массивом')
      }
  
      if (!this.data.completionRequirements) {
        throw new Error('FlowStepSnapshot: completionRequirements обязательны')
      }
  
      // Валидация условий разблокировки
      this.data.unlockConditions.forEach((condition, index) => {
        if (!['PREVIOUS_STEP_COMPLETED', 'SPECIFIC_COMPONENT_COMPLETED', 'TIME_BASED', 'MANUAL'].includes(condition.type)) {
          throw new Error(`FlowStepSnapshot: некорректный тип условия разблокировки на позиции ${index}`)
        }
      })
  
      // Валидация требований завершения
      if (!['ALL_COMPONENTS', 'REQUIRED_COMPONENTS', 'PERCENTAGE', 'CUSTOM'].includes(this.data.completionRequirements.type)) {
        throw new Error('FlowStepSnapshot: некорректный тип требования завершения')
      }
  
      if (this.data.completionRequirements.type === 'PERCENTAGE') {
        const percentage = this.data.completionRequirements.params?.percentage
        if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
          throw new Error('FlowStepSnapshot: процент завершения должен быть числом от 0 до 100')
        }
      }
  
      if (!this.data.snapshotMeta.createdAt) {
        throw new Error('FlowStepSnapshot: createdAt обязателен')
      }
    }
  }
  
  /**
   * Фабричный метод для создания снапшота шага
   */
  export class FlowStepSnapshotFactory {
    /**
     * Создает новый снапшот шага на основе оригинального шага
     */
    static createFromStep(params: {
      flowSnapshotId: string
      originalStep: {
        id: string
        title: string
        description: string
        order: number
        estimatedDuration?: number
        icon?: string
        themeColor?: string
      }
      componentSnapshotIds: string[]
      unlockConditions: UnlockCondition[]
      completionRequirements: CompletionRequirement
      createdBy: string
      snapshotVersion: string
      context?: Record<string, any>
    }): FlowStepSnapshot {
      const snapshotId = `step_snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      return new FlowStepSnapshot({
        id: snapshotId,
        flowSnapshotId: params.flowSnapshotId,
        originalStepId: params.originalStep.id,
        stepMeta: {
          title: params.originalStep.title,
          description: params.originalStep.description,
          order: params.originalStep.order,
          estimatedDuration: params.originalStep.estimatedDuration,
          icon: params.originalStep.icon,
          themeColor: params.originalStep.themeColor
        },
        componentSnapshotIds: [...params.componentSnapshotIds],
        unlockConditions: JSON.parse(JSON.stringify(params.unlockConditions)),
        completionRequirements: JSON.parse(JSON.stringify(params.completionRequirements)),
        snapshotMeta: {
          createdAt: new Date(),
          createdBy: params.createdBy,
          snapshotVersion: params.snapshotVersion,
          context: params.context
        }
      })
    }
  }