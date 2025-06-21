/**
 * Доменная сущность ComponentSnapshot
 * 
 * Представляет неизменяемый снапшот компонента (статья, задание, квиз, видео)
 * на момент назначения потока пользователю.
 * 
 * Компоненты - это атомарные единицы контента, которые пользователь
 * проходит в рамках обучения. Каждый тип компонента имеет свою
 * специфичную структуру данных и логику взаимодействия.
 */

// ===== БАЗОВЫЕ ТИПЫ =====

export type ComponentType = 'ARTICLE' | 'TASK' | 'QUIZ' | 'VIDEO'

export interface BaseComponentData {
  /** Уникальный идентификатор снапшота компонента */
  id: string
  
  /** ID снапшота шага, к которому относится компонент */
  stepSnapshotId: string
  
  /** ID оригинального компонента */
  originalComponentId: string
  
  /** Тип компонента */
  type: ComponentType
  
  /** Версия типа компонента (для совместимости) */
  typeVersion: string
  
  /** Порядковый номер компонента в шаге */
  order: number
  
  /** Является ли компонент обязательным для завершения шага */
  isRequired: boolean
  
  /** Метаданные создания снапшота */
  snapshotMeta: {
    createdAt: Date
    createdBy: string
    snapshotVersion: string
    context?: Record<string, any>
  }
}

// ===== ТИПЫ ДАННЫХ ДЛЯ РАЗНЫХ КОМПОНЕНТОВ =====

export interface ArticleComponentData extends BaseComponentData {
  type: 'ARTICLE'
  data: {
    /** Заголовок статьи */
    title: string
    /** Содержимое статьи (Markdown/HTML) */
    content: string
    /** Краткое изложение */
    summary?: string
    /** Примерное время чтения (минуты) */
    estimatedReadTime?: number
    /** Прикрепленные файлы и изображения */
    attachments: Array<{
      id: string
      filename: string
      url: string
      type: 'IMAGE' | 'PDF' | 'DOCUMENT' | 'OTHER'
      size: number
    }>
    /** Метаданные для отслеживания прогресса чтения */
    trackingMeta?: {
      /** Минимальное время для засчитывания прочтения (секунды) */
      minReadTime?: number
      /** Требуется ли прокрутка до конца */
      requireFullScroll?: boolean
    }
  }
}

export interface TaskComponentData extends BaseComponentData {
  type: 'TASK'
  data: {
    /** Название задания */
    title: string
    /** Описание задания */
    description: string
    /** Подробная инструкция */
    instruction: string
    /** Подсказка (если есть) */
    hint?: string
    /** Правильное кодовое слово/ответ */
    correctAnswer: string
    /** Альтернативные правильные ответы */
    alternativeAnswers?: string[]
    /** Настройки проверки ответа */
    validationSettings: {
      /** Регистрочувствительность */
      caseSensitive: boolean
      /** Игнорировать пробелы в начале/конце */
      trimWhitespace: boolean
      /** Максимальное количество попыток */
      maxAttempts?: number
    }
    /** Прикрепленные файлы (инструкции, примеры) */
    attachments?: Array<{
      id: string
      filename: string
      url: string
      type: 'IMAGE' | 'PDF' | 'DOCUMENT' | 'OTHER'
      size: number
    }>
  }
}

export interface QuizQuestion {
  /** ID вопроса */
  id: string
  /** Текст вопроса */
  text: string
  /** Тип вопроса */
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'
  /** Варианты ответов */
  options: Array<{
    id: string
    text: string
    isCorrect: boolean
    explanation?: string
  }>
  /** Пояснение к вопросу */
  explanation?: string
  /** Баллы за правильный ответ */
  points: number
}

export interface QuizComponentData extends BaseComponentData {
  type: 'QUIZ'
  data: {
    /** Название квиза */
    title: string
    /** Описание квиза */
    description: string
    /** Список вопросов */
    questions: QuizQuestion[]
    /** Настройки квиза */
    settings: {
      /** Минимальный процент для прохождения */
      passingScore: number
      /** Максимальное количество попыток */
      maxAttempts?: number
      /** Перемешивать вопросы */
      shuffleQuestions: boolean
      /** Перемешивать варианты ответов */
      shuffleOptions: boolean
      /** Показывать результаты после каждого вопроса */
      showFeedbackPerQuestion: boolean
      /** Ограничение времени (в секундах) */
      timeLimit?: number
    }
  }
}

