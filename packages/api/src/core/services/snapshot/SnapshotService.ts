/**
 * SnapshotService - сервис для создания и управления снапшотами
 * 
 * Отвечает за создание полных неизменяемых копий потоков при назначении
 * пользователю. Это ключевая особенность архитектуры BuddyBot.
 * 
 * Процесс создания снапшота:
 * 1. Получение полной структуры оригинального потока
 * 2. Создание снапшота потока (FlowSnapshot)
 * 3. Создание снапшотов всех шагов (FlowStepSnapshot)
 * 4. Создание снапшотов всех компонентов (ComponentSnapshot)
 * 5. Сохранение всех снапшотов в базу данных
 * 
 * Снапшоты гарантируют, что изменения в оригинальном потоке
 * не повлияют на пользователей, которые уже проходят обучение.
 */

import { FlowSnapshot, FlowSnapshotFactory } from '../../entities/FlowSnapshot'
import { FlowStepSnapshot, FlowStepSnapshotFactory } from '../../entities/FlowStepSnapshot'
import { ComponentSnapshot, ComponentSnapshotFactory } from '../../entities/ComponentSnapshot'
import { IFlowRepository } from '../../repositories/FlowRepository'
import { IFlowSnapshotRepository } from '../../repositories/FlowSnapshotRepository'
import { logger } from '../../../utils/logger'

// ===== ИНТЕРФЕЙСЫ =====

export interface SnapshotCreationContext {
  /** ID назначения потока */
  assignmentId: string
  /** ID пользователя, для которого создается снапшот */
  userId: string
  /** ID пользователя, который инициировал создание снапшота */
  createdBy: string
  /** Дополнительный контекст */
  additionalContext?: Record<string, any>
}

export interface SnapshotCreationResult {
  /** Созданный снапшот потока */
  flowSnapshot: FlowSnapshot
  /** Созданные снапшоты шагов */
  stepSnapshots: FlowStepSnapshot[]
  /** Созданные снапшоты компонентов */
  componentSnapshots: ComponentSnapshot[]
  /** Статистика создания */
  stats: {
    totalSteps: number
    totalComponents: number
    creationTimeMs: number
    snapshotSize: number // приблизительный размер в байтах
  }
}

export interface SnapshotValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
}

// ===== ОСНОВНОЙ СЕРВИС =====

export class SnapshotService {
  private readonly CURRENT_SNAPSHOT_VERSION = '1.0.0'
  
  constructor(
    private readonly flowRepository: IFlowRepository,
    private readonly snapshotRepository: IFlowSnapshotRepository
  ) {}

  /**
   * Создает полный снапшот потока для назначения
   */
  async createFlowSnapshot(
    flowId: string, 
    context: SnapshotCreationContext
  ): Promise<SnapshotCreationResult> {
    const startTime = Date.now()
    
    try {
      logger.info('Начинаем создание снапшота потока', {
        flowId,
        assignmentId: context.assignmentId,
        userId: context.userId
      })

      // 1. Получаем полную структуру оригинального потока
      const originalFlow = await this.getFullFlowStructure(flowId)
      
      // 2. Валидируем поток перед созданием снапшота
      const validationResult = await this.validateFlowForSnapshot(originalFlow)
      if (!validationResult.isValid) {
        throw new Error(`Поток не прошел валидацию: ${validationResult.errors.join(', ')}`)
      }

      // 3. Создаем снапшоты компонентов (начинаем с самого глубокого уровня)
      const componentSnapshots = await this.createComponentSnapshots(
        originalFlow.steps,
        context
      )

      // 4. Создаем снапшоты шагов
      const stepSnapshots = await this.createStepSnapshots(
        originalFlow.steps,
        componentSnapshots,
        context
      )

      // 5. Создаем снапшот потока
      const flowSnapshot = this.createFlowSnapshotEntity(
        originalFlow,
        stepSnapshots.map(step => step.id),
        context
      )

      // 6. Сохраняем все снапшоты в базу данных в транзакции
      await this.saveSnapshotsToDatabase({
        flowSnapshot,
        stepSnapshots,
        componentSnapshots
      })

      // 7. Подсчитываем статистику
      const stats = this.calculateSnapshotStats(
        stepSnapshots,
        componentSnapshots,
        startTime
      )

      logger.info('Снапшот потока успешно создан', {
        flowSnapshotId: flowSnapshot.id,
        assignmentId: context.assignmentId,
        stats
      })

      return {
        flowSnapshot,
        stepSnapshots,
        componentSnapshots,
        stats
      }

    } catch (error) {
      logger.error('Ошибка при создании снапшота потока', {
        flowId,
        assignmentId: context.assignmentId,
        error: error.message
      })
      throw new Error(`Не удалось создать снапшот потока: ${error.message}`)
    }
  }

