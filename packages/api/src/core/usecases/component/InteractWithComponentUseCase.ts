/**
 * Use Case для взаимодействия с компонентами обучения
 * 
 * Реализует бизнес-сценарии взаимодействия пользователей с различными
 * типами обучающих компонентов (статьи, задания, квизы, видео).
 * Обрабатывает:
 * - Валидацию доступа к компонентам
 * - Обработку различных типов взаимодействий
 * - Обновление прогресса пользователя
 * - Разблокировку новых этапов
 * - Начисление достижений
 * - Отправку уведомлений о прогрессе
 * 
 * Этот Use Case является центральным для процесса обучения и координирует
 * работу между компонентами, прогрессом и системой достижений.
 */

import { FlowAssignmentService } from '../../services/assignment/FlowAssignmentService'
import { UserService } from '../../services/user/UserService'
import { AssignmentWithDetails } from '../../repositories/FlowAssignmentRepository'
import { RepositoryError, RepositoryErrorType } from '../../repositories/base/BaseRepository'
import { ComponentStatus, StepStatus, FlowStatus, AssignmentStatus } from '@buddybot/database'

/**
 * Типы действий с компонентами
 */
export enum ComponentAction {
  // Статьи
  START_READING = 'START_READING',
  UPDATE_READING_PROGRESS = 'UPDATE_READING_PROGRESS',
  FINISH_READING = 'FINISH_READING',
  
  // Задания
  SUBMIT_ANSWER = 'SUBMIT_ANSWER',
  REQUEST_HINT = 'REQUEST_HINT',
  
  // Квизы
  SUBMIT_QUIZ_ANSWER = 'SUBMIT_QUIZ_ANSWER',
  FINISH_QUIZ = 'FINISH_QUIZ',
  
  // Видео
  START_VIDEO = 'START_VIDEO',
  UPDATE_VIDEO_PROGRESS = 'UPDATE_VIDEO_PROGRESS',
  FINISH_VIDEO = 'FINISH_VIDEO',
  
  // Общие
  MARK_COMPLETED = 'MARK_COMPLETED',
  RESET_PROGRESS = 'RESET_PROGRESS'
}

/**
 * Базовые входные данные для взаимодействия
 */
export interface BaseComponentInteractionInput {
  assignmentId: string
  componentId: string
  action: ComponentAction
  userId: string
  timeSpent?: number // В секундах
}

/**
 * Данные для чтения статей
 */
export interface ReadingInteractionData {
  readingProgress?: number // 0-1, процент прочитанного
  currentPosition?: number // Позиция прокрутки
  timeSpent?: number
}

/**
 * Данные для ответов на задания
 */
export interface TaskInteractionData {
  answer: string
  attempt?: number
}

/**
 * Данные для ответов на квизы
 */
export interface QuizInteractionData {
  questionId: string
  selectedOptionId: string
  timeSpent?: number
}

/**
 * Данные для просмотра видео
 */
export interface VideoInteractionData {
  currentTime: number // Текущая позиция в секундах
  duration?: number // Общая длительность
  playbackRate?: number // Скорость воспроизведения
  watchedSegments?: { start: number; end: number }[] // Просмотренные сегменты
}

/**
 * Полные входные данные для взаимодействия
 */
export interface ComponentInteractionInput extends BaseComponentInteractionInput {
  interactionData?: ReadingInteractionData | TaskInteractionData | QuizInteractionData | VideoInteractionData
}

/**
 * Результат взаимодействия с компонентом
 */
export interface ComponentInteractionResult {
  success: boolean
  message: string
  
  // Обновленный прогресс
  componentProgress: {
    status: ComponentStatus
    data: any
    completedAt?: Date
    isCorrect?: boolean // Для заданий и квизов
    score?: number // Для квизов
  }
  
  // Разблокированные элементы
  unlockedSteps: {
    stepId: string
    title: string
    order: number
  }[]
  
  unlockedComponents: {
    componentId: string
    stepId: string
    type: string
  }[]
  
  // Достижения
  earnedAchievements: {
    achievementId: string
    title: string
    description: string
  }[]
  
  // Следующие доступные действия
  nextActions: ComponentAction[]
  
  // Ошибки валидации
  validationErrors: {
    field: string
    message: string
  }[]
  
  // Обновленная статистика
  assignmentProgress: {
    currentStepOrder: number
    completedSteps: number
    totalSteps: number
    percentage: number
    status: FlowStatus
  }
}

/**
 * Интерфейсы для внешних сервисов
 */
