/**
 * QuizHandler - обработчик компонентов-квизов
 * 
 * Файл: packages/api/src/core/services/component/handlers/QuizHandler.ts
 * 
 * Обрабатывает взаимодействие с квизами:
 * - Ответы на отдельные вопросы
 * - Завершение квиза целиком
 * - Подсчет баллов и статистики
 * - Поддержка разных типов вопросов
 */

import { BaseComponentHandler, ValidationResult } from './BaseComponentHandler'
import { ComponentAction } from '../../../usecases/component/InteractWithComponentUseCase'
import { ComponentHandlerResult } from '../ComponentFactory'
import { ComponentProgress } from '../../../entities/ComponentProgress'

// ===== ИНТЕРФЕЙСЫ =====

export interface QuizAnswerData {
  /** ID вопроса */
  questionId?: string
  /** ID выбранного варианта ответа */
  selectedOptionId?: string
  /** Массив выбранных опций (для множественного выбора) */
  selectedOptionIds?: string[]
  /** Время, потраченное на ответ */
  timeSpent?: number
  /** Время начала ответа на вопрос */
  startedAt?: Date
  /** Все ответы для завершения квиза */
  allAnswers?: Record<string, string | string[]>
}

export interface QuizContent {
  /** Вопросы квиза */
  questions: QuizQuestion[]
  /** Тип квиза */
  quizType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MIXED'
  /** Настройки квиза */
  settings?: {
    /** Показывать результат сразу после ответа */
    showResultImmediately?: boolean
    /** Перемешивать вопросы */
    shuffleQuestions?: boolean
    /** Перемешивать варианты ответов */
    shuffleOptions?: boolean
    /** Минимальный проходной балл (в процентах) */
    passingScore?: number
    /** Ограничение времени (в секундах) */
    timeLimit?: number
  }
  /** Общее объяснение/заключение */
  conclusion?: string
}

export interface QuizQuestion {
  /** ID вопроса */
  id: string
  /** Текст вопроса */
  question: string
  /** Варианты ответов */
  options: QuizOption[]
  /** Тип вопроса */
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'
  /** Объяснение правильного ответа */
  explanation?: string
  /** Балл за правильный ответ */
  points?: number
}

export interface QuizOption {
  /** ID опции */
  id: string
  /** Текст опции */
  text: string
  /** Правильная ли опция */
  isCorrect: boolean
  /** Объяснение этой опции */
  explanation?: string
}

export interface QuizResult {
  /** Общий балл */
  score: number
  /** Максимальный возможный балл */
  maxScore: number
  /** Процент правильных ответов */
  percentage: number
  /** Количество правильных ответов */
  correctAnswers: number
  /** Общее количество вопросов */
  totalQuestions: number
  /** Пройден ли квиз */
  passed: boolean
  /** Детали по каждому вопросу */
  questionResults: QuestionResult[]
  /** Общее время прохождения */
  totalTime: number
}

export interface QuestionResult {
  /** ID вопроса */
  questionId: string
  /** Правильный ли ответ */
  isCorrect: boolean
  /** Выбранные опции */
  selectedOptions: string[]
  /** Правильные опции */
  correctOptions: string[]
  /** Баллы за этот вопрос */
  points: number
  /** Время ответа */
  timeSpent: number
}

// ===== ОСНОВНОЙ ОБРАБОТЧИК =====

export class QuizHandler extends BaseComponentHandler {
  
  // ===== СТАТИЧЕСКИЕ МЕТОДЫ =====

  /**
   * Поддерживаемые действия для квизов
   */
  static getSupportedActions(): string[] {
    return [
      'SUBMIT_QUIZ_ANSWER',
      'FINISH_QUIZ',
      'MARK_COMPLETED'
    ]
  }

