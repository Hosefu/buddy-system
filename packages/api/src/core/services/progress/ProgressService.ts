/**
 * ProgressService - сервис для управления прогрессом пользователей
 * 
 * Отвечает за:
 * - Создание и обновление прогресса по компонентам
 * - Вычисление прогресса по шагам и потокам
 * - Разблокировку новых шагов и компонентов
 * - Проверку условий завершения
 * - Аналитику прогресса
 * 
 * Работает исключительно со снапшотами, не с оригинальными компонентами!
 */

import { ComponentProgress, ComponentProgressFactory, ComponentProgressStatus } from '../../entities/ComponentProgress'
import { FlowSnapshot } from '../../entities/FlowSnapshot'
import { FlowStepSnapshot } from '../../entities/FlowStepSnapshot'
import { ComponentSnapshot } from '../../entities/ComponentSnapshot'
import { IComponentProgressRepository } from '../../repositories/ComponentProgressRepository'
import { IFlowSnapshotRepository } from '../../repositories/FlowSnapshotRepository'
import { logger } from '../../../utils/logger'

// ===== ИНТЕРФЕЙСЫ =====

export interface ProgressUpdateData {
  /** Тип взаимодействия с компонентом */
  action: 'START' | 'UPDATE_PROGRESS' | 'SUBMIT_ANSWER' | 'COMPLETE'
  /** Данные, специфичные для типа компонента */
  data?: Record<string, any>
  /** Метаданные (платформа, IP и т.д.) */
  metadata?: Record<string, any>
}

export interface ProgressSummary {
  /** Общий прогресс по потоку (0-100) */
  flowProgress: number
  /** Прогресс по каждому шагу */
  stepProgress: Array<{
    stepSnapshotId: string
    stepTitle: string
    stepOrder: number
    progress: number
    status: 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED'
    componentCount: number
    completedComponents: number
  }>
  /** Прогресс по компонентам */
  componentProgress: Array<{
    componentSnapshotId: string
    componentTitle: string
    componentType: string
    progress: number
    status: ComponentProgressStatus
    timeSpent: number
    attempts: number
  }>
  /** Разблокированные шаги */
  unlockedStepIds: string[]
  /** Следующий доступный компонент */
  nextComponent?: {
    componentSnapshotId: string
    stepSnapshotId: string
    title: string
    type: string
  }
  /** Статистика */
  stats: {
    totalTimeSpent: number
    totalAttempts: number
    completedComponents: number
    totalComponents: number
    completedSteps: number
    totalSteps: number
  }
}

export interface UnlockResult {
  /** Были ли разблокированы новые шаги */
  hasNewUnlocks: boolean
  /** Список ID новых разблокированных шагов */
  newUnlockedStepIds: string[]
  /** Список ID новых разблокированных компонентов */
  newUnlockedComponentIds: string[]
  /** Сообщения для пользователя */
  messages: string[]
}

// ===== ОСНОВНОЙ СЕРВИС =====

export class ProgressService {
  constructor(
    private readonly progressRepository: IComponentProgressRepository,
    private readonly snapshotRepository: IFlowSnapshotRepository
  ) {}

  /**
   * Обновляет прогресс пользователя по компоненту
   */
  async updateComponentProgress(
    userId: string,
    assignmentId: string,
    componentSnapshotId: string,
    updateData: ProgressUpdateData
  ): Promise<{
    progress: ComponentProgress
    unlockResult: UnlockResult
  }> {
    try {
      logger.info('Обновляем прогресс компонента', {
        userId,
        assignmentId,
        componentSnapshotId,
        action: updateData.action
      })

      // 1. Получаем или создаем прогресс компонента
      let progress = await this.getOrCreateComponentProgress(
        userId,
        assignmentId,
        componentSnapshotId
      )

      // 2. Обновляем прогресс в зависимости от действия
      progress = await this.processProgressUpdate(progress, updateData)

      // 3. Сохраняем обновленный прогресс
      await this.progressRepository.update(progress.id, progress)

      // 4. Проверяем разблокировки новых шагов/компонентов
      const unlockResult = await this.checkAndUnlockNextSteps(
        userId,
        assignmentId,
        componentSnapshotId
      )

      logger.info('Прогресс компонента обновлен', {
        userId,
        componentSnapshotId,
        status: progress.status,
        completionPercentage: progress.getCompletionPercentage(),
        newUnlocks: unlockResult.hasNewUnlocks
      })

      return {
        progress,
        unlockResult
      }

    } catch (error) {
      logger.error('Ошибка при обновлении прогресса компонента', {
        userId,
        assignmentId,
        componentSnapshotId,
        error: error.message
      })
      throw new Error(`Не удалось обновить прогресс: ${error.message}`)
    }
  }