export interface VideoComponentData extends BaseComponentData {
  type: 'VIDEO'
  data: {
    /** Название видео */
    title: string
    /** Описание видео */
    description: string
    /** URL видео */
    videoUrl: string
    /** Продолжительность в секундах */
    duration: number
    /** Превью изображение */
    thumbnailUrl?: string
    /** Субтитры */
    subtitles?: Array<{
      language: string
      url: string
    }>
    /** Настройки отслеживания просмотра */
    trackingSettings: {
      /** Минимальный процент просмотра для засчитывания */
      minWatchPercentage: number
      /** Можно ли перематывать */
      allowSeeking: boolean
      /** Скорость воспроизведения */
      playbackSpeed: number[]
    }
    /** Временные метки для навигации */
    chapters?: Array<{
      time: number
      title: string
      description?: string
    }>
  }
}

export type ComponentSnapshotData = 
  | ArticleComponentData 
  | TaskComponentData 
  | QuizComponentData 
  | VideoComponentData

// ===== ОСНОВНОЙ КЛАСС =====

export class ComponentSnapshot {
  private data: ComponentSnapshotData

  constructor(data: ComponentSnapshotData) {
    this.data = { ...data }
    this.validate()
  }

  // ===== ОБЩИЕ ГЕТТЕРЫ =====

  get id(): string {
    return this.data.id
  }

  get stepSnapshotId(): string {
    return this.data.stepSnapshotId
  }

  get originalComponentId(): string {
    return this.data.originalComponentId
  }

  get type(): ComponentType {
    return this.data.type
  }

  get typeVersion(): string {
    return this.data.typeVersion
  }

  get order(): number {
    return this.data.order
  }

  get isRequired(): boolean {
    return this.data.isRequired
  }

  get createdAt(): Date {
    return new Date(this.data.snapshotMeta.createdAt)
  }

  get snapshotVersion(): string {
    return this.data.snapshotMeta.snapshotVersion
  }

  // ===== ГЕТТЕРЫ ДЛЯ СПЕЦИФИЧНЫХ ДАННЫХ =====

  /**
   * Возвращает типизированные данные компонента
   */
  getTypedData<T extends ComponentSnapshotData>(): T['data'] {
    return this.data.data as T['data']
  }

  /**
   * Возвращает заголовок компонента (универсально для всех типов)
   */
  getTitle(): string {
    switch (this.data.type) {
      case 'ARTICLE':
        return (this.data as ArticleComponentData).data.title
      case 'TASK':
        return (this.data as TaskComponentData).data.title
      case 'QUIZ':
        return (this.data as QuizComponentData).data.title
      case 'VIDEO':
        return (this.data as VideoComponentData).data.title
      default:
        return 'Untitled Component'
    }
  }

  /**
   * Возвращает описание компонента (универсально для всех типов)
   */
  getDescription(): string {
    switch (this.data.type) {
      case 'ARTICLE':
        return (this.data as ArticleComponentData).data.summary || ''
      case 'TASK':
        return (this.data as TaskComponentData).data.description
      case 'QUIZ':
        return (this.data as QuizComponentData).data.description
      case 'VIDEO':
        return (this.data as VideoComponentData).data.description
      default:
        return ''
    }
  }

  /**
   * Возвращает примерное время прохождения компонента (в минутах)
   */
  getEstimatedDuration(): number {
    switch (this.data.type) {
      case 'ARTICLE':
        return (this.data as ArticleComponentData).data.estimatedReadTime || 5
      case 'TASK':
        return 10 // Стандартное время для задания
      case 'QUIZ': {
        const quizData = this.data as QuizComponentData
        const questionsCount = quizData.data.questions.length
        return Math.max(questionsCount * 2, 5) // 2 минуты на вопрос, минимум 5
      }
      case 'VIDEO': {
        const videoData = this.data as VideoComponentData
        return Math.ceil(videoData.data.duration / 60) // Конвертируем секунды в минуты
      }
      default:
        return 5
    }
  }

  // ===== МЕТОДЫ БИЗНЕС-ЛОГИКИ =====

  /**
   * Проверяет, является ли компонент интерактивным (требует действий пользователя)
   */
  isInteractive(): boolean {
    return this.data.type === 'TASK' || this.data.type === 'QUIZ'
  }

  /**
   * Проверяет, можно ли пропустить компонент
   */
  isOptional(): boolean {
    return !this.data.isRequired
  }

  /**
   * Возвращает список файлов, прикрепленных к компоненту
   */
  getAttachments(): Array<{ id: string; filename: string; url: string; type: string; size: number }> {
    switch (this.data.type) {
      case 'ARTICLE':
        return (this.data as ArticleComponentData).data.attachments || []
      case 'TASK':
        return (this.data as TaskComponentData).data.attachments || []
      default:
        return []
    }
  }

