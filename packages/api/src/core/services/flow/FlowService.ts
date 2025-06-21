/**
 * Сервис для работы с потоками обучения
 * 
 * Содержит бизнес-логику для:
 * - Создания и редактирования потоков
 * - Управления этапами и компонентами
 * - Валидации структуры потоков
 * - Контроля доступа к потокам
 * - Дублирования и версионирования
 * 
 * Координирует работу между репозиториями потоков и пользователей,
 * обеспечивая соблюдение бизнес-правил и валидацию данных.
 */

import { Role } from '@buddybot/database'
import { FlowRepository, FlowFilter, FlowStats, FlowWithDetails, CreateFlowStepInput, CreateFlowStepComponentInput } from '../../repositories/FlowRepository'
import { UserRepository } from '../../repositories/UserRepository'
import { Flow, CreateFlowInput, UpdateFlowInput, FlowSettings } from '../../entities/Flow'
import { PaginationParams, RepositoryError, RepositoryErrorType } from '../../repositories/base/BaseRepository'

/**
 * Интерфейс для создания полного потока со всеми данными
 */
export interface CreateCompleteFlowInput {
  // Основные данные потока
  title: string
  description: string
  defaultDeadlineDays?: number
  settings?: Partial<FlowSettings>
  
  // Этапы потока
  steps: CreateFlowStepWithComponentsInput[]
  
  // Метаданные
  createdBy: string
}

/**
 * Интерфейс для создания этапа с компонентами
 */
export interface CreateFlowStepWithComponentsInput extends CreateFlowStepInput {
  components: CreateFlowStepComponentInput[]
}

/**
 * Интерфейс для обновления потока
 */
export interface UpdateCompleteFlowInput {
  // Основные данные потока
  title?: string
  description?: string
  defaultDeadlineDays?: number
  settings?: Partial<FlowSettings>
  isActive?: boolean
  
  // Этапы (полная замена)
  steps?: CreateFlowStepWithComponentsInput[]
  
  // Метаданные
  updatedBy: string
}

/**
 * Результат поиска потоков
 */
export interface FlowSearchResult {
  flows: Flow[]
  pagination: {
    total: number
    page: number
    limit: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

/**
 * Параметры для валидации компонента
 */
export interface ComponentValidationParams {
  type: string
  typeVersion: string
  data: any
}

/**
 * Результат валидации потока
 */
export interface FlowValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  readyForAssignment: boolean
}

/**
 * Сервис для работы с потоками обучения
 * 
 * Реализует всю бизнес-логику связанную с потоками.
 * Обеспечивает валидацию, проверку прав доступа и координацию
 * между различными компонентами системы.
 */
export class FlowService {
  constructor(
    private flowRepository: FlowRepository,
    private userRepository: UserRepository
  ) {}

  /**
   * Создает новый поток обучения
   * 
   * @param input - данные для создания потока
   * @returns созданный поток
   */
  async createFlow(input: CreateFlowInput): Promise<Flow> {
    // Проверяем права создателя
    await this.validateCreatorPermissions(input.createdById)

    // Проверяем уникальность названия для данного создателя
    await this.validateFlowTitleUniqueness(input.title, input.createdById)

    const flow = await this.flowRepository.create(input)

    console.log(`✅ Создан новый поток: "${flow.title}" (создано пользователем ${input.createdById})`)

    return flow
  }

