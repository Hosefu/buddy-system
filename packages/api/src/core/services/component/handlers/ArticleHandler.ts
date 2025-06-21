/**
 * ArticleHandler - обработчик компонентов-статей
 * 
 * Файл: packages/api/src/core/services/component/handlers/ArticleHandler.ts
 * 
 * Обрабатывает взаимодействие с статьями:
 * - Отслеживание прогресса чтения
 * - Фиксация времени чтения
 * - Проверка завершения чтения
 */

import { BaseComponentHandler, ValidationResult } from './BaseComponentHandler'
import { ComponentAction } from '../../../usecases/component/InteractWithComponentUseCase'
import { ComponentHandlerResult } from '../ComponentFactory'
import { ComponentProgress } from '../../../entities/ComponentProgress'

// ===== ИНТЕРФЕЙСЫ =====

export interface ArticleReadingData {
  /** Прогресс чтения (0-1) */
  readingProgress?: number
  /** Текущая позиция скролла */
  scrollPosition?: number
  /** Время, потраченное на чтение (в секундах) */
  timeSpent?: number
  /** Была ли статья полностью прочитана */
  fullyRead?: boolean
  /** Позиция в тексте (для детального трекинга) */
  textPosition?: {
    paragraph: number
    sentence: number
  }
}

export interface ArticleContent {
  /** Основной текст статьи */
  text: string
  /** HTML содержимое */
  htmlContent?: string
  /** Примерное время чтения */
  estimatedReadTime?: number
  /** Количество слов */
  wordCount?: number
  /** Прикрепленные изображения */
  images?: any[]
  /** Прикрепленные файлы */
  attachments?: any[]
}

// ===== ОСНОВНОЙ ОБРАБОТЧИК =====

export class ArticleHandler extends BaseComponentHandler {
  
  // ===== СТАТИЧЕСКИЕ МЕТОДЫ =====

  /**
   * Поддерживаемые действия для статей
   */
  static getSupportedActions(): string[] {
    return [
      'START_READING',
      'UPDATE_READING_PROGRESS', 
      'FINISH_READING',
      'MARK_COMPLETED'
    ]
  }

