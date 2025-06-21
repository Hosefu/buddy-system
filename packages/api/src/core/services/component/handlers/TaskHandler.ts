/**
 * TaskHandler - обработчик компонентов-заданий
 * 
 * Файл: packages/api/src/core/services/component/handlers/TaskHandler.ts
 * 
 * Обрабатывает взаимодействие с заданиями:
 * - Проверка ответов по кодовому слову
 * - Обработка подсказок
 * - Контроль количества попыток
 * - Валидация ответов
 */

import { BaseComponentHandler, ValidationResult } from './BaseComponentHandler'
import { ComponentAction } from '../../../usecases/component/InteractWithComponentUseCase'
import { ComponentHandlerResult } from '../ComponentFactory'
import { ComponentProgress } from '../../../entities/ComponentProgress'

// ===== ИНТЕРФЕЙСЫ =====

export interface TaskAnswerData {
  /** Ответ пользователя */
  answer: string
  /** Номер попытки */
  attempt?: number
  /** Время, потраченное на решение */
  timeSpent?: number
  /** Запрос подсказки */
  requestHint?: boolean
}

export interface TaskContent {
  /** Инструкция к заданию */
  instruction: string
  /** Правильный ответ (кодовое слово) */
  correctAnswer?: string
  /** Альтернативные правильные ответы */
  alternativeAnswers?: string[]
  /** Подсказка */
  hint?: string
  /** Максимальное количество попыток */
  maxAttempts?: number
  /** Настройки валидации */
  validationSettings?: {
    caseSensitive?: boolean
    trimWhitespace?: boolean
    allowPartialMatch?: boolean
    regexPattern?: string
  }
  /** Примеры правильных ответов */
  examples?: string[]
}

export interface AttemptResult {
  /** Правильный ли ответ */
  isCorrect: boolean
  /** Текущая попытка */
  attempt: number
  /** Осталось попыток */
  attemptsLeft: number
  /** Показать подсказку */
  showHint: boolean
  /** Сообщение с результатом */
  message: string
  /** Показать примеры */
  showExamples?: boolean
}

// ===== ОСНОВНОЙ ОБРАБОТЧИК =====

export class TaskHandler extends BaseComponentHandler {
  
  // ===== СТАТИЧЕСКИЕ МЕТОДЫ =====

  /**
   * Поддерживаемые действия для заданий
   */
  static getSupportedActions(): string[] {
    return [
      'SUBMIT_ANSWER',
      'REQUEST_HINT',
      'MARK_COMPLETED'
    ]
  }