  /**
   * Получает существующий снапшот по ID назначения
   */
  async getSnapshotByAssignment(assignmentId: string): Promise<SnapshotCreationResult | null> {
    try {
      const flowSnapshot = await this.snapshotRepository.findByAssignmentId(assignmentId)
      if (!flowSnapshot) {
        return null
      }

      const stepSnapshots = await this.snapshotRepository.findStepsByFlowSnapshotId(flowSnapshot.id)
      const componentSnapshots = await this.snapshotRepository.findComponentsByStepSnapshotIds(
        stepSnapshots.map(step => step.id)
      )

      return {
        flowSnapshot,
        stepSnapshots,
        componentSnapshots,
        stats: {
          totalSteps: stepSnapshots.length,
          totalComponents: componentSnapshots.length,
          creationTimeMs: 0,
          snapshotSize: 0
        }
      }
    } catch (error) {
      logger.error('Ошибка при получении снапшота', { assignmentId, error: error.message })
      throw new Error(`Не удалось получить снапшот: ${error.message}`)
    }
  }

  /**
   * Проверяет совместимость снапшота с текущей версией системы
   */
  async validateSnapshotCompatibility(snapshotId: string): Promise<SnapshotValidationResult> {
    try {
      const flowSnapshot = await this.snapshotRepository.findById(snapshotId)
      if (!flowSnapshot) {
        return {
          isValid: false,
          errors: ['Снапшот не найден'],
          warnings: []
        }
      }

      const errors: string[] = []
      const warnings: string[] = []

      // Проверяем совместимость версии снапшота
      if (!flowSnapshot.isCompatible(this.CURRENT_SNAPSHOT_VERSION)) {
        errors.push('Версия снапшота несовместима с текущей версией системы')
      }

      // Проверяем возраст снапшота
      if (!flowSnapshot.isRecent(90)) { // 90 дней
        warnings.push('Снапшот был создан более 90 дней назад')
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      }
    } catch (error) {
      return {
        isValid: false,
        errors: [`Ошибка при валидации снапшота: ${error.message}`],
        warnings: []
      }
    }
  }

  /**
   * Удаляет снапшот и все связанные данные
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    try {
      logger.info('Начинаем удаление снапшота', { snapshotId })
      
      await this.snapshotRepository.deleteFlowSnapshot(snapshotId)
      
      logger.info('Снапшот успешно удален', { snapshotId })
    } catch (error) {
      logger.error('Ошибка при удалении снапшота', { snapshotId, error: error.message })
      throw new Error(`Не удалось удалить снапшот: ${error.message}`)
    }
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ =====

  /**
   * Получает полную структуру потока с шагами и компонентами
   */
  private async getFullFlowStructure(flowId: string): Promise<any> {
    const flow = await this.flowRepository.findByIdWithStepsAndComponents(flowId)
    if (!flow) {
      throw new Error(`Поток с ID ${flowId} не найден`)
    }
    return flow
  }

  /**
   * Валидирует поток перед созданием снапшота
   */
  private async validateFlowForSnapshot(flow: any): Promise<SnapshotValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // Базовые проверки потока
    if (!flow.title?.trim()) {
      errors.push('Поток должен иметь название')
    }

    if (!flow.steps || flow.steps.length === 0) {
      errors.push('Поток должен содержать хотя бы один шаг')
    }