export interface ProgressService {
  updateComponentProgress(
    assignmentId: string,
    componentId: string,
    status: ComponentStatus,
    data: any,
    timeSpent?: number
  ): Promise<void>
  
  checkStepCompletion(assignmentId: string, stepId: string): Promise<boolean>
  checkFlowCompletion(assignmentId: string): Promise<boolean>
  getNextAvailableActions(assignmentId: string, componentId: string): Promise<ComponentAction[]>
}

export interface AchievementService {
  checkComponentAchievements(
    userId: string,
    assignmentId: string,
    componentId: string,
    action: ComponentAction,
    result: any
  ): Promise<Array<{ achievementId: string; title: string; description: string }>>
}

export interface NotificationService {
  sendProgressUpdateNotification(
    assignment: AssignmentWithDetails,
    progressUpdate: any
  ): Promise<void>
}

/**
 * Use Case для взаимодействия с компонентами обучения
 * 
 * Инкапсулирует всю логику взаимодействия пользователей с обучающими
 * компонентами и обеспечивает согласованное обновление прогресса.
 */
export class InteractWithComponentUseCase {
  constructor(
    private assignmentService: FlowAssignmentService,
    private userService: UserService,
    private progressService: ProgressService,
    private achievementService?: AchievementService,
    private notificationService?: NotificationService
  ) {}

  /**
   * Выполняет взаимодействие пользователя с компонентом
   * 
   * @param input - данные взаимодействия
   * @returns результат взаимодействия
   */
  async execute(input: ComponentInteractionInput): Promise<ComponentInteractionResult> {
    console.log(`🎮 Взаимодействие с компонентом: ${input.componentId}, действие: ${input.action}`)

    // 1. Валидируем входные данные
    await this.validateInput(input)

    // 2. Получаем назначение и проверяем доступ
    const assignment = await this.getAndValidateAssignment(input)

    // 3. Находим компонент в снапшоте
    const { component, step } = this.findComponentInSnapshot(assignment, input.componentId)

    // 4. Проверяем доступность компонента
    this.validateComponentAccess(assignment, step, component)

    // 5. Обрабатываем взаимодействие в зависимости от типа компонента
    const interactionResult = await this.processComponentInteraction(
      assignment,
      component,
      input
    )

    // 6. Обновляем прогресс
    await this.updateProgress(assignment, component, interactionResult, input)

    // 7. Проверяем разблокировку новых элементов
    const unlocked = await this.checkUnlockedContent(assignment, step)

    // 8. Проверяем достижения
    const achievements = await this.checkAchievements(
      input.userId,
      assignment,
      component,
      input.action,
      interactionResult
    )

    // 9. Получаем следующие доступные действия
    const nextActions = await this.progressService.getNextAvailableActions(
      input.assignmentId,
      input.componentId
    )

    // 10. Получаем обновленный прогресс назначения
    const updatedAssignment = await this.assignmentService.getAssignmentWithDetailsOrThrow(input.assignmentId)

    // 11. Отправляем уведомления
    await this.sendProgressNotifications(updatedAssignment, interactionResult, unlocked, achievements)

    const result: ComponentInteractionResult = {
      success: true,
      message: this.getSuccessMessage(input.action, interactionResult),
      componentProgress: {
        status: interactionResult.newStatus,
        data: interactionResult.progressData,
        completedAt: interactionResult.completedAt,
        isCorrect: interactionResult.isCorrect,
        score: interactionResult.score
      },
      unlockedSteps: unlocked.steps,
      unlockedComponents: unlocked.components,
      earnedAchievements: achievements,
      nextActions,
      validationErrors: [],
      assignmentProgress: {
        currentStepOrder: updatedAssignment.flowProgress?.currentStepOrder || 1,
        completedSteps: updatedAssignment.flowProgress?.completedSteps || 0,
        totalSteps: updatedAssignment.flowProgress?.totalSteps || 0,
        percentage: updatedAssignment.flowProgress?.percentage || 0,
        status: updatedAssignment.flowProgress?.status as FlowStatus || FlowStatus.NOT_STARTED
      }
    }

    console.log(`✅ Взаимодействие завершено успешно: ${input.action} на компоненте ${input.componentId}`)

    return result
  }