  /**
   * Создает полный поток со всеми этапами и компонентами
   * 
   * @param input - данные для создания полного потока
   * @returns созданный поток с деталями
   */
  async createCompleteFlow(input: CreateCompleteFlowInput): Promise<FlowWithDetails> {
    // Проверяем права создателя
    await this.validateCreatorPermissions(input.createdBy)

    // Проверяем уникальность названия
    await this.validateFlowTitleUniqueness(input.title, input.createdBy)

    // Валидируем структуру потока
    await this.validateFlowStructure(input.steps)

    // Создаем поток с этапами
    const flowData: CreateFlowInput = {
      title: input.title,
      description: input.description,
      createdById: input.createdBy,
      defaultDeadlineDays: input.defaultDeadlineDays,
      settings: input.settings
    }

    const flow = await this.flowRepository.createWithSteps(flowData, input.steps)

    // Создаем компоненты для каждого этапа
    for (let i = 0; i < input.steps.length; i++) {
      const stepInput = input.steps[i]
      const createdStep = flow.steps[i]

      for (const componentInput of stepInput.components) {
        // Валидируем данные компонента
        this.validateComponentData({
          type: componentInput.type,
          typeVersion: componentInput.typeVersion || '1.0.0',
          data: componentInput.data
        })

        await this.flowRepository.createStepComponent(createdStep.id, componentInput)
      }
    }

    // Получаем обновленный поток с компонентами
    const completeFlow = await this.flowRepository.findByIdWithDetails(flow.id)
    if (!completeFlow) {
      throw new RepositoryError(
        RepositoryErrorType.NOT_FOUND,
        'Не удалось получить созданный поток'
      )
    }

    console.log(`🎯 Создан полный поток: "${completeFlow.title}" с ${completeFlow.steps.length} этапами`)

    return completeFlow
  }

  /**
   * Обновляет поток обучения
   * 
   * @param flowId - ID потока
   * @param input - данные для обновления
   * @returns обновленный поток
   */
  async updateFlow(flowId: string, input: UpdateFlowInput): Promise<Flow> {
    // Получаем существующий поток
    const existingFlow = await this.flowRepository.findByIdOrThrow(flowId)

    // Проверяем права на редактирование
    await this.validateEditPermissions(existingFlow.createdById, input.updatedBy || existingFlow.createdById)

    // Проверяем уникальность названия (если оно изменяется)
    if (input.title && input.title !== existingFlow.title) {
      await this.validateFlowTitleUniqueness(input.title, existingFlow.createdById, flowId)
    }

    const updatedFlow = await this.flowRepository.update(flowId, input)

    console.log(`📝 Обновлен поток: "${updatedFlow.title}" (версия ${updatedFlow.version})`)

    return updatedFlow
  }

  /**
   * Получает поток по ID
   * 
   * @param flowId - ID потока
   * @param includeDetails - включать ли детальную информацию
   * @returns поток или null
   */
  async getFlowById(flowId: string, includeDetails: boolean = false): Promise<Flow | FlowWithDetails | null> {
    if (includeDetails) {
      return this.flowRepository.findByIdWithDetails(flowId)
    }
    return this.flowRepository.findById(flowId)
  }

  /**
   * Получает поток по ID или выбрасывает ошибку
   * 
   * @param flowId - ID потока
   * @param includeDetails - включать ли детальную информацию
   * @returns поток
   */
  async getFlowByIdOrThrow(flowId: string, includeDetails: boolean = false): Promise<Flow | FlowWithDetails> {
    if (includeDetails) {
      const flow = await this.flowRepository.findByIdWithDetails(flowId)
      if (!flow) {
        throw new RepositoryError(RepositoryErrorType.NOT_FOUND, 'Поток не найден')
      }
      return flow
    }
    return this.flowRepository.findByIdOrThrow(flowId)
  }

