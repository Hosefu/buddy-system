/**
 * BaseComponentHandler - базовый класс для всех обработчиков компонентов
 * 
 * Файл: packages/api/src/core/services/component/handlers/BaseComponentHandler.ts
 * 
 * Определяет общий интерфейс и базовую функциональность для обработки
 * различных типов компонентов. Реализует паттерн Template Method.
 */

import { ComponentAction } from '../../../usecases/component/InteractWithComponentUseCase'
import { ComponentHandlerResult, ComponentInteractionContext } from '../ComponentFactory'
import { ComponentProgress, ComponentProgressStatus } from '../../../entities/ComponentProgress'

// ===== ИНТЕРФЕЙСЫ =====

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings?: string[]
}

export interface InteractionMetrics {
  /** Время начала взаимодействия */
  startTime: number
  /** Время завершения */
  endTime?: number
  /** Количество попыток */
  attempts: number
  /** Было ли взаимодействие успешным */
  successful: boolean
  /** Дополнительные метрики */
  customMetrics?: Record<string, any>
}

// ===== БАЗОВЫЙ ОБРАБОТЧИК =====

export abstract class BaseComponentHandler {
  protected context: ComponentInteractionContext
  protected metrics: InteractionMetrics

  constructor(context: ComponentInteractionContext) {
    this.context = context
    this.metrics = {
      startTime: Date.now(),
      attempts: 0,
      successful: false
    }
  }

  // ===== ABSTRACT МЕТОДЫ (должны быть реализованы в наследниках) =====

  /**
   * Обрабатывает конкретное действие с компонентом
   */
  protected abstract processAction(
    action: ComponentAction,
    data: any
  ): Promise<ComponentHandlerResult>

  /**
   * Валидирует данные для конкретного типа компонента
   */
  protected abstract validateActionData(
    action: ComponentAction,
    data: any
  ): ValidationResult

  /**
   * Проверяет, завершен ли компонент после действия
   */
  protected abstract isCompleted(
    action: ComponentAction,
    data: any,
    currentProgress?: ComponentProgress
  ): boolean

  /**
   * Вычисляет прогресс в процентах (0-100)
   */
  protected abstract calculateProgress(
    action: ComponentAction,
    data: any,
    currentProgress?: ComponentProgress
  ): number

  // ===== СТАТИЧЕСКИЕ МЕТОДЫ (для фабрики) =====

  /**
   * Возвращает список поддерживаемых действий
   */
  static getSupportedActions(): string[] {
    return []
  }

  /**
   * Валидирует схему данных компонента
   */
  static validateSchema(componentData: any): ValidationResult {
    return {
      isValid: true,
      errors: []
    }
  }

  // ===== ПУБЛИЧНЫЕ МЕТОДЫ (Template Method) =====

  /**
   * Главный метод обработки взаимодействия
   */
  async processInteraction(
    action: ComponentAction,
    data: any
  ): Promise<ComponentHandlerResult> {
    try {
      this.metrics.attempts++
      this.metrics.startTime = Date.now()

      // 1. Предварительная проверка
      const preCheckResult = await this.preProcessCheck(action, data)
      if (!preCheckResult.success) {
        return preCheckResult
      }

      // 2. Обработка действия (реализуется в наследниках)
      const result = await this.processAction(action, data)

      // 3. Пост-обработка
      const finalResult = await this.postProcessResult(action, result, data)

      this.metrics.successful = finalResult.success
      this.metrics.endTime = Date.now()

      return finalResult

    } catch (error) {
      console.error(`Ошибка в обработчике компонента:`, error)
      return {
        success: false,
        message: `Ошибка обработки: ${error.message}`,
        errors: [error.message]
      }
    }
  }

  /**
   * Валидация взаимодействия
   */
  async validateInteraction(action: ComponentAction, data: any): Promise<void> {
    // Базовые проверки
    if (!action) {
      throw new Error('Действие не указано')
    }

    if (!this.isActionSupported(action)) {
      throw new Error(`Действие "${action}" не поддерживается для этого типа компонента`)
    }

    // Валидация данных (специфичная для типа)
    const validation = this.validateActionData(action, data)
    if (!validation.isValid) {
      throw new Error(`Некорректные данные: ${validation.errors.join(', ')}`)
    }

    // Проверка бизнес-правил
    await this.validateBusinessRules(action, data)
  }