  /**
   * Валидирует входные данные
   * 
   * @param input - данные для валидации
   */
  private async validateInput(input: ComponentInteractionInput): Promise<void> {
    if (!input.assignmentId || !input.componentId || !input.userId) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Не указаны обязательные поля для взаимодействия'
      )
    }

    if (!Object.values(ComponentAction).includes(input.action)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Некорректное действие компонента'
      )
    }

    if (input.timeSpent !== undefined && input.timeSpent < 0) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Время взаимодействия не может быть отрицательным'
      )
    }
  }

  /**
   * Получает и валидирует назначение
   * 
   * @param input - входные данные
   * @returns назначение с деталями
   */
  private async getAndValidateAssignment(input: ComponentInteractionInput): Promise<AssignmentWithDetails> {
    const assignment = await this.assignmentService.getAssignmentWithDetailsOrThrow(input.assignmentId)

    // Проверяем права доступа
    if (assignment.userId !== input.userId) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Недостаточно прав для взаимодействия с этим назначением'
      )
    }

    // Проверяем статус назначения
    if (assignment.status !== AssignmentStatus.IN_PROGRESS) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Взаимодействие возможно только с активными назначениями'
      )
    }

    // Проверяем дедлайн
    if (assignment.isOverdue) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Дедлайн назначения истек'
      )
    }

    return assignment
  }

  /**
   * Находит компонент в снапшоте потока
   * 
   * @param assignment - назначение
   * @param componentId - ID компонента
   * @returns компонент и этап
   */
  private findComponentInSnapshot(assignment: AssignmentWithDetails, componentId: string) {
    for (const step of assignment.flowSnapshot.steps) {
      for (const component of step.components) {
        if (component.id === componentId) {
          return { component, step }
        }
      }
    }

    throw new RepositoryError(
      RepositoryErrorType.NOT_FOUND,
      'Компонент не найден в снапшоте потока'
    )
  }

  /**
   * Проверяет доступность компонента для взаимодействия
   * 
   * @param assignment - назначение
   * @param step - этап
   * @param component - компонент
   */
  private validateComponentAccess(
    assignment: AssignmentWithDetails,
    step: any,
    component: any
  ): void {
    // Проверяем, что этап разблокирован
    const currentStepOrder = assignment.flowProgress?.currentStepOrder || 1
    if (step.order > currentStepOrder) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Этап еще не разблокирован'
      )
    }

    // TODO: Добавить проверку зависимостей между компонентами
    // if (component.dependencies && !this.areDependenciesMet(assignment, component.dependencies)) {
    //   throw new RepositoryError(
    //     RepositoryErrorType.VALIDATION_ERROR,
    //     'Не выполнены зависимости для этого компонента'
    //   )
    // }
  }

  /**
   * Обрабатывает взаимодействие в зависимости от типа компонента
   * 
   * @param assignment - назначение
   * @param component - компонент
   * @param input - входные данные
   * @returns результат обработки
   */
  private async processComponentInteraction(
    assignment: AssignmentWithDetails,
    component: any,
    input: ComponentInteractionInput
  ): Promise<any> {
    switch (component.type) {
      case 'article':
        return this.processArticleInteraction(component, input)
      case 'task':
        return this.processTaskInteraction(component, input)
      case 'quiz':
        return this.processQuizInteraction(component, input)
      case 'video':
        return this.processVideoInteraction(component, input)
      default:
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          `Неподдерживаемый тип компонента: ${component.type}`
        )
    }
  }

  /**
   * Обрабатывает взаимодействие со статьей
   * 
   * @param component - компонент статьи
   * @param input - входные данные
   * @returns результат обработки
   */
  private processArticleInteraction(component: any, input: ComponentInteractionInput): any {
    const data = input.interactionData as ReadingInteractionData

    switch (input.action) {
      case ComponentAction.START_READING:
        return {
          newStatus: ComponentStatus.IN_PROGRESS,
          progressData: {
            readingProgress: 0,
            startedAt: new Date()
          }
        }

      case ComponentAction.UPDATE_READING_PROGRESS:
        if (!data?.readingProgress) {
          throw new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Не указан прогресс чтения'
          )
        }

        return {
          newStatus: ComponentStatus.IN_PROGRESS,
          progressData: {
            readingProgress: Math.min(data.readingProgress, 1),
            lastUpdated: new Date()
          }
        }

      case ComponentAction.FINISH_READING:
        return {
          newStatus: ComponentStatus.COMPLETED,
          progressData: {
            readingProgress: 1,
            completedAt: new Date()
          },
          completedAt: new Date()
        }

      default:
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          `Действие ${input.action} не поддерживается для статей`
        )
    }
  }

  /**
   * Обрабатывает взаимодействие с заданием
   * 
   * @param component - компонент задания
   * @param input - входные данные
   * @returns результат обработки
   */
  private processTaskInteraction(component: any, input: ComponentInteractionInput): any {
    const data = input.interactionData as TaskInteractionData

    switch (input.action) {
      case ComponentAction.SUBMIT_ANSWER:
        if (!data?.answer) {
          throw new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Не указан ответ на задание'
          )
        }

        // Проверяем ответ (в данных компонента должно быть кодовое слово)
        const correctAnswer = component.data.codeWord?.toLowerCase()
        const userAnswer = data.answer.toLowerCase().trim()
        const isCorrect = correctAnswer === userAnswer

        return {
          newStatus: isCorrect ? ComponentStatus.COMPLETED : ComponentStatus.IN_PROGRESS,
          progressData: {
            attempts: (data.attempt || 0) + 1,
            lastAnswer: data.answer,
            isCorrect,
            submittedAt: new Date()
          },
          completedAt: isCorrect ? new Date() : undefined,
          isCorrect
        }

      case ComponentAction.REQUEST_HINT:
        return {
          newStatus: ComponentStatus.IN_PROGRESS,
          progressData: {
            hintsUsed: true,
            hintRequestedAt: new Date()
          },
          hint: component.data.hint
        }

      default:
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          `Действие ${input.action} не поддерживается для заданий`
        )
    }
  }

  /**
   * Обрабатывает взаимодействие с квизом
   * 
   * @param component - компонент квиза
   * @param input - входные данные
   * @returns результат обработки
   */
  private processQuizInteraction(component: any, input: ComponentInteractionInput): any {
    const data = input.interactionData as QuizInteractionData

    switch (input.action) {
      case ComponentAction.SUBMIT_QUIZ_ANSWER:
        if (!data?.questionId || !data?.selectedOptionId) {
          throw new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Не указан вопрос или ответ квиза'
          )
        }

        // Находим вопрос в данных компонента
        const question = component.data.questions.find((q: any) => q.id === data.questionId)
        if (!question) {
          throw new RepositoryError(
            RepositoryErrorType.NOT_FOUND,
            'Вопрос не найден'
          )
        }

        // Проверяем правильность ответа
        const selectedOption = question.options.find((opt: any) => opt.id === data.selectedOptionId)
        if (!selectedOption) {
          throw new RepositoryError(
            RepositoryErrorType.NOT_FOUND,
            'Вариант ответа не найден'
          )
        }

        const isCorrect = selectedOption.isCorrect

        return {
          newStatus: ComponentStatus.IN_PROGRESS, // Квиз завершается отдельным действием
          progressData: {
            answers: [
              {
                questionId: data.questionId,
                selectedOptionId: data.selectedOptionId,
                isCorrect,
                answeredAt: new Date()
              }
            ]
          },
          isCorrect
        }

      case ComponentAction.FINISH_QUIZ:
        // TODO: Рассчитать финальный счет квиза
        const totalQuestions = component.data.questions.length
        // const correctAnswers = currentAnswers.filter(a => a.isCorrect).length
        // const score = (correctAnswers / totalQuestions) * 100

        return {
          newStatus: ComponentStatus.COMPLETED,
          progressData: {
            completedAt: new Date(),
            finalScore: 0 // TODO: Рассчитать реальный счет
          },
          completedAt: new Date(),
          score: 0
        }

      default:
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          `Действие ${input.action} не поддерживается для квизов`
        )
    }
  }

  /**
   * Обрабатывает взаимодействие с видео
   * 
   * @param component - компонент видео
   * @param input - входные данные
   * @returns результат обработки
   */
  private processVideoInteraction(component: any, input: ComponentInteractionInput): any {
    const data = input.interactionData as VideoInteractionData

    switch (input.action) {
      case ComponentAction.START_VIDEO:
        return {
          newStatus: ComponentStatus.IN_PROGRESS,
          progressData: {
            startedAt: new Date(),
            currentTime: 0,
            watchedSegments: []
          }
        }

      case ComponentAction.UPDATE_VIDEO_PROGRESS:
        if (data?.currentTime === undefined) {
          throw new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Не указана текущая позиция видео'
          )
        }

        return {
          newStatus: ComponentStatus.IN_PROGRESS,
          progressData: {
            currentTime: data.currentTime,
            duration: data.duration,
            watchedSegments: data.watchedSegments || [],
            lastUpdated: new Date()
          }
        }

      case ComponentAction.FINISH_VIDEO:
        return {
          newStatus: ComponentStatus.COMPLETED,
          progressData: {
            completedAt: new Date(),
            finalPosition: data?.currentTime || 0,
            watchedToEnd: true
          },
          completedAt: new Date()
        }

      default:
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          `Действие ${input.action} не поддерживается для видео`
        )
    }
  }

  /**
   * Обновляет прогресс в системе
   * 
   * @param assignment - назначение
   * @param component - компонент
   * @param result - результат взаимодействия
   * @param input - входные данные
   */
  private async updateProgress(
    assignment: AssignmentWithDetails,
    component: any,
    result: any,
    input: ComponentInteractionInput
  ): Promise<void> {
    await this.progressService.updateComponentProgress(
      assignment.id,
      component.id,
      result.newStatus,
      result.progressData,
      input.timeSpent
    )

    // Обновляем время прохождения в назначении
    if (input.timeSpent) {
      await this.assignmentService.addTimeSpent(assignment.id, input.timeSpent)
    }
  }

  /**
   * Проверяет разблокировку новых элементов
   * 
   * @param assignment - назначение
   * @param currentStep - текущий этап
   * @returns разблокированные элементы
   */
  private async checkUnlockedContent(assignment: AssignmentWithDetails, currentStep: any) {
    const unlockedSteps: any[] = []
    const unlockedComponents: any[] = []

    // Проверяем завершение текущего этапа
    const isStepCompleted = await this.progressService.checkStepCompletion(
      assignment.id,
      currentStep.id
    )

    if (isStepCompleted) {
      // Разблокируем следующий этап
      const nextStep = assignment.flowSnapshot.steps.find(
        s => s.order === currentStep.order + 1
      )

      if (nextStep) {
        unlockedSteps.push({
          stepId: nextStep.id,
          title: nextStep.title,
          order: nextStep.order
        })

        // Разблокируем компоненты следующего этапа
        for (const component of nextStep.components) {
          unlockedComponents.push({
            componentId: component.id,
            stepId: nextStep.id,
            type: component.type
          })
        }
      }
    }

    return { steps: unlockedSteps, components: unlockedComponents }
  }

  /**
   * Проверяет получение достижений
   * 
   * @param userId - ID пользователя
   * @param assignment - назначение
   * @param component - компонент
   * @param action - действие
   * @param result - результат взаимодействия
   * @returns полученные достижения
   */
  private async checkAchievements(
    userId: string,
    assignment: AssignmentWithDetails,
    component: any,
    action: ComponentAction,
    result: any
  ): Promise<Array<{ achievementId: string; title: string; description: string }>> {
    if (!this.achievementService) {
      return []
    }

    try {
      return await this.achievementService.checkComponentAchievements(
        userId,
        assignment.id,
        component.id,
        action,
        result
      )
    } catch (error) {
      console.error('❌ Ошибка проверки достижений:', error.message)
      return []
    }
  }

  /**
   * Отправляет уведомления о прогрессе
   * 
   * @param assignment - назначение
   * @param result - результат взаимодействия
   * @param unlocked - разблокированные элементы
   * @param achievements - полученные достижения
   */
  private async sendProgressNotifications(
    assignment: AssignmentWithDetails,
    result: any,
    unlocked: any,
    achievements: any[]
  ): Promise<void> {
    if (!this.notificationService) {
      return
    }

    try {
      await this.notificationService.sendProgressUpdateNotification(assignment, {
        result,
        unlocked,
        achievements
      })
    } catch (error) {
      console.error('❌ Ошибка отправки уведомлений о прогрессе:', error.message)
    }
  }

  /**
   * Генерирует сообщение об успехе
   * 
   * @param action - действие
   * @param result - результат
   * @returns сообщение
   */
  private getSuccessMessage(action: ComponentAction, result: any): string {
    switch (action) {
      case ComponentAction.START_READING:
        return 'Чтение статьи начато'
      case ComponentAction.FINISH_READING:
        return 'Статья прочитана успешно'
      case ComponentAction.SUBMIT_ANSWER:
        return result.isCorrect ? 'Правильный ответ!' : 'Неправильный ответ, попробуйте еще раз'
      case ComponentAction.SUBMIT_QUIZ_ANSWER:
        return result.isCorrect ? 'Правильный ответ!' : 'Неправильный ответ'
      case ComponentAction.FINISH_QUIZ:
        return 'Квиз завершен успешно'
      case ComponentAction.FINISH_VIDEO:
        return 'Видео просмотрено полностью'
      default:
        return 'Действие выполнено успешно'
    }
  }
}