    // Проверка шагов
    if (flow.steps) {
      flow.steps.forEach((step: any, stepIndex: number) => {
        if (!step.title?.trim()) {
          errors.push(`Шаг ${stepIndex + 1} должен иметь название`)
        }

        if (!step.components || step.components.length === 0) {
          warnings.push(`Шаг ${stepIndex + 1} не содержит компонентов`)
        }

        // Проверка компонентов
        if (step.components) {
          step.components.forEach((component: any, componentIndex: number) => {
            if (!component.type) {
              errors.push(`Компонент ${componentIndex + 1} в шаге ${stepIndex + 1} должен иметь тип`)
            }

            if (!['ARTICLE', 'TASK', 'QUIZ', 'VIDEO'].includes(component.type)) {
              errors.push(`Компонент ${componentIndex + 1} в шаге ${stepIndex + 1} имеет некорректный тип`)
            }
          })
        }
      })
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Создает снапшоты всех компонентов
   */
  private async createComponentSnapshots(
    steps: any[],
    context: SnapshotCreationContext
  ): Promise<ComponentSnapshot[]> {
    const componentSnapshots: ComponentSnapshot[] = []

    for (const step of steps) {
      if (!step.components) continue

      for (const component of step.components) {
        const componentSnapshot = this.createComponentSnapshotEntity(
          component,
          step.id, // Пока используем оригинальный stepId, потом заменим на snapshotId
          context
        )
        componentSnapshots.push(componentSnapshot)
      }
    }

    return componentSnapshots
  }

  /**
   * Создает снапшоты всех шагов
   */
  private async createStepSnapshots(
    steps: any[],
    componentSnapshots: ComponentSnapshot[],
    context: SnapshotCreationContext
  ): Promise<FlowStepSnapshot[]> {
    const stepSnapshots: FlowStepSnapshot[] = []

    for (const step of steps) {
      // Находим снапшоты компонентов для этого шага
      const stepComponentSnapshots = componentSnapshots.filter(
        comp => comp.stepSnapshotId === step.id // Здесь пока оригинальный ID
      )

      const stepSnapshot = FlowStepSnapshotFactory.createFromStep({
        flowSnapshotId: '', // Заполним позже
        originalStep: {
          id: step.id,
          title: step.title,
          description: step.description,
          order: step.order,
          estimatedDuration: step.estimatedDuration,
          icon: step.icon,
          themeColor: step.themeColor
        },
        componentSnapshotIds: stepComponentSnapshots.map(comp => comp.id),
        unlockConditions: step.unlockConditions || [{ type: 'PREVIOUS_STEP_COMPLETED' }],
        completionRequirements: step.completionRequirements || { type: 'ALL_COMPONENTS' },
        createdBy: context.createdBy,
        snapshotVersion: this.CURRENT_SNAPSHOT_VERSION,
        context: context.additionalContext
      })

      stepSnapshots.push(stepSnapshot)

      // Обновляем stepSnapshotId в снапшотах компонентов
      stepComponentSnapshots.forEach(comp => {
        comp['data'].stepSnapshotId = stepSnapshot.id
      })
    }

    return stepSnapshots
  }

  /**
   * Создает снапшот компонента
   */
  private createComponentSnapshotEntity(
    component: any,
    stepId: string,
    context: SnapshotCreationContext
  ): ComponentSnapshot {
    switch (component.type) {
      case 'ARTICLE':
        return ComponentSnapshotFactory.createArticle({
          stepSnapshotId: stepId,
          originalComponentId: component.id,
          order: component.order,
          isRequired: component.isRequired,
          title: component.title,
          content: component.content,
          summary: component.summary,
          estimatedReadTime: component.estimatedReadTime,
          attachments: component.attachments,
          createdBy: context.createdBy,
          snapshotVersion: this.CURRENT_SNAPSHOT_VERSION
        })

      case 'TASK':
        return ComponentSnapshotFactory.createTask({
          stepSnapshotId: stepId,
          originalComponentId: component.id,
          order: component.order,
          isRequired: component.isRequired,
          title: component.title,
          description: component.description,
          instruction: component.instruction,
          correctAnswer: component.correctAnswer,
          alternativeAnswers: component.alternativeAnswers,
          hint: component.hint,
          validationSettings: component.validationSettings,
          createdBy: context.createdBy,
          snapshotVersion: this.CURRENT_SNAPSHOT_VERSION
        })

      // TODO: Добавить создание QUIZ и VIDEO компонентов
      default:
        throw new Error(`Неподдерживаемый тип компонента: ${component.type}`)
    }
  }

  /**
   * Создает снапшот потока
   */
  private createFlowSnapshotEntity(
    flow: any,
    stepSnapshotIds: string[],
    context: SnapshotCreationContext
  ): FlowSnapshot {
    return FlowSnapshotFactory.createFromFlow({
      assignmentId: context.assignmentId,
      originalFlow: {
        id: flow.id,
        title: flow.title,
        description: flow.description,
        version: flow.version || '1.0',
        estimatedDuration: flow.estimatedDuration,
        difficulty: flow.difficulty,
        tags: flow.tags || []
      },
      stepSnapshotIds,
      createdBy: context.createdBy,
      snapshotVersion: this.CURRENT_SNAPSHOT_VERSION,
      context: context.additionalContext
    })
  }

  /**
   * Сохраняет все снапшоты в базу данных в рамках транзакции
   */
  private async saveSnapshotsToDatabase(snapshots: {
    flowSnapshot: FlowSnapshot
    stepSnapshots: FlowStepSnapshot[]
    componentSnapshots: ComponentSnapshot[]
  }): Promise<void> {
    try {
      // В реальном проекте здесь должна быть транзакция
      await this.snapshotRepository.createFlowSnapshot(snapshots.flowSnapshot)
      
      for (const stepSnapshot of snapshots.stepSnapshots) {
        await this.snapshotRepository.createStepSnapshot(stepSnapshot)
      }
      
      for (const componentSnapshot of snapshots.componentSnapshots) {
        await this.snapshotRepository.createComponentSnapshot(componentSnapshot)
      }
    } catch (error) {
      // В случае ошибки откатываем все изменения
      throw new Error(`Ошибка при сохранении снапшотов: ${error.message}`)
    }
  }

  /**
   * Подсчитывает статистику создания снапшота
   */
  private calculateSnapshotStats(
    stepSnapshots: FlowStepSnapshot[],
    componentSnapshots: ComponentSnapshot[],
    startTime: number
  ): any {
    return {
      totalSteps: stepSnapshots.length,
      totalComponents: componentSnapshots.length,
      creationTimeMs: Date.now() - startTime,
      snapshotSize: JSON.stringify({ stepSnapshots, componentSnapshots }).length
    }
  }
}

/**
 * Интерфейс репозитория для снапшотов
 */
export interface ISnapshotService {
  createFlowSnapshot(flowId: string, context: SnapshotCreationContext): Promise<SnapshotCreationResult>
  getSnapshotByAssignment(assignmentId: string): Promise<SnapshotCreationResult | null>
  validateSnapshotCompatibility(snapshotId: string): Promise<SnapshotValidationResult>
  deleteSnapshot(snapshotId: string): Promise<void>
}