  /**
   * Валидация схемы данных статьи
   */
  static validateSchema(componentData: any): ValidationResult {
    const errors: string[] = []

    if (!componentData.content) {
      errors.push('Отсутствует содержимое статьи')
    }

    if (!componentData.content?.text && !componentData.content?.htmlContent) {
      errors.push('Статья должна содержать текст или HTML контент')
    }

    if (componentData.content?.text && typeof componentData.content.text !== 'string') {
      errors.push('Текст статьи должен быть строкой')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // ===== ОСНОВНЫЕ МЕТОДЫ =====

  /**
   * Обрабатывает действие с статьей
   */
  protected async processAction(
    action: ComponentAction,
    data: ArticleReadingData
  ): Promise<ComponentHandlerResult> {
    switch (action) {
      case 'START_READING':
        return this.handleStartReading(data)
        
      case 'UPDATE_READING_PROGRESS':
        return this.handleUpdateProgress(data)
        
      case 'FINISH_READING':
        return this.handleFinishReading(data)
        
      case 'MARK_COMPLETED':
        return this.handleMarkCompleted(data)
        
      default:
        return this.createErrorResult(`Неподдерживаемое действие: ${action}`)
    }
  }

  /**
   * Валидация данных чтения
   */
  protected validateActionData(action: ComponentAction, data: ArticleReadingData): ValidationResult {
    const errors: string[] = []

    switch (action) {
      case 'UPDATE_READING_PROGRESS':
        if (data.readingProgress !== undefined) {
          if (typeof data.readingProgress !== 'number' || data.readingProgress < 0 || data.readingProgress > 1) {
            errors.push('Прогресс чтения должен быть числом от 0 до 1')
          }
        }
        break

      case 'FINISH_READING':
        if (!data.timeSpent || data.timeSpent <= 0) {
          errors.push('Время чтения должно быть положительным числом')
        }
        break
    }

    if (data.timeSpent !== undefined && (typeof data.timeSpent !== 'number' || data.timeSpent < 0)) {
      errors.push('Время должно быть положительным числом')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Проверка завершенности статьи
   */
  protected isCompleted(
    action: ComponentAction, 
    data: ArticleReadingData,
    currentProgress?: ComponentProgress
  ): boolean {
    // Статья считается завершенной если:
    // 1. Явно помечена как завершенная
    // 2. Прогресс чтения достиг 100%
    // 3. Пользователь провел достаточно времени за чтением
    
    if (action === 'MARK_COMPLETED' || action === 'FINISH_READING') {
      return true
    }

    if (data.readingProgress && data.readingProgress >= 0.95) {
      return true
    }

    if (data.fullyRead) {
      return true
    }

    // Проверяем минимальное время чтения
    const content = this.getArticleContent()
    const minReadTime = this.calculateMinimumReadTime(content)
    const totalTimeSpent = (currentProgress?.getTotalTimeSpent() || 0) + (data.timeSpent || 0)
    
    return totalTimeSpent >= minReadTime
  }

  /**
   * Вычисление прогресса в процентах
   */
  protected calculateProgress(
    action: ComponentAction,
    data: ArticleReadingData,
    currentProgress?: ComponentProgress
  ): number {
    // Если статья завершена - 100%
    if (this.isCompleted(action, data, currentProgress)) {
      return 100
    }

    // Используем максимальный прогресс из доступных метрик
    let progress = 0

    // Прогресс чтения (основной индикатор)
    if (data.readingProgress !== undefined) {
      progress = Math.max(progress, data.readingProgress * 100)
    }

    // Прогресс по времени
    const content = this.getArticleContent()
    if (content?.estimatedReadTime && data.timeSpent) {
      const timeProgress = Math.min(data.timeSpent / (content.estimatedReadTime * 60), 1) * 100
      progress = Math.max(progress, timeProgress)
    }

    // Сохраняем предыдущий прогресс если он больше
    if (currentProgress) {
      const previousProgress = currentProgress.getCompletionPercentage()
      progress = Math.max(progress, previousProgress)
    }

    return Math.min(progress, 100)
  }

  // ===== ОБРАБОТЧИКИ ДЕЙСТВИЙ =====

  /**
   * Обработка начала чтения
   */
  private async handleStartReading(data: ArticleReadingData): Promise<ComponentHandlerResult> {
    this.logUserAction('START_READING', { 
      componentId: this.context.componentSnapshot?.id,
      startTime: Date.now()
    })

    // Добавляем метрики начала чтения
    this.metrics.customMetrics = {
      ...this.metrics.customMetrics,
      readingStarted: true,
      startTimestamp: Date.now()
    }

    return this.createSuccessResult('Начато чтение статьи', {
      action: 'reading_started',
      progress: 0,
      estimatedReadTime: this.getArticleContent()?.estimatedReadTime
    })
  }

  /**
   * Обработка обновления прогресса
   */
  private async handleUpdateProgress(data: ArticleReadingData): Promise<ComponentHandlerResult> {
    const progress = this.calculateProgress('UPDATE_READING_PROGRESS', data, this.context.currentProgress)
    
    this.logUserAction('UPDATE_READING_PROGRESS', {
      readingProgress: data.readingProgress,
      timeSpent: data.timeSpent,
      calculatedProgress: progress
    })

    // Проверяем важные пороги прогресса
    const milestones = this.checkProgressMilestones(progress)

    return this.createSuccessResult('Прогресс чтения обновлен', {
      action: 'progress_updated',
      progress,
      readingProgress: data.readingProgress,
      timeSpent: data.timeSpent,
      milestones
    })
  }

  /**
   * Обработка завершения чтения
   */
  private async handleFinishReading(data: ArticleReadingData): Promise<ComponentHandlerResult> {
    this.logUserAction('FINISH_READING', {
      timeSpent: data.timeSpent,
      fullyRead: data.fullyRead
    })

    // Вычисляем финальную статистику
    const readingStats = this.calculateReadingStats(data)

    return this.createSuccessResult('Чтение статьи завершено', {
      action: 'reading_finished',
      progress: 100,
      completed: true,
      readingStats
    })
  }

  /**
   * Обработка ручного завершения
   */
  private async handleMarkCompleted(data: ArticleReadingData): Promise<ComponentHandlerResult> {
    this.logUserAction('MARK_COMPLETED')

    return this.createSuccessResult('Статья отмечена как завершенная', {
      action: 'manually_completed',
      progress: 100,
      completed: true
    })
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  /**
   * Получение содержимого статьи
   */
  private getArticleContent(): ArticleContent | null {
    return this.context.componentSnapshot?.content || null
  }

  /**
   * Вычисление минимального времени чтения
   */
  private calculateMinimumReadTime(content: ArticleContent | null): number {
    if (!content) return 0

    // Используем указанное время или вычисляем по количеству слов
    if (content.estimatedReadTime) {
      return content.estimatedReadTime * 60 * 0.5 // 50% от оценочного времени
    }

    if (content.wordCount) {
      // Средняя скорость чтения: 200 слов в минуту
      return (content.wordCount / 200) * 60 * 0.5
    }

    if (content.text) {
      // Примерная оценка по количеству символов
      const wordCount = content.text.split(/\s+/).length
      return (wordCount / 200) * 60 * 0.5
    }

    return 30 // Минимум 30 секунд
  }

  /**
   * Проверка важных этапов прогресса
   */
  private checkProgressMilestones(progress: number): string[] {
    const milestones: string[] = []

    if (progress >= 25 && progress < 50) {
      milestones.push('quarter_read')
    } else if (progress >= 50 && progress < 75) {
      milestones.push('half_read')
    } else if (progress >= 75 && progress < 100) {
      milestones.push('three_quarters_read')
    } else if (progress >= 100) {
      milestones.push('fully_read')
    }

    return milestones
  }

  /**
   * Вычисление статистики чтения
   */
  private calculateReadingStats(data: ArticleReadingData): Record<string, any> {
    const content = this.getArticleContent()
    const stats: Record<string, any> = {
      timeSpent: data.timeSpent || 0,
      readingProgress: data.readingProgress || 0
    }

    if (content?.estimatedReadTime && data.timeSpent) {
      stats.readingSpeedRatio = data.timeSpent / (content.estimatedReadTime * 60)
    }

    if (content?.wordCount && data.timeSpent) {
      stats.wordsPerMinute = (content.wordCount / data.timeSpent) * 60
    }

    return stats
  }

  /**
   * Дополнительная валидация бизнес-правил
   */
  protected async validateBusinessRules(action: ComponentAction, data: ArticleReadingData): Promise<void> {
    // Проверяем, что статья не была уже завершена (если нужно)
    if (action === 'FINISH_READING' && this.context.currentProgress?.status === 'COMPLETED') {
      throw new Error('Статья уже завершена')
    }

    // Проверяем разумность данных о времени чтения
    if (data.timeSpent && data.timeSpent > 86400) { // Больше суток
      throw new Error('Время чтения не может превышать 24 часа')
    }
  }
}

/**
 * Экспорт типов
 */
export type { ArticleReadingData, ArticleContent }