/**
 * ComponentFactory - фабрика для создания обработчиков компонентов
 * 
 * Файл: packages/api/src/core/services/component/ComponentFactory.ts
 * 
 * Центральная точка для создания и управления обработчиками компонентов.
 * Использует паттерн Factory для создания правильного обработчика
 * в зависимости от типа компонента.
 */

import { ComponentType } from '../../entities/ComponentSnapshot'
import { BaseComponentHandler } from './handlers/BaseComponentHandler'
import { ArticleHandler } from './handlers/ArticleHandler'
import { TaskHandler } from './handlers/TaskHandler'
import { QuizHandler } from './handlers/QuizHandler'
import { VideoHandler } from './handlers/VideoHandler'
import { ComponentAction } from '../../usecases/component/InteractWithComponentUseCase'

// ===== ИНТЕРФЕЙСЫ =====

export interface ComponentHandlerResult {
  /** Результат обработки */
  success: boolean
  /** Сообщение о результате */
  message: string
  /** Данные результата (специфичные для каждого типа) */
  data?: Record<string, any>
  /** Ошибки если есть */
  errors?: string[]
  /** Нужно ли разблокировать следующие компоненты */
  shouldUnlock?: boolean
  /** Достижения, которые нужно начислить */
  achievements?: string[]
}

export interface ComponentInteractionContext {
  /** ID пользователя */
  userId: string
  /** ID назначения */
  assignmentId: string
  /** Снапшот компонента */
  componentSnapshot: any
  /** Текущий прогресс */
  currentProgress?: any
  /** Метаданные запроса */
  metadata?: Record<string, any>
}

// ===== ОСНОВНАЯ ФАБРИКА =====

export class ComponentFactory {
  private static readonly handlers = new Map<ComponentType, typeof BaseComponentHandler>()

  /**
   * Регистрирует обработчики компонентов при инициализации
   */
  static {
    this.registerHandler('ARTICLE', ArticleHandler)
    this.registerHandler('TASK', TaskHandler)
    this.registerHandler('QUIZ', QuizHandler)
    this.registerHandler('VIDEO', VideoHandler)
  }

  /**
   * Регистрирует обработчик для типа компонента
   */
  static registerHandler(type: ComponentType, handlerClass: typeof BaseComponentHandler): void {
    this.handlers.set(type, handlerClass)
  }

  /**
   * Создает обработчик для компонента
   */
  static createHandler(
    componentType: ComponentType,
    context: ComponentInteractionContext
  ): BaseComponentHandler {
    const HandlerClass = this.handlers.get(componentType)
    
    if (!HandlerClass) {
      throw new Error(`Обработчик для типа компонента "${componentType}" не найден`)
    }

    return new HandlerClass(context)
  }

  /**
   * Обрабатывает взаимодействие с компонентом
   */
  static async handleInteraction(
    componentType: ComponentType,
    action: ComponentAction,
    interactionData: any,
    context: ComponentInteractionContext
  ): Promise<ComponentHandlerResult> {
    try {
      const handler = this.createHandler(componentType, context)
      
      // Валидируем данные взаимодействия
      await handler.validateInteraction(action, interactionData)
      
      // Обрабатываем взаимодействие
      const result = await handler.processInteraction(action, interactionData)
      
      // Пост-обработка (логирование, аналитика)
      await handler.postProcess(action, result)
      
      return result
      
    } catch (error) {
      console.error(`Ошибка обработки компонента ${componentType}:`, error)
      
      return {
        success: false,
        message: `Ошибка обработки компонента: ${error.message}`,
        errors: [error.message]
      }
    }
  }

  /**
   * Получает список поддерживаемых типов компонентов
   */
  static getSupportedTypes(): ComponentType[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Проверяет, поддерживается ли тип компонента
   */
  static isSupported(type: ComponentType): boolean {
    return this.handlers.has(type)
  }

  /**
   * Получает информацию о возможностях обработчика
   */
  static getHandlerCapabilities(type: ComponentType): string[] {
    const HandlerClass = this.handlers.get(type)
    if (!HandlerClass) {
      return []
    }

    // Возвращаем список поддерживаемых действий
    return HandlerClass.getSupportedActions()
  }

  /**
   * Валидирует схему данных компонента
   */
  static validateComponentSchema(
    type: ComponentType,
    componentData: any
  ): { isValid: boolean; errors: string[] } {
    try {
      const HandlerClass = this.handlers.get(type)
      if (!HandlerClass) {
        return {
          isValid: false,
          errors: [`Неподдерживаемый тип компонента: ${type}`]
        }
      }

      return HandlerClass.validateSchema(componentData)
      
    } catch (error) {
      return {
        isValid: false,
        errors: [`Ошибка валидации: ${error.message}`]
      }
    }
  }
}

/**
 * Типы для экспорта
 */
export type { ComponentType, ComponentHandlerResult, ComponentInteractionContext }