  /**
   * Получает активные потоки для назначения
   * 
   * @param filter - фильтры поиска
   * @param pagination - параметры пагинации
   * @returns активные потоки
   */
  async getActiveFlowsForAssignment(
    filter?: Omit<FlowFilter, 'isActive'>,
    pagination?: PaginationParams
  ): Promise<FlowSearchResult> {
    const result = await this.flowRepository.findActiveForAssignment(filter, pagination)

    return {
      flows: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает потоки созданные конкретным пользователем
   * 
   * @param createdById - ID создателя
   * @param filter - дополнительные фильтры
   * @param pagination - параметры пагинации
   * @returns потоки пользователя
   */
  async getFlowsByCreator(
    createdById: string,
    filter?: Omit<FlowFilter, 'createdById'>,
    pagination?: PaginationParams
  ): Promise<FlowSearchResult> {
    const result = await this.flowRepository.findByCreator(createdById, filter, pagination)

    return {
      flows: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Активирует поток для назначения
   * 
   * @param flowId - ID потока
   * @param activatedBy - ID пользователя, который активирует
   * @returns активированный поток
   */
  async activateFlow(flowId: string, activatedBy: string): Promise<Flow> {
    // Получаем поток с деталями для валидации
    const flow = await this.getFlowByIdOrThrow(flowId, true) as FlowWithDetails

    // Проверяем права на активацию
    await this.validateEditPermissions(flow.createdById, activatedBy)

    // Валидируем готовность к активации
    const validation = await this.validateFlowForActivation(flow)
    if (!validation.isValid) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        `Поток не готов к активации: ${validation.errors.join(', ')}`
      )
    }

    const updatedFlow = await this.flowRepository.update(flowId, { isActive: true })

    console.log(`🚀 Активирован поток: "${updatedFlow.title}" (активировано пользователем ${activatedBy})`)

    return updatedFlow
  }

  /**
   * Деактивирует поток
   * 
   * @param flowId - ID потока
   * @param deactivatedBy - ID пользователя, который деактивирует
   * @returns деактивированный поток
   */
  async deactivateFlow(flowId: string, deactivatedBy: string): Promise<Flow> {
    const flow = await this.flowRepository.findByIdOrThrow(flowId)

    // Проверяем права на деактивацию
    await this.validateEditPermissions(flow.createdById, deactivatedBy)

    const updatedFlow = await this.flowRepository.update(flowId, { isActive: false })

    console.log(`⏸️ Деактивирован поток: "${updatedFlow.title}" (деактивировано пользователем ${deactivatedBy})`)

    return updatedFlow
  }

  /**
   * Дублирует поток
   * 
   * @param sourceFlowId - ID исходного потока
   * @param newTitle - название нового потока
   * @param createdBy - ID создателя копии
   * @returns скопированный поток
   */
  async duplicateFlow(
    sourceFlowId: string,
    newTitle: string,
    createdBy: string
  ): Promise<FlowWithDetails> {
    // Проверяем права на создание
    await this.validateCreatorPermissions(createdBy)

    // Проверяем существование исходного потока
    const sourceFlow = await this.flowRepository.findByIdOrThrow(sourceFlowId)

    // Проверяем уникальность нового названия
    await this.validateFlowTitleUniqueness(newTitle, createdBy)

    const duplicatedFlow = await this.flowRepository.duplicate(sourceFlowId, newTitle, createdBy)

    console.log(`📋 Дублирован поток: "${sourceFlow.title}" -> "${newTitle}" (создано ${createdBy})`)

    return duplicatedFlow
  }

  /**
   * Удаляет поток (только если нет назначений)
   * 
   * @param flowId - ID потока
   * @param deletedBy - ID пользователя, который удаляет
   */
  async deleteFlow(flowId: string, deletedBy: string): Promise<void> {
    const flow = await this.flowRepository.findByIdOrThrow(flowId)

    // Проверяем права на удаление
    await this.validateEditPermissions(flow.createdById, deletedBy)

    // Проверяем, что поток не имеет назначений
    // TODO: Добавить проверку через FlowAssignmentRepository
    // const hasAssignments = await this.flowAssignmentRepository.hasAssignmentsByFlowId(flowId)
    // if (hasAssignments) {
    //   throw new RepositoryError(
    //     RepositoryErrorType.VALIDATION_ERROR,
    //     'Нельзя удалить поток, у которого есть назначения'
    //   )
    // }

    await this.flowRepository.delete(flowId)

    console.log(`🗑️ Удален поток: "${flow.title}" (удалено пользователем ${deletedBy})`)
  }

  /**
   * Обновляет настройки потока
   * 
   * @param flowId - ID потока
   * @param settings - новые настройки
   * @param updatedBy - ID пользователя, который обновляет
   * @returns обновленные настройки
   */
  async updateFlowSettings(
    flowId: string,
    settings: Partial<FlowSettings>,
    updatedBy: string
  ): Promise<FlowSettings> {
    const flow = await this.flowRepository.findByIdOrThrow(flowId)

    // Проверяем права на редактирование
    await this.validateEditPermissions(flow.createdById, updatedBy)

    const updatedSettings = await this.flowRepository.updateSettings(flowId, settings)

    console.log(`⚙️ Обновлены настройки потока: "${flow.title}"`)

    return updatedSettings
  }

  /**
   * Валидирует поток для готовности к назначению
   * 
   * @param flow - поток для валидации
   * @returns результат валидации
   */
  async validateFlowForActivation(flow: FlowWithDetails): Promise<FlowValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    // Проверяем наличие этапов
    if (flow.steps.length === 0) {
      errors.push('Поток должен содержать хотя бы один этап')
    }

    // Проверяем каждый этап
    for (const step of flow.steps) {
      if (step.components.length === 0) {
        warnings.push(`Этап "${step.title}" не содержит компонентов`)
      }

      // Проверяем обязательные этапы
      if (step.isRequired && step.components.length === 0) {
        errors.push(`Обязательный этап "${step.title}" должен содержать хотя бы один компонент`)
      }

      // Валидируем компоненты
      for (const component of step.components) {
        try {
          this.validateComponentData({
            type: component.type,
            typeVersion: component.typeVersion,
            data: component.data
          })
        } catch (error) {
          errors.push(`Ошибка в компоненте этапа "${step.title}": ${error.message}`)
        }
      }
    }

    // Проверяем настройки потока
    if (flow.settings) {
      try {
        // Валидация настроек через доменную сущность
        const flowEntity = new Flow(
          flow.id,
          flow.title,
          flow.description,
          flow.isActive,
          flow.version,
          flow.createdAt,
          flow.updatedAt,
          flow.defaultDeadlineDays,
          flow.createdById,
          flow.stepsCount,
          flow.settings
        )
      } catch (error) {
        errors.push(`Ошибка в настройках потока: ${error.message}`)
      }
    }

    const isValid = errors.length === 0
    const readyForAssignment = isValid && flow.isActive

    return {
      isValid,
      errors,
      warnings,
      readyForAssignment
    }
  }

  /**
   * Получает статистику потоков
   * 
   * @returns статистика потоков
   */
  async getFlowStats(): Promise<FlowStats> {
    return this.flowRepository.getStats()
  }

  /**
   * Проверяет права создателя потоков
   * 
   * @param userId - ID пользователя
   */
  private async validateCreatorPermissions(userId: string): Promise<void> {
    const user = await this.userRepository.findByIdOrThrow(userId)
    
    if (!user.canCreateFlows()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Недостаточно прав для создания потоков обучения'
      )
    }
  }