  /**
   * Проверяет ответ на задание (только для TASK компонентов)
   */
  validateTaskAnswer(userAnswer: string): { isCorrect: boolean; normalizedAnswer: string } {
    if (this.data.type !== 'TASK') {
      throw new Error('Метод validateTaskAnswer доступен только для TASK компонентов')
    }

    const taskData = this.data as TaskComponentData
    const { correctAnswer, alternativeAnswers = [], validationSettings } = taskData.data

    // Нормализация ответа пользователя
    let normalizedAnswer = userAnswer
    if (validationSettings.trimWhitespace) {
      normalizedAnswer = normalizedAnswer.trim()
    }
    if (!validationSettings.caseSensitive) {
      normalizedAnswer = normalizedAnswer.toLowerCase()
    }

    // Нормализация правильных ответов
    const normalizeCorrectAnswer = (answer: string) => {
      let normalized = answer
      if (validationSettings.trimWhitespace) {
        normalized = normalized.trim()
      }
      if (!validationSettings.caseSensitive) {
        normalized = normalized.toLowerCase()
      }
      return normalized
    }

    const normalizedCorrect = normalizeCorrectAnswer(correctAnswer)
    const normalizedAlternatives = alternativeAnswers.map(normalizeCorrectAnswer)

    const isCorrect = normalizedAnswer === normalizedCorrect || 
                     normalizedAlternatives.includes(normalizedAnswer)

    return { isCorrect, normalizedAnswer }
  }

  /**
   * Проверяет ответы на квиз (только для QUIZ компонентов)
   */
  validateQuizAnswers(userAnswers: Record<string, string[]>): {
    totalQuestions: number
    correctAnswers: number
    score: number
    passed: boolean
    questionResults: Array<{
      questionId: string
      isCorrect: boolean
      correctOptionIds: string[]
      userOptionIds: string[]
    }>
  } {
    if (this.data.type !== 'QUIZ') {
      throw new Error('Метод validateQuizAnswers доступен только для QUIZ компонентов')
    }

    const quizData = this.data as QuizComponentData
    const { questions, settings } = quizData.data

    let correctCount = 0
    const questionResults = questions.map(question => {
      const userOptionIds = userAnswers[question.id] || []
      const correctOptionIds = question.options
        .filter(option => option.isCorrect)
        .map(option => option.id)

      // Проверяем, совпадают ли ответы пользователя с правильными
      const isCorrect = correctOptionIds.length === userOptionIds.length &&
                       correctOptionIds.every(id => userOptionIds.includes(id))

      if (isCorrect) {
        correctCount++
      }

      return {
        questionId: question.id,
        isCorrect,
        correctOptionIds,
        userOptionIds
      }
    })

    const score = Math.round((correctCount / questions.length) * 100)
    const passed = score >= settings.passingScore

    return {
      totalQuestions: questions.length,
      correctAnswers: correctCount,
      score,
      passed,
      questionResults
    }
  }

  // ===== МЕТОДЫ СЕРИАЛИЗАЦИИ =====

  /**
   * Возвращает копию внутренних данных для сериализации
   */
  toData(): ComponentSnapshotData {
    return JSON.parse(JSON.stringify(this.data))
  }

  /**
   * Создает новый экземпляр из данных
   */
  static fromData(data: ComponentSnapshotData): ComponentSnapshot {
    return new ComponentSnapshot(data)
  }

  // ===== ПРИВАТНЫЕ МЕТОДЫ =====

  /**
   * Валидация данных снапшота компонента
   */
  private validate(): void {
    // Базовая валидация
    if (!this.data.id) {
      throw new Error('ComponentSnapshot: ID обязателен')
    }

    if (!this.data.stepSnapshotId) {
      throw new Error('ComponentSnapshot: stepSnapshotId обязателен')
    }

    if (!['ARTICLE', 'TASK', 'QUIZ', 'VIDEO'].includes(this.data.type)) {
      throw new Error('ComponentSnapshot: некорректный тип компонента')
    }

    if (typeof this.data.order !== 'number' || this.data.order < 0) {
      throw new Error('ComponentSnapshot: order должен быть неотрицательным числом')
    }

    // Специфичная валидация по типам
    switch (this.data.type) {
      case 'ARTICLE':
        this.validateArticleData(this.data as ArticleComponentData)
        break
      case 'TASK':
        this.validateTaskData(this.data as TaskComponentData)
        break
      case 'QUIZ':
        this.validateQuizData(this.data as QuizComponentData)
        break
      case 'VIDEO':
        this.validateVideoData(this.data as VideoComponentData)
        break
    }
  }