  /**
   * Получает полный прогресс пользователя по назначению
   */
  async getProgressSummary(
    userId: string,
    assignmentId: string
  ): Promise<ProgressSummary> {
    try {
      // 1. Получаем структуру снапшота
      const flowSnapshot = await this.snapshotRepository.findByAssignmentId(assignmentId)
      if (!flowSnapshot) {
        throw new Error('Снапшот потока не найден')
      }

      const stepSnapshots = await this.snapshotRepository.findStepsByFlowSnapshotId(flowSnapshot.id)
      const componentSnapshots = await this.snapshotRepository.findComponentsByStepSnapshotIds(
        stepSnapshots.map(step => step.id)
      )

      // 2. Получаем прогресс пользователя по всем компонентам
      const userProgress = await this.progressRepository.findByUserAndAssignment(userId, assignmentId)

      // 3. Вычисляем прогресс по шагам
      const stepProgress = await this.calculateStepProgress(
        stepSnapshots,
        componentSnapshots,
        userProgress
      )

      // 4. Определяем разблокированные шаги
      const unlockedStepIds = await this.getUnlockedStepIds(
        userId,
        assignmentId,
        stepSnapshots,
        userProgress
      )

      // 5. Находим следующий доступный компонент
      const nextComponent = await this.findNextAvailableComponent(
        stepSnapshots,
        componentSnapshots,
        userProgress,
        unlockedStepIds
      )

      // 6. Подсчитываем общую статистику
      const stats = this.calculateProgressStats(userProgress, stepSnapshots, componentSnapshots)

      // 7. Подсчитываем общий прогресс по потоку
      const flowProgress = this.calculateFlowProgress(stepProgress)

      return {
        flowProgress,
        stepProgress,
        componentProgress: userProgress.map(progress => ({
          componentSnapshotId: progress.componentSnapshotId,
          componentTitle: this.getComponentTitle(progress.componentSnapshotId, componentSnapshots),
          componentType: progress.componentType,
          progress: progress.getCompletionPercentage(),
          status: progress.status,
          timeSpent: progress.getTotalTimeSpent(),
          attempts: progress.getAttemptCount()
        })),
        unlockedStepIds,
        nextComponent,
        stats
      }

    } catch (error) {
      logger.error('Ошибка при получении прогресса', { userId, assignmentId, error: error.message })
      throw new Error(`Не удалось получить прогресс: ${error.message}`)
    }
  }

  /**
   * Сбрасывает прогресс компонента (для переупражений)
   */
  async resetComponentProgress(
    userId: string,
    assignmentId: string,
    componentSnapshotId: string
  ): Promise<ComponentProgress> {
    try {
      const existingProgress = await this.progressRepository.findByUserAndComponent(
        userId,
        assignmentId,
        componentSnapshotId
      )

      if (!existingProgress) {
        throw new Error('Прогресс компонента не найден')
      }

      // Создаем новый "чистый" прогресс того же типа
      const componentSnapshot = await this.snapshotRepository.findComponentById(componentSnapshotId)
      if (!componentSnapshot) {
        throw new Error('Снапшот компонента не найден')
      }

      const resetProgress = this.createProgressForComponent(
        userId,
        assignmentId,
        componentSnapshot
      )

      await this.progressRepository.update(existingProgress.id, resetProgress)

      logger.info('Прогресс компонента сброшен', { userId, componentSnapshotId })
      return resetProgress

    } catch (error) {
      logger.error('Ошибка при сбросе прогресса', { userId, componentSnapshotId, error: error.message })
      throw new Error(`Не удалось сбросить прогресс: ${error.message}`)
    }
  }