  /**
   * Проверяет права на редактирование потока
   * 
   * @param creatorId - ID создателя потока
   * @param editorId - ID редактора
   */
  private async validateEditPermissions(creatorId: string, editorId: string): Promise<void> {
    // Создатель может редактировать свой поток
    if (creatorId === editorId) {
      return
    }

    // Администраторы могут редактировать любые потоки
    const editor = await this.userRepository.findByIdOrThrow(editorId)
    if (editor.hasRole(Role.ADMIN)) {
      return
    }

    throw new RepositoryError(
      RepositoryErrorType.VALIDATION_ERROR,
      'Недостаточно прав для редактирования этого потока'
    )
  }

  /**
   * Проверяет уникальность названия потока
   * 
   * @param title - название потока
   * @param createdById - ID создателя
   * @param excludeFlowId - ID потока для исключения (при обновлении)
   */
  private async validateFlowTitleUniqueness(
    title: string,
    createdById: string,
    excludeFlowId?: string
  ): Promise<void> {
    const existingFlows = await this.flowRepository.findByCreator(createdById, {
      search: {
        query: title,
        fields: ['title']
      }
    })

    const duplicateFlow = existingFlows.data.find(flow => 
      flow.title.toLowerCase() === title.toLowerCase() &&
      flow.id !== excludeFlowId
    )

    if (duplicateFlow) {
      throw new RepositoryError(
        RepositoryErrorType.DUPLICATE,
        'У вас уже есть поток с таким названием'
      )
    }
  }