  /**
   * Валидация схемы данных квиза
   */
  static validateSchema(componentData: any): ValidationResult {
    const errors: string[] = []

    if (!componentData.content) {
      errors.push('Отсутствует содержимое квиза')
    }

    const content = componentData.content
    if (!content.questions || !Array.isArray(content.questions) || content.questions.length === 0) {
      errors.push('Квиз должен содержать хотя бы один вопрос')
    }

    // Валидируем каждый вопрос
    content.questions?.forEach((question: any, index: number) => {
      if (!question.id) {
        errors.push(`Вопрос ${index + 1}: отсутствует ID`)
      }
      if (!question.question) {
        errors.push(`Вопрос ${index + 1}: отсутствует текст вопроса`)
      }
      if (!question.options || !Array.isArray(question.options) || question.options.length < 2) {
        errors.push(`Вопрос ${index + 1}: должно быть минимум 2 варианта ответа`)
      }

      // Проверяем наличие правильных ответов
      const correctOptions = question.options?.filter((opt: any) => opt.isCorrect)
      if (!correctOptions || correctOptions.length === 0) {
        errors.push(`Вопрос ${index + 1}: должен быть хотя бы один правильный ответ`)
      }
    })

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // ===== ОСНОВНЫЕ МЕТОДЫ =====

  /**
   * Обрабатывает действие с квизом
   */
  protected async processAction(
    action: ComponentAction,
    data: QuizAnswerData
  ): Promise<ComponentHandlerResult> {
    switch (action) {
      case 'SUBMIT_QUIZ_ANSWER':
        return this.handleSubmitAnswer(data)
        
      case 'FINISH_QUIZ':
        return this.handleFinishQuiz(data)
        
      case 'MARK_COMPLETED':
        return this.handleMarkCompleted(data)
        
      default:
        return this.createErrorResult(`Неподдерживаемое действие: ${action}`)
    }
  }

  /**
   * Валидация данных ответа
   */
  protected validateActionData(action: ComponentAction, data: QuizAnswerData): ValidationResult {
    const errors: string[] = []

    switch (action) {
      case 'SUBMIT_QUIZ_ANSWER':
        if (!data.questionId) {
          errors.push('ID вопроса обязателен')
        }
        if (!data.selectedOptionId && !data.selectedOptionIds?.length) {
          errors.push('Должен быть выбран хотя бы один вариант ответа')
        }
        break

      case 'FINISH_QUIZ':
        if (!data.allAnswers || typeof data.allAnswers !== 'object') {
          errors.push('Ответы на все вопросы обязательны для завершения квиза')
        }
        break
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Проверка завершенности квиза
   */
  protected isCompleted(
    action: ComponentAction,
    data: QuizAnswerData,
    currentProgress?: ComponentProgress
  ): boolean {
    // Квиз завершен если:
    // 1. Явно помечен как завершенный
    // 2. Квиз пройден полностью
    
    if (action === 'MARK_COMPLETED' || action === 'FINISH_QUIZ') {
      return true
    }

    // Проверяем, ответили ли на все вопросы
    const content = this.getQuizContent()
    if (!content) return false

    const userAnswers = this.getUserAnswers(currentProgress)
    const totalQuestions = content.questions.length
    const answeredQuestions = Object.keys(userAnswers).length

    return answeredQuestions >= totalQuestions
  }

  /**
   * Вычисление прогресса в процентах
   */
  protected calculateProgress(
    action: ComponentAction,
    data: QuizAnswerData,
    currentProgress?: ComponentProgress
  ): number {
    const content = this.getQuizContent()
    if (!content) return 0

    // Если квиз завершен - 100%
    if (this.isCompleted(action, data, currentProgress)) {
      return 100
    }

    // Прогресс по количеству отвеченных вопросов
    const totalQuestions = content.questions.length
    const userAnswers = this.getUserAnswers(currentProgress)
    let answeredQuestions = Object.keys(userAnswers).length

    // Добавляем текущий ответ если это ответ на вопрос
    if (action === 'SUBMIT_QUIZ_ANSWER' && data.questionId && !userAnswers[data.questionId]) {
      answeredQuestions++
    }

    return Math.min((answeredQuestions / totalQuestions) * 100, 100)
  }

  // ===== ОБРАБОТЧИКИ ДЕЙСТВИЙ =====

  /**
   * Обработка ответа на вопрос
   */
  private async handleSubmitAnswer(data: QuizAnswerData): Promise<ComponentHandlerResult> {
    const content = this.getQuizContent()
    if (!content) {
      return this.createErrorResult('Не удалось получить содержимое квиза')
    }

    const question = content.questions.find(q => q.id === data.questionId)
    if (!question) {
      return this.createErrorResult('Вопрос не найден')
    }

    // Проверяем ответ
    const questionResult = this.checkQuestionAnswer(question, data)
    
    this.logUserAction('SUBMIT_QUIZ_ANSWER', {
      questionId: data.questionId,
      isCorrect: questionResult.isCorrect,
      selectedOptions: questionResult.selectedOptions
    })

    // Определяем, показывать ли результат сразу
    const showResult = content.settings?.showResultImmediately !== false

    const result = {
      action: 'question_answered',
      progress: this.calculateProgress('SUBMIT_QUIZ_ANSWER', data, this.context.currentProgress),
      questionResult: showResult ? questionResult : null,
      nextQuestion: this.getNextQuestion(content, data.questionId!),
      completed: this.isCompleted('SUBMIT_QUIZ_ANSWER', data, this.context.currentProgress)
    }

    return this.createSuccessResult('Ответ на вопрос принят', result)
  }

  /**
   * Обработка завершения квиза
   */
  private async handleFinishQuiz(data: QuizAnswerData): Promise<ComponentHandlerResult> {
    const content = this.getQuizContent()
    if (!content) {
      return this.createErrorResult('Не удалось получить содержимое квиза')
    }

    // Вычисляем финальный результат
    const quizResult = this.calculateQuizResult(content, data.allAnswers!)
    
    this.logUserAction('FINISH_QUIZ', {
      score: quizResult.score,
      percentage: quizResult.percentage,
      passed: quizResult.passed,
      totalTime: quizResult.totalTime
    })

    return this.createSuccessResult(
      quizResult.passed ? 'Квиз успешно пройден!' : 'Квиз завершен',
      {
        action: 'quiz_completed',
        progress: 100,
        completed: true,
        quizResult,
        conclusion: content.conclusion
      }
    )
  }

  /**
   * Обработка ручного завершения
   */
  private async handleMarkCompleted(data: QuizAnswerData): Promise<ComponentHandlerResult> {
    this.logUserAction('MARK_COMPLETED')

    return this.createSuccessResult('Квиз отмечен как завершенный', {
      action: 'manually_completed',
      progress: 100,
      completed: true
    })
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  /**
   * Получение содержимого квиза
   */
  private getQuizContent(): QuizContent | null {
    return this.context.componentSnapshot?.content || null
  }

  /**
   * Получение ответов пользователя из прогресса
   */
  private getUserAnswers(currentProgress?: ComponentProgress): Record<string, string | string[]> {
    if (!currentProgress) return {}
    
    // Получаем ответы из данных прогресса
    const progressData = currentProgress.progressData as any
    return progressData?.answers || {}
  }

  /**
   * Проверка ответа на вопрос
   */
  private checkQuestionAnswer(question: QuizQuestion, data: QuizAnswerData): QuestionResult {
    const selectedOptions = data.selectedOptionIds || (data.selectedOptionId ? [data.selectedOptionId] : [])
    const correctOptions = question.options.filter(opt => opt.isCorrect).map(opt => opt.id)
    
    // Определяем правильность ответа
    let isCorrect = false
    
    if (question.type === 'MULTIPLE_CHOICE') {
      // Для множественного выбора - все правильные опции должны быть выбраны
      isCorrect = correctOptions.length === selectedOptions.length &&
                  correctOptions.every(id => selectedOptions.includes(id))
    } else {
      // Для одиночного выбора - должна быть выбрана одна правильная опция
      isCorrect = selectedOptions.length === 1 && correctOptions.includes(selectedOptions[0])
    }

    return {
      questionId: question.id,
      isCorrect,
      selectedOptions,
      correctOptions,
      points: isCorrect ? (question.points || 1) : 0,
      timeSpent: data.timeSpent || 0
    }
  }

  /**
   * Получение следующего вопроса
   */
  private getNextQuestion(content: QuizContent, currentQuestionId: string): QuizQuestion | null {
    const currentIndex = content.questions.findIndex(q => q.id === currentQuestionId)
    if (currentIndex === -1 || currentIndex === content.questions.length - 1) {
      return null
    }
    
    return content.questions[currentIndex + 1]
  }

  /**
   * Вычисление результата квиза
   */
  private calculateQuizResult(content: QuizContent, allAnswers: Record<string, string | string[]>): QuizResult {
    const questionResults: QuestionResult[] = []
    let totalScore = 0
    let maxScore = 0
    let totalTime = 0

    // Обрабатываем каждый вопрос
    content.questions.forEach(question => {
      const userAnswer = allAnswers[question.id]
      const selectedOptions = Array.isArray(userAnswer) ? userAnswer : (userAnswer ? [userAnswer] : [])
      
      const questionResult = this.checkQuestionAnswer(question, {
        questionId: question.id,
        selectedOptionIds: selectedOptions
      })
      
      questionResults.push(questionResult)
      totalScore += questionResult.points
      maxScore += question.points || 1
      totalTime += questionResult.timeSpent
    })

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0
    const passingScore = content.settings?.passingScore || 60

    return {
      score: totalScore,
      maxScore,
      percentage,
      correctAnswers: questionResults.filter(r => r.isCorrect).length,
      totalQuestions: content.questions.length,
      passed: percentage >= passingScore,
      questionResults,
      totalTime
    }
  }

  /**
   * Дополнительная валидация бизнес-правил
   */
  protected async validateBusinessRules(action: ComponentAction, data: QuizAnswerData): Promise<void> {
    if (action === 'SUBMIT_QUIZ_ANSWER') {
      // Проверяем, что квиз не завершен
      if (this.context.currentProgress?.status === 'COMPLETED') {
        throw new Error('Квиз уже завершен')
      }

      // Проверяем лимит времени (если есть)
      const content = this.getQuizContent()
      if (content?.settings?.timeLimit) {
        const startTime = this.context.currentProgress?.startedAt
        if (startTime) {
          const timeElapsed = (Date.now() - startTime.getTime()) / 1000
          if (timeElapsed > content.settings.timeLimit) {
            throw new Error('Время на прохождение квиза истекло')
          }
        }
      }
    }

    if (action === 'FINISH_QUIZ') {
      // Проверяем, что ответы на все вопросы даны
      const content = this.getQuizContent()
      if (content && data.allAnswers) {
        const missingAnswers = content.questions.filter(q => !data.allAnswers![q.id])
        if (missingAnswers.length > 0) {
          throw new Error(`Не даны ответы на вопросы: ${missingAnswers.map(q => q.id).join(', ')}`)
        }
      }
    }
  }

  /**
   * Отслеживание аналитики квизов
   */
  protected async trackAnalytics(
    action: ComponentAction,
    result: ComponentHandlerResult
  ): Promise<void> {
    if (action === 'FINISH_QUIZ' && result.data?.quizResult) {
      const quizResult = result.data.quizResult as QuizResult

      this.metrics.customMetrics = {
        ...this.metrics.customMetrics,
        finalScore: quizResult.score,
        maxScore: quizResult.maxScore,
        percentage: quizResult.percentage,
        passed: quizResult.passed,
        totalQuestions: quizResult.totalQuestions,
        correctAnswers: quizResult.correctAnswers,
        averageTimePerQuestion: quizResult.totalTime / quizResult.totalQuestions
      }
    }
  }
}

/**
 * Экспорт типов
 */
export type { QuizAnswerData, QuizContent, QuizQuestion, QuizOption, QuizResult, QuestionResult }