  /**
   * Валидация схемы данных задания
   */
  static validateSchema(componentData: any): ValidationResult {
    const errors: string[] = []

    if (!componentData.content) {
      errors.push('Отсутствует содержимое задания')
    }

    if (!componentData.content?.instruction) {
      errors.push('Отсутствует инструкция к заданию')
    }

    if (!componentData.content?.correctAnswer && !componentData.content?.alternativeAnswers?.length) {
      errors.push('Не указан правильный ответ для задания')
    }

    const maxAttempts = componentData.content?.maxAttempts
    if (maxAttempts !== undefined && (typeof maxAttempts !== 'number' || maxAttempts < 1)) {
      errors.push('Максимальное количество попыток должно быть положительным числом')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // ===== ОСНОВНЫЕ МЕТОДЫ =====

  /**
   * Обрабатывает действие с заданием
   */
  protected async processAction(
    action: ComponentAction,
    data: TaskAnswerData
  ): Promise<ComponentHandlerResult> {
    switch (action) {
      case 'SUBMIT_ANSWER':
        return this.handleSubmitAnswer(data)
        
      case 'REQUEST_HINT':
        return this.handleRequestHint(data)
        
      case 'MARK_COMPLETED':
        return this.handleMarkCompleted(data)
        
      default:
        return this.createErrorResult(`Неподдерживаемое действие: ${action}`)
    }
  }

  /**
   * Валидация данных ответа
   */
  protected validateActionData(action: ComponentAction, data: TaskAnswerData): ValidationResult {
    const errors: string[] = []

    switch (action) {
      case 'SUBMIT_ANSWER':
        if (!data.answer || typeof data.answer !== 'string') {
          errors.push('Ответ должен быть непустой строкой')
        }
        
        if (data.answer && data.answer.length > 1000) {
          errors.push('Ответ слишком длинный (максимум 1000 символов)')
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
   * Проверка завершенности задания
   */
  protected isCompleted(
    action: ComponentAction,
    data: TaskAnswerData,
    currentProgress?: ComponentProgress
  ): boolean {
    // Задание завершено если:
    // 1. Ответ правильный
    // 2. Явно помечено как завершенное
    
    if (action === 'MARK_COMPLETED') {
      return true
    }

    if (action === 'SUBMIT_ANSWER') {
      return this.checkAnswer(data.answer).isCorrect
    }

    return false
  }

  /**
   * Вычисление прогресса в процентах
   */
  protected calculateProgress(
    action: ComponentAction,
    data: TaskAnswerData,
    currentProgress?: ComponentProgress
  ): number {
    // Если задание завершено - 100%
    if (this.isCompleted(action, data, currentProgress)) {
      return 100
    }

    // Прогресс зависит от количества попыток
    const content = this.getTaskContent()
    const maxAttempts = content?.maxAttempts || 3
    const currentAttempt = this.getCurrentAttemptNumber(currentProgress) + 1

    // Прогресс увеличивается с каждой попыткой
    const attemptProgress = (currentAttempt / maxAttempts) * 50 // максимум 50% за попытки

    // Если запрашивалась подсказка - добавляем 10%
    const hintProgress = data.requestHint ? 10 : 0

    return Math.min(attemptProgress + hintProgress, 99) // максимум 99% без правильного ответа
  }

  // ===== ОБРАБОТЧИКИ ДЕЙСТВИЙ =====

  /**
   * Обработка отправки ответа
   */
  private async handleSubmitAnswer(data: TaskAnswerData): Promise<ComponentHandlerResult> {
    const content = this.getTaskContent()
    if (!content) {
      return this.createErrorResult('Не удалось получить содержимое задания')
    }

    // Проверяем количество попыток
    const currentAttempt = this.getCurrentAttemptNumber(this.context.currentProgress) + 1
    const maxAttempts = content.maxAttempts || 3

    if (currentAttempt > maxAttempts) {
      return this.createErrorResult(`Превышено максимальное количество попыток (${maxAttempts})`)
    }

    // Проверяем ответ
    const answerCheck = this.checkAnswer(data.answer)
    
    this.logUserAction('SUBMIT_ANSWER', {
      attempt: currentAttempt,
      isCorrect: answerCheck.isCorrect,
      answer: data.answer.substring(0, 50) + '...' // Логируем только начало ответа
    })

    // Формируем результат
    const attemptResult: AttemptResult = {
      isCorrect: answerCheck.isCorrect,
      attempt: currentAttempt,
      attemptsLeft: maxAttempts - currentAttempt,
      showHint: this.shouldShowHint(currentAttempt, answerCheck.isCorrect),
      message: this.generateFeedbackMessage(answerCheck.isCorrect, currentAttempt, maxAttempts),
      showExamples: this.shouldShowExamples(currentAttempt, answerCheck.isCorrect)
    }

    if (answerCheck.isCorrect) {
      return this.createSuccessResult('Ответ правильный! Задание выполнено.', {
        action: 'answer_correct',
        progress: 100,
        completed: true,
        attemptResult,
        solution: {
          correctAnswer: content.correctAnswer,
          explanation: content.hint
        }
      })
    } else {
      return this.createSuccessResult(attemptResult.message, {
        action: 'answer_incorrect',
        progress: this.calculateProgress('SUBMIT_ANSWER', data, this.context.currentProgress),
        completed: false,
        attemptResult
      })
    }
  }

  /**
   * Обработка запроса подсказки
   */
  private async handleRequestHint(data: TaskAnswerData): Promise<ComponentHandlerResult> {
    const content = this.getTaskContent()
    
    if (!content?.hint) {
      return this.createErrorResult('Подсказка для этого задания недоступна')
    }

    this.logUserAction('REQUEST_HINT')

    return this.createSuccessResult('Подсказка получена', {
      action: 'hint_provided',
      hint: content.hint,
      examples: content.examples,
      progress: this.calculateProgress('REQUEST_HINT', data, this.context.currentProgress)
    })
  }

  /**
   * Обработка ручного завершения
   */
  private async handleMarkCompleted(data: TaskAnswerData): Promise<ComponentHandlerResult> {
    this.logUserAction('MARK_COMPLETED')

    return this.createSuccessResult('Задание отмечено как завершенное', {
      action: 'manually_completed',
      progress: 100,
      completed: true
    })
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  /**
   * Получение содержимого задания
   */
  private getTaskContent(): TaskContent | null {
    return this.context.componentSnapshot?.content || null
  }

  /**
   * Проверка ответа
   */
  private checkAnswer(userAnswer: string): { isCorrect: boolean; matchedAnswer?: string } {
    const content = this.getTaskContent()
    if (!content) {
      return { isCorrect: false }
    }

    const settings = content.validationSettings || {}
    
    // Подготавливаем ответ пользователя
    let processedAnswer = userAnswer
    if (settings.trimWhitespace !== false) {
      processedAnswer = processedAnswer.trim()
    }
    if (!settings.caseSensitive) {
      processedAnswer = processedAnswer.toLowerCase()
    }

    // Список всех правильных ответов
    const correctAnswers = [
      content.correctAnswer,
      ...(content.alternativeAnswers || [])
    ].filter(Boolean)

    // Проверяем каждый правильный ответ
    for (const correctAnswer of correctAnswers) {
      let processedCorrect = correctAnswer!
      if (!settings.caseSensitive) {
        processedCorrect = processedCorrect.toLowerCase()
      }

      // Проверка по регулярному выражению
      if (settings.regexPattern) {
        try {
          const regex = new RegExp(settings.regexPattern, settings.caseSensitive ? 'g' : 'gi')
          if (regex.test(processedAnswer)) {
            return { isCorrect: true, matchedAnswer: correctAnswer }
          }
        } catch (error) {
          console.error('Ошибка в регулярном выражении:', error)
        }
      }

      // Точное совпадение
      if (processedAnswer === processedCorrect) {
        return { isCorrect: true, matchedAnswer: correctAnswer }
      }

      // Частичное совпадение (если разрешено)
      if (settings.allowPartialMatch && processedCorrect.includes(processedAnswer)) {
        return { isCorrect: true, matchedAnswer: correctAnswer }
      }
    }

    return { isCorrect: false }
  }

  /**
   * Получение текущего номера попытки
   */
  private getCurrentAttemptNumber(currentProgress?: ComponentProgress): number {
    if (!currentProgress) return 0
    
    // Получаем количество попыток из прогресса
    return currentProgress.getAttemptCount() || 0
  }

  /**
   * Определение, показывать ли подсказку
   */
  private shouldShowHint(attempt: number, isCorrect: boolean): boolean {
    // Показываем подсказку после второй неправильной попытки
    return !isCorrect && attempt >= 2
  }

  /**
   * Определение, показывать ли примеры
   */
  private shouldShowExamples(attempt: number, isCorrect: boolean): boolean {
    // Показываем примеры после третьей неправильной попытки
    return !isCorrect && attempt >= 3
  }

  /**
   * Генерация сообщения с обратной связью
   */
  private generateFeedbackMessage(isCorrect: boolean, attempt: number, maxAttempts: number): string {
    if (isCorrect) {
      if (attempt === 1) {
        return 'Отлично! Правильный ответ с первой попытки!'
      } else {
        return `Правильно! Задание выполнено с ${attempt}-й попытки.`
      }
    } else {
      const attemptsLeft = maxAttempts - attempt
      
      if (attemptsLeft > 0) {
        return `Неправильный ответ. Осталось попыток: ${attemptsLeft}. Попробуйте еще раз!`
      } else {
        return 'Все попытки исчерпаны. Задание не выполнено.'
      }
    }
  }

  /**
   * Дополнительная валидация бизнес-правил
   */
  protected async validateBusinessRules(action: ComponentAction, data: TaskAnswerData): Promise<void> {
    if (action === 'SUBMIT_ANSWER') {
      // Проверяем, что задание не завершено
      if (this.context.currentProgress?.status === 'COMPLETED') {
        throw new Error('Задание уже выполнено')
      }

      // Проверяем лимит попыток
      const content = this.getTaskContent()
      const maxAttempts = content?.maxAttempts || 3
      const currentAttempt = this.getCurrentAttemptNumber(this.context.currentProgress) + 1
      
      if (currentAttempt > maxAttempts) {
        throw new Error(`Превышено максимальное количество попыток (${maxAttempts})`)
      }

      // Проверяем минимальную длину ответа
      if (data.answer && data.answer.trim().length < 1) {
        throw new Error('Ответ не может быть пустым')
      }
    }
  }

  /**
   * Отслеживание аналитики заданий
   */
  protected async trackAnalytics(
    action: ComponentAction,
    result: ComponentHandlerResult
  ): Promise<void> {
    if (action === 'SUBMIT_ANSWER') {
      const isCorrect = result.data?.attemptResult?.isCorrect || false
      const attempt = result.data?.attemptResult?.attempt || 1

      // Дополнительные метрики для заданий
      this.metrics.customMetrics = {
        ...this.metrics.customMetrics,
        lastAnswerCorrect: isCorrect,
        totalAttempts: attempt,
        completedOnAttempt: isCorrect ? attempt : null
      }
    }
  }
}

/**
 * Экспорт типов
 */
export type { TaskAnswerData, TaskContent, AttemptResult }