  /**
   * Валидирует структуру этапов потока
   * 
   * @param steps - этапы для валидации
   */
  private async validateFlowStructure(steps: CreateFlowStepWithComponentsInput[]): Promise<void> {
    if (steps.length === 0) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Поток должен содержать хотя бы один этап'
      )
    }

    // Проверяем порядок этапов
    const orders = steps.map(step => step.order).sort((a, b) => a - b)
    for (let i = 0; i < orders.length; i++) {
      if (orders[i] !== i + 1) {
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          'Порядок этапов должен быть последовательным, начиная с 1'
        )
      }
    }

    // Проверяем уникальность названий этапов
    const titles = steps.map(step => step.title.toLowerCase())
    const uniqueTitles = new Set(titles)
    if (titles.length !== uniqueTitles.size) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Названия этапов должны быть уникальными'
      )
    }
  }

  /**
   * Валидирует данные компонента
   * 
   * @param params - параметры для валидации
   */
  private validateComponentData(params: ComponentValidationParams): void {
    const { type, data } = params

    // Базовая валидация для всех типов
    if (!data || typeof data !== 'object') {
      throw new Error('Данные компонента должны быть объектом')
    }

    // Валидация специфичная для типа компонента
    switch (type) {
      case 'article':
        this.validateArticleComponent(data)
        break
      case 'task':
        this.validateTaskComponent(data)
        break
      case 'quiz':
        this.validateQuizComponent(data)
        break
      case 'video':
        this.validateVideoComponent(data)
        break
      default:
        // Для неизвестных типов просто проверяем наличие базовых полей
        if (!data.title) {
          throw new Error('Компонент должен иметь название')
        }
    }
  }

  /**
   * Валидирует компонент типа "статья"
   */
  private validateArticleComponent(data: any): void {
    if (!data.title?.trim()) {
      throw new Error('Статья должна иметь название')
    }
    if (!data.content?.trim()) {
      throw new Error('Статья должна иметь содержимое')
    }
  }

  /**
   * Валидирует компонент типа "задание"
   */
  private validateTaskComponent(data: any): void {
    if (!data.title?.trim()) {
      throw new Error('Задание должно иметь название')
    }
    if (!data.description?.trim()) {
      throw new Error('Задание должно иметь описание')
    }
    if (!data.codeWord?.trim()) {
      throw new Error('Задание должно иметь кодовое слово для проверки')
    }
  }

  /**
   * Валидирует компонент типа "квиз"
   */
  private validateQuizComponent(data: any): void {
    if (!data.title?.trim()) {
      throw new Error('Квиз должен иметь название')
    }
    if (!Array.isArray(data.questions) || data.questions.length === 0) {
      throw new Error('Квиз должен содержать хотя бы один вопрос')
    }

    data.questions.forEach((question: any, index: number) => {
      if (!question.text?.trim()) {
        throw new Error(`Вопрос ${index + 1} должен иметь текст`)
      }
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`Вопрос ${index + 1} должен иметь минимум 2 варианта ответа`)
      }
      
      const correctOptions = question.options.filter((opt: any) => opt.isCorrect)
      if (correctOptions.length === 0) {
        throw new Error(`Вопрос ${index + 1} должен иметь хотя бы один правильный ответ`)
      }
    })
  }

  /**
   * Валидирует компонент типа "видео"
   */
  private validateVideoComponent(data: any): void {
    if (!data.title?.trim()) {
      throw new Error('Видео должно иметь название')
    }
    if (!data.url?.trim()) {
      throw new Error('Видео должно иметь ссылку')
    }
    
    // Проверяем формат URL
    try {
      new URL(data.url)
    } catch {
      throw new Error('Некорректная ссылка на видео')
    }
  }
}