  /**
   * Пост-обработка (логирование, аналитика)
   */
  async postProcess(action: ComponentAction, result: ComponentHandlerResult): Promise<void> {
    try {
      // Логирование
      console.log(`Обработано действие ${action} для компонента ${this.context.componentSnapshot?.id}`, {
        userId: this.context.userId,
        success: result.success,
        metrics: this.metrics
      })

      // Аналитика (если нужна)
      await this.trackAnalytics(action, result)

    } catch (error) {
      console.error('Ошибка пост-обработки:', error)
      // Не бросаем ошибку, чтобы не нарушить основной флоу
    }
  }

  // ===== ЗАЩИЩЕННЫЕ МЕТОДЫ =====

  /**
   * Предварительные проверки
   */
  protected async preProcessCheck(
    action: ComponentAction,
    data: any
  ): Promise<ComponentHandlerResult> {
    // Проверяем, что компонент доступен для взаимодействия
    const isAccessible = await this.checkComponentAccess()
    if (!isAccessible) {
      return {
        success: false,
        message: 'Компонент недоступен для взаимодействия'
      }
    }

    return { success: true, message: 'OK' }
  }

  /**
   * Пост-обработка результата
   */
  protected async postProcessResult(
    action: ComponentAction,
    result: ComponentHandlerResult,
    data: any
  ): Promise<ComponentHandlerResult> {
    if (!result.success) {
      return result
    }

    // Проверяем, нужно ли разблокировать следующие компоненты
    const shouldUnlock = this.isCompleted(action, data, this.context.currentProgress)
    
    return {
      ...result,
      shouldUnlock,
      data: {
        ...result.data,
        progress: this.calculateProgress(action, data, this.context.currentProgress),
        completed: shouldUnlock,
        metrics: this.getMetricsSummary()
      }
    }
  }

  /**
   * Проверка доступности компонента
   */
  protected async checkComponentAccess(): Promise<boolean> {
    // Базовая проверка - компонент должен существовать
    return !!this.context.componentSnapshot
  }

  /**
   * Проверка бизнес-правил
   */
  protected async validateBusinessRules(action: ComponentAction, data: any): Promise<void> {
    // Можно переопределить в наследниках для специфичных правил
  }

  /**
   * Проверка поддержки действия
   */
  protected isActionSupported(action: ComponentAction): boolean {
    const supportedActions = (this.constructor as typeof BaseComponentHandler).getSupportedActions()
    return supportedActions.includes(action)
  }

  /**
   * Отслеживание аналитики
   */
  protected async trackAnalytics(
    action: ComponentAction,
    result: ComponentHandlerResult
  ): Promise<void> {
    // Базовая реализация - можно расширить в наследниках
  }

  /**
   * Получение сводки метрик
   */
  protected getMetricsSummary(): Record<string, any> {
    return {
      timeSpent: this.metrics.endTime ? this.metrics.endTime - this.metrics.startTime : 0,
      attempts: this.metrics.attempts,
      successful: this.metrics.successful,
      ...this.metrics.customMetrics
    }
  }

  // ===== УТИЛИТНЫЕ МЕТОДЫ =====

  /**
   * Создает результат успешной обработки
   */
  protected createSuccessResult(
    message: string,
    data?: Record<string, any>
  ): ComponentHandlerResult {
    return {
      success: true,
      message,
      data: data || {}
    }
  }

  /**
   * Создает результат ошибки
   */
  protected createErrorResult(
    message: string,
    errors?: string[]
  ): ComponentHandlerResult {
    return {
      success: false,
      message,
      errors: errors || [message]
    }
  }

  /**
   * Логирует действие пользователя
   */
  protected logUserAction(action: ComponentAction, details?: any): void {
    console.log(`User ${this.context.userId} performed ${action} on component ${this.context.componentSnapshot?.id}`, details)
  }
}

/**
 * Экспорт типов
 */
export type { ValidationResult, InteractionMetrics }