  private validateArticleData(data: ArticleComponentData): void {
    if (!data.data.title?.trim()) {
      throw new Error('ArticleComponent: title обязателен')
    }
    if (!data.data.content?.trim()) {
      throw new Error('ArticleComponent: content обязателен')
    }
  }

  private validateTaskData(data: TaskComponentData): void {
    if (!data.data.title?.trim()) {
      throw new Error('TaskComponent: title обязателен')
    }
    if (!data.data.correctAnswer?.trim()) {
      throw new Error('TaskComponent: correctAnswer обязателен')
    }
  }

  private validateQuizData(data: QuizComponentData): void {
    if (!data.data.title?.trim()) {
      throw new Error('QuizComponent: title обязателен')
    }
    if (!Array.isArray(data.data.questions) || data.data.questions.length === 0) {
      throw new Error('QuizComponent: должен содержать хотя бы один вопрос')
    }
    
    // Валидация каждого вопроса
    data.data.questions.forEach((question, index) => {
      if (!question.text?.trim()) {
        throw new Error(`QuizComponent: текст вопроса ${index + 1} обязателен`)
      }
      if (!Array.isArray(question.options) || question.options.length < 2) {
        throw new Error(`QuizComponent: вопрос ${index + 1} должен иметь минимум 2 варианта ответа`)
      }
      
      const correctOptions = question.options.filter(opt => opt.isCorrect)
      if (correctOptions.length === 0) {
        throw new Error(`QuizComponent: вопрос ${index + 1} должен иметь хотя бы один правильный ответ`)
      }
    })
  }

  private validateVideoData(data: VideoComponentData): void {
    if (!data.data.title?.trim()) {
      throw new Error('VideoComponent: title обязателен')
    }
    if (!data.data.videoUrl?.trim()) {
      throw new Error('VideoComponent: videoUrl обязателен')
    }
    if (typeof data.data.duration !== 'number' || data.data.duration <= 0) {
      throw new Error('VideoComponent: duration должен быть положительным числом')
    }
  }
}

/**
 * Фабричные методы для создания разных типов компонентов
 */
export class ComponentSnapshotFactory {
  static createArticle(params: {
    stepSnapshotId: string
    originalComponentId: string
    order: number
    isRequired: boolean
    title: string
    content: string
    summary?: string
    estimatedReadTime?: number
    attachments?: Array<any>
    createdBy: string
    snapshotVersion: string
  }): ComponentSnapshot {
    const id = `comp_snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return new ComponentSnapshot({
      id,
      stepSnapshotId: params.stepSnapshotId,
      originalComponentId: params.originalComponentId,
      type: 'ARTICLE',
      typeVersion: '1.0',
      order: params.order,
      isRequired: params.isRequired,
      data: {
        title: params.title,
        content: params.content,
        summary: params.summary,
        estimatedReadTime: params.estimatedReadTime,
        attachments: params.attachments || []
      },
      snapshotMeta: {
        createdAt: new Date(),
        createdBy: params.createdBy,
        snapshotVersion: params.snapshotVersion
      }
    })
  }

  static createTask(params: {
    stepSnapshotId: string
    originalComponentId: string
    order: number
    isRequired: boolean
    title: string
    description: string
    instruction: string
    correctAnswer: string
    alternativeAnswers?: string[]
    hint?: string
    validationSettings?: any
    createdBy: string
    snapshotVersion: string
  }): ComponentSnapshot {
    const id = `comp_snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return new ComponentSnapshot({
      id,
      stepSnapshotId: params.stepSnapshotId,
      originalComponentId: params.originalComponentId,
      type: 'TASK',
      typeVersion: '1.0',
      order: params.order,
      isRequired: params.isRequired,
      data: {
        title: params.title,
        description: params.description,
        instruction: params.instruction,
        correctAnswer: params.correctAnswer,
        alternativeAnswers: params.alternativeAnswers,
        hint: params.hint,
        validationSettings: params.validationSettings || {
          caseSensitive: false,
          trimWhitespace: true,
          maxAttempts: 3
        }
      },
      snapshotMeta: {
        createdAt: new Date(),
        createdBy: params.createdBy,
        snapshotVersion: params.snapshotVersion
      }
    })
  }

  // Аналогично можно добавить createQuiz и createVideo методы...
}