  /**
   * Получает аналитику прогресса пользователя
   */
  async getProgressAnalytics(
    userId: string,
    assignmentId: string
  ): Promise<{
    averageTimePerComponent: number
    totalLearningTime: number
    completionRate: number
    strugglingComponents: Array<{
      componentSnapshotId: string
      componentTitle: string
      attempts: number
      timeSpent: number
      status: ComponentProgressStatus
    }>
    dailyActivity: Array<{
      date: string
      componentsCompleted: number
      timeSpent: number
    }>
  }> {
    try {
      const userProgress = await this.progressRepository.findByUserAndAssignment(userId, assignmentId)
      const flowSnapshot = await this.snapshotRepository.findByAssignmentId(assignmentId)
      
      if (!flowSnapshot) {
        throw new Error('Снапшот потока не найден')
      }

      const stepSnapshots = await this.snapshotRepository.findStepsByFlowSnapshotId(flowSnapshot.id)
      const componentSnapshots = await this.snapshotRepository.findComponentsByStepSnapshotIds(
        stepSnapshots.map(step => step.id)
      )

      // Подсчитываем метрики
      const totalTime = userProgress.reduce((sum, p) => sum + p.getTotalTimeSpent(), 0)
      const completedCount = userProgress.filter(p => p.isCompleted()).length
      const totalComponents = componentSnapshots.length

      const averageTimePerComponent = completedCount > 0 ? totalTime / completedCount : 0
      const completionRate = totalComponents > 0 ? (completedCount / totalComponents) * 100 : 0

      // Находим проблемные компоненты
      const strugglingComponents = userProgress
        .filter(p => p.getAttemptCount() > 2 || p.getTotalTimeSpent() > 600) // Более 2 попыток или 10 минут
        .map(p => ({
          componentSnapshotId: p.componentSnapshotId,
          componentTitle: this.getComponentTitle(p.componentSnapshotId, componentSnapshots),
          attempts: p.getAttemptCount(),
          timeSpent: p.getTotalTimeSpent(),
          status: p.status
        }))

      // Активность по дням (упрощенная версия)
      const dailyActivity = this.calculateDailyActivity(userProgress)

      return {
        averageTimePerComponent,
        totalLearningTime: totalTime,
        completionRate,
        strugglingComponents,
        dailyActivity
      }

    } catch (error) {
      logger.error('Ошибка при получении аналитики', { userId, assignmentId, error: error.message })
      throw new Error(`Не удалось получить аналитику: ${error.message}`)
    }
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ =====

  /**
   * Получает или создает прогресс компонента
   */
  private async getOrCreateComponentProgress(
    userId: string,
    assignmentId: string,
    componentSnapshotId: string
  ): Promise<ComponentProgress> {
    let progress = await this.progressRepository.findByUserAndComponent(
      userId,
      assignmentId,
      componentSnapshotId
    )

    if (!progress) {
      // Создаем новый прогресс
      const componentSnapshot = await this.snapshotRepository.findComponentById(componentSnapshotId)
      if (!componentSnapshot) {
        throw new Error('Снапшот компонента не найден')
      }

      progress = this.createProgressForComponent(userId, assignmentId, componentSnapshot)
      await this.progressRepository.create(progress)
    }

    return progress
  }

  /**
   * Создает прогресс для компонента в зависимости от его типа
   */
  private createProgressForComponent(
    userId: string,
    assignmentId: string,
    componentSnapshot: ComponentSnapshot
  ): ComponentProgress {
    const baseParams = {
      userId,
      assignmentId,
      componentSnapshotId: componentSnapshot.id
    }

    switch (componentSnapshot.type) {
      case 'ARTICLE':
        return ComponentProgressFactory.createForArticle(baseParams)
      case 'TASK':
        return ComponentProgressFactory.createForTask(baseParams)
      case 'QUIZ':
        return ComponentProgressFactory.createForQuiz(baseParams)
      case 'VIDEO':
        return ComponentProgressFactory.createForVideo(baseParams)
      default:
        throw new Error(`Неподдерживаемый тип компонента: ${componentSnapshot.type}`)
    }
  }

  /**
   * Обрабатывает обновление прогресса в зависимости от действия
   */
  private async processProgressUpdate(
    progress: ComponentProgress,
    updateData: ProgressUpdateData
  ): Promise<ComponentProgress> {
    switch (updateData.action) {
      case 'START':
        return progress.start()

      case 'UPDATE_PROGRESS':
        return progress.updateProgress(updateData.data || {})

      case 'SUBMIT_ANSWER':
        return this.processAnswerSubmission(progress, updateData.data || {})

      case 'COMPLETE':
        return progress.complete()

      default:
        throw new Error(`Неподдерживаемое действие: ${updateData.action}`)
    }
  }

  /**
   * Обрабатывает отправку ответа (для TASK и QUIZ компонентов)
   */
  private async processAnswerSubmission(
    progress: ComponentProgress,
    answerData: Record<string, any>
  ): Promise<ComponentProgress> {
    const componentSnapshot = await this.snapshotRepository.findComponentById(progress.componentSnapshotId)
    if (!componentSnapshot) {
      throw new Error('Снапшот компонента не найден')
    }

    let updatedProgress = progress

    if (componentSnapshot.type === 'TASK') {
      const result = componentSnapshot.validateTaskAnswer(answerData.answer || '')
      
      // Обновляем данные прогресса задания
      const taskProgressData = {
        ...progress.progressData,
        attempts: progress.progressData.attempts + 1,
        lastAnswer: answerData.answer,
        isCorrect: result.isCorrect,
        attemptHistory: [
          ...progress.progressData.attemptHistory,
          {
            attemptNumber: progress.progressData.attempts + 1,
            answer: answerData.answer,
            isCorrect: result.isCorrect,
            submittedAt: new Date(),
            timeSpentSeconds: answerData.timeSpent || 0
          }
        ]
      }

      updatedProgress = progress.updateProgress(taskProgressData)

      if (result.isCorrect) {
        updatedProgress = updatedProgress.complete()
      }
    }

    if (componentSnapshot.type === 'QUIZ') {
      const result = componentSnapshot.validateQuizAnswers(answerData.answers || {})
      
      // Обновляем данные прогресса квиза
      const quizProgressData = {
        ...progress.progressData,
        attempts: progress.progressData.attempts + 1,
        currentScore: result.score,
        bestScore: Math.max(progress.progressData.bestScore, result.score),
        passed: result.passed,
        attemptHistory: [
          ...progress.progressData.attemptHistory,
          {
            attemptNumber: progress.progressData.attempts + 1,
            score: result.score,
            correctAnswers: result.correctAnswers,
            totalQuestions: result.totalQuestions,
            timeSpentSeconds: answerData.timeSpent || 0,
            startedAt: answerData.startedAt ? new Date(answerData.startedAt) : new Date(),
            completedAt: new Date(),
            answers: answerData.answers
          }
        ]
      }

      updatedProgress = progress.updateProgress(quizProgressData)

      if (result.passed) {
        updatedProgress = updatedProgress.complete()
      }
    }

    return updatedProgress
  }

  /**
   * Проверяет и разблокирует новые шаги после завершения компонента
   */
  private async checkAndUnlockNextSteps(
    userId: string,
    assignmentId: string,
    completedComponentSnapshotId: string
  ): Promise<UnlockResult> {
    // Упрощенная реализация - в реальном проекте здесь была бы сложная логика
    // проверки условий разблокировки шагов
    
    return {
      hasNewUnlocks: false,
      newUnlockedStepIds: [],
      newUnlockedComponentIds: [],
      messages: []
    }
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  private async calculateStepProgress(
    stepSnapshots: FlowStepSnapshot[],
    componentSnapshots: ComponentSnapshot[],
    userProgress: ComponentProgress[]
  ): Promise<any[]> {
    return stepSnapshots.map(step => {
      const stepComponents = componentSnapshots.filter(c => 
        step.componentSnapshotIds.includes(c.id)
      )
      
      const stepProgress = userProgress.filter(p => 
        step.componentSnapshotIds.includes(p.componentSnapshotId)
      )

      const completedComponents = stepProgress.filter(p => p.isCompleted()).length
      const progress = stepComponents.length > 0 ? 
        Math.round((completedComponents / stepComponents.length) * 100) : 100

      return {
        stepSnapshotId: step.id,
        stepTitle: step.title,
        stepOrder: step.order,
        progress,
        status: this.determineStepStatus(step, stepProgress, stepComponents),
        componentCount: stepComponents.length,
        completedComponents
      }
    })
  }

  private determineStepStatus(
    step: FlowStepSnapshot,
    stepProgress: ComponentProgress[],
    stepComponents: ComponentSnapshot[]
  ): string {
    if (stepComponents.length === 0) return 'COMPLETED'
    
    const completedCount = stepProgress.filter(p => p.isCompleted()).length
    const inProgressCount = stepProgress.filter(p => p.isInProgress()).length

    if (completedCount === stepComponents.length) return 'COMPLETED'
    if (inProgressCount > 0 || completedCount > 0) return 'IN_PROGRESS'
    
    // Здесь должна быть логика проверки условий разблокировки
    return 'AVAILABLE' // Упрощение
  }

  private async getUnlockedStepIds(
    userId: string,
    assignmentId: string,
    stepSnapshots: FlowStepSnapshot[],
    userProgress: ComponentProgress[]
  ): Promise<string[]> {
    // Упрощенная логика - разблокируем шаги по порядку
    const unlockedIds: string[] = []
    
    for (const step of stepSnapshots.sort((a, b) => a.order - b.order)) {
      // Первый шаг всегда разблокирован
      if (step.order === 0) {
        unlockedIds.push(step.id)
        continue
      }

      // Проверяем, завершен ли предыдущий шаг
      const prevStep = stepSnapshots.find(s => s.order === step.order - 1)
      if (prevStep) {
        const prevStepCompleted = step.componentSnapshotIds.every(compId =>
          userProgress.some(p => p.componentSnapshotId === compId && p.isCompleted())
        )
        
        if (prevStepCompleted) {
          unlockedIds.push(step.id)
        }
      }
    }

    return unlockedIds
  }

  private async findNextAvailableComponent(
    stepSnapshots: FlowStepSnapshot[],
    componentSnapshots: ComponentSnapshot[],
    userProgress: ComponentProgress[],
    unlockedStepIds: string[]
  ): Promise<any> {
    // Ищем первый незавершенный компонент в разблокированных шагах
    for (const step of stepSnapshots.filter(s => unlockedStepIds.includes(s.id)).sort((a, b) => a.order - b.order)) {
      for (const componentId of step.componentSnapshotIds) {
        const progress = userProgress.find(p => p.componentSnapshotId === componentId)
        if (!progress || !progress.isCompleted()) {
          const component = componentSnapshots.find(c => c.id === componentId)
          if (component) {
            return {
              componentSnapshotId: component.id,
              stepSnapshotId: step.id,
              title: component.getTitle(),
              type: component.type
            }
          }
        }
      }
    }

    return undefined
  }

  private calculateProgressStats(
    userProgress: ComponentProgress[],
    stepSnapshots: FlowStepSnapshot[],
    componentSnapshots: ComponentSnapshot[]
  ): any {
    return {
      totalTimeSpent: userProgress.reduce((sum, p) => sum + p.getTotalTimeSpent(), 0),
      totalAttempts: userProgress.reduce((sum, p) => sum + p.getAttemptCount(), 0),
      completedComponents: userProgress.filter(p => p.isCompleted()).length,
      totalComponents: componentSnapshots.length,
      completedSteps: 0, // TODO: подсчитать завершенные шаги
      totalSteps: stepSnapshots.length
    }
  }

  private calculateFlowProgress(stepProgress: any[]): number {
    if (stepProgress.length === 0) return 0
    
    const totalProgress = stepProgress.reduce((sum, step) => sum + step.progress, 0)
    return Math.round(totalProgress / stepProgress.length)
  }

  private getComponentTitle(componentSnapshotId: string, componentSnapshots: ComponentSnapshot[]): string {
    const component = componentSnapshots.find(c => c.id === componentSnapshotId)
    return component ? component.getTitle() : 'Unknown Component'
  }

  private calculateDailyActivity(userProgress: ComponentProgress[]): any[] {
    // Упрощенная реализация для примера
    const today = new Date().toISOString().split('T')[0]
    
    return [{
      date: today,
      componentsCompleted: userProgress.filter(p => p.isCompleted()).length,
      timeSpent: userProgress.reduce((sum, p) => sum + p.getTotalTimeSpent(), 0)
    }]
  }
}

/**
 * Интерфейс сервиса прогресса
 */
export interface IProgressService {
  updateComponentProgress(
    userId: string,
    assignmentId: string,
    componentSnapshotId: string,
    updateData: ProgressUpdateData
  ): Promise<{ progress: ComponentProgress; unlockResult: UnlockResult }>
  
  getProgressSummary(userId: string, assignmentId: string): Promise<ProgressSummary>
  resetComponentProgress(userId: string, assignmentId: string, componentSnapshotId: string): Promise<ComponentProgress>
  getProgressAnalytics(userId: string, assignmentId: string): Promise<any>
}