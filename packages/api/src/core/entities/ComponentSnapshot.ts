/**
 * ComponentSnapshot - доменная сущность снапшота компонента
 * 
 * Файл: packages/api/src/core/entities/ComponentSnapshot.ts
 * 
 * Представляет неизменяемую копию компонента (статья, задание, квиз, видео).
 * Поддерживает все типы компонентов с их специфичными данными.
 * Создается при назначении потока и остается неизменным.
 */

import { Entity } from './base/Entity'
import { DomainError } from '../errors/DomainError'

// ===== ТИПЫ КОМПОНЕНТОВ =====

export type ComponentType = 'ARTICLE' | 'TASK' | 'QUIZ' | 'VIDEO'

// ===== VALUE OBJECTS =====

export interface ComponentSnapshotMetadata {
  /** Версия снапшота компонента */
  snapshotVersion: string
  /** Тип компонента */
  componentType: ComponentType
  /** Размер содержимого в байтах */
  contentSize: number
  /** Приблизительное время прохождения в минутах */
  estimatedDurationMinutes?: number
  /** Сложность компонента */
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD'
  /** Теги для категоризации */
  tags: string[]
}

export interface OriginalComponentReference {
  /** ID оригинального компонента */
  originalComponentId: string
  /** Название оригинального компонента */
  originalComponentTitle: string
  /** Описание оригинального компонента */
  originalComponentDescription?: string
  /** Порядковый номер в шаге */
  originalOrder: number
}

// ===== СОДЕРЖИМОЕ ДЛЯ РАЗНЫХ ТИПОВ КОМПОНЕНТОВ =====

export interface ArticleContent {
  /** Основной текст статьи */
  text: string
  /** HTML разметка (если есть) */
  htmlContent?: string
  /** Прикрепленные изображения */
  images?: {
    url: string
    alt?: string
    caption?: string
  }[]
  /** Прикрепленные файлы */
  attachments?: {
    url: string
    filename: string
    fileType: string
    size: number
  }[]
  /** Ссылки на внешние ресурсы */
  externalLinks?: {
    url: string
    title: string
    description?: string
  }[]
}

export interface TaskContent {
  /** Инструкция к заданию */
  instruction: string
  /** Правильный ответ */
  correctAnswer?: string
  /** Альтернативные правильные ответы */
  alternativeAnswers?: string[]
  /** Подсказка */
  hint?: string
  /** Настройки валидации ответа */
  validationSettings?: {
    /** Чувствительность к регистру */
    caseSensitive?: boolean
    /** Игнорировать пробелы в начале/конце */
    trimWhitespace?: boolean
    /** Разрешить частичные совпадения */
    allowPartialMatch?: boolean
    /** Регулярное выражение для проверки */
    regexPattern?: string
  }
  /** Примеры правильных ответов для пользователя */
  examples?: string[]
  /** Максимальная длина ответа */
  maxAnswerLength?: number
}

export interface QuizContent {
  /** Вопрос квиза */
  question: string
  /** Варианты ответов */
  options: {
    id: string
    text: string
    isCorrect: boolean
    explanation?: string
  }[]
  /** Тип квиза */
  quizType: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE'
  /** Объяснение правильного ответа */
  explanation?: string
  /** Показывать ли результат сразу */
  showResultImmediately?: boolean
  /** Перемешивать ли варианты ответов */
  shuffleOptions?: boolean
}

export interface VideoContent {
  /** URL видео */
  videoUrl: string
  /** Продолжительность в секундах */
  duration?: number
  /** Thumbnail изображение */
  thumbnail?: string
  /** Субтитры */
  subtitles?: {
    language: string
    url: string
  }[]
  /** Временные метки для навигации */
  chapters?: {
    time: number
    title: string
    description?: string
  }[]
  /** Требуется ли просмотр до конца */
  requireFullWatch?: boolean
  /** Минимальный процент просмотра для засчитывания */
  minWatchPercentage?: number
}

export type ComponentContent = ArticleContent | TaskContent | QuizContent | VideoContent

// ===== ОСНОВНАЯ СУЩНОСТЬ =====

export interface ComponentSnapshotProps {
  id: string
  stepSnapshotId: string
  originalComponentReference: OriginalComponentReference
  metadata: ComponentSnapshotMetadata
  content: ComponentContent
  isRequired: boolean
  maxAttempts?: number
  settings?: Record<string, any>
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export class ComponentSnapshot extends Entity<ComponentSnapshotProps> {
  
  constructor(props: ComponentSnapshotProps) {
    super(props)
    this.validate()
  }

  // ===== GETTERS =====

  get stepSnapshotId(): string {
    return this.props.stepSnapshotId
  }

  get originalComponentReference(): OriginalComponentReference {
    return { ...this.props.originalComponentReference }
  }

  get metadata(): ComponentSnapshotMetadata {
    return { ...this.props.metadata }
  }

  get content(): ComponentContent {
    return JSON.parse(JSON.stringify(this.props.content)) // Deep copy
  }

  get isRequired(): boolean {
    return this.props.isRequired
  }

  get maxAttempts(): number | undefined {
    return this.props.maxAttempts
  }

  get settings(): Record<string, any> | undefined {
    return this.props.settings ? { ...this.props.settings } : undefined
  }

  get createdBy(): string {
    return this.props.createdBy
  }

  get createdAt(): Date {
    return this.props.createdAt
  }

  get updatedAt(): Date {
    return this.props.updatedAt
  }

  // ===== ВЫЧИСЛЯЕМЫЕ СВОЙСТВА =====

  get title(): string {
    return this.props.originalComponentReference.originalComponentTitle
  }

  get description(): string | undefined {
    return this.props.originalComponentReference.originalComponentDescription
  }

  get order(): number {
    return this.props.originalComponentReference.originalOrder
  }

  get type(): ComponentType {
    return this.props.metadata.componentType
  }

  get estimatedDuration(): number | undefined {
    return this.props.metadata.estimatedDurationMinutes
  }

  get difficulty(): string | undefined {
    return this.props.metadata.difficulty
  }

  get tags(): string[] {
    return [...this.props.metadata.tags]
  }

  get hasTimeLimit(): boolean {
    return !!this.settings?.timeLimit
  }

  get allowsMultipleAttempts(): boolean {
    return !this.maxAttempts || this.maxAttempts > 1
  }

  // ===== МЕТОДЫ ДЛЯ РАБОТЫ С КОНТЕНТОМ =====

  /**
   * Проверяет, является ли компонент статьей
   */
  isArticle(): this is ComponentSnapshot & { content: ArticleContent } {
    return this.type === 'ARTICLE'
  }

  /**
   * Проверяет, является ли компонент заданием
   */
  isTask(): this is ComponentSnapshot & { content: TaskContent } {
    return this.type === 'TASK'
  }

  /**
   * Проверяет, является ли компонент квизом
   */
  isQuiz(): this is ComponentSnapshot & { content: QuizContent } {
    return this.type === 'QUIZ'
  }

  /**
   * Проверяет, является ли компонент видео
   */
  isVideo(): this is ComponentSnapshot & { content: VideoContent } {
    return this.type === 'VIDEO'
  }

  /**
   * Получает контент как статью (с проверкой типа)
   */
  getArticleContent(): ArticleContent {
    if (!this.isArticle()) {
      throw new DomainError(`Компонент ${this.id} не является статьей`)
    }
    return this.content as ArticleContent
  }

  /**
   * Получает контент как задание (с проверкой типа)
   */
  getTaskContent(): TaskContent {
    if (!this.isTask()) {
      throw new DomainError(`Компонент ${this.id} не является заданием`)
    }
    return this.content as TaskContent
  }

  /**
   * Получает контент как квиз (с проверкой типа)
   */
  getQuizContent(): QuizContent {
    if (!this.isQuiz()) {
      throw new DomainError(`Компонент ${this.id} не является квизом`)
    }
    return this.content as QuizContent
  }

  /**
   * Получает контент как видео (с проверкой типа)
   */
  getVideoContent(): VideoContent {
    if (!this.isVideo()) {
      throw new DomainError(`Компонент ${this.id} не является видео`)
    }
    return this.content as VideoContent
  }

  // ===== МЕТОДЫ ВАЛИДАЦИИ ОТВЕТОВ =====

  /**
   * Валидирует ответ пользователя на задание
   */
  validateTaskAnswer(userAnswer: string): {
    isCorrect: boolean
    feedback?: string
    normalizedAnswer?: string
  } {
    if (!this.isTask()) {
      throw new DomainError('Валидация ответа доступна только для заданий')
    }

    const taskContent = this.getTaskContent()
    if (!taskContent.correctAnswer) {
      return { isCorrect: true, feedback: 'Ответ принят' }
    }

    const settings = taskContent.validationSettings || {}
    let normalizedUserAnswer = userAnswer
    let normalizedCorrectAnswer = taskContent.correctAnswer

    // Применяем настройки валидации
    if (settings.trimWhitespace !== false) {
      normalizedUserAnswer = normalizedUserAnswer.trim()
      normalizedCorrectAnswer = normalizedCorrectAnswer.trim()
    }

    if (settings.caseSensitive !== true) {
      normalizedUserAnswer = normalizedUserAnswer.toLowerCase()
      normalizedCorrectAnswer = normalizedCorrectAnswer.toLowerCase()
    }

    // Проверяем основной ответ
    let isCorrect = normalizedUserAnswer === normalizedCorrectAnswer

    // Проверяем альтернативные ответы
    if (!isCorrect && taskContent.alternativeAnswers) {
      isCorrect = taskContent.alternativeAnswers.some(alt => {
        let normalizedAlt = alt
        if (settings.trimWhitespace !== false) normalizedAlt = normalizedAlt.trim()
        if (settings.caseSensitive !== true) normalizedAlt = normalizedAlt.toLowerCase()
        return normalizedUserAnswer === normalizedAlt
      })
    }

    // Проверяем по регулярному выражению
    if (!isCorrect && settings.regexPattern) {
      try {
        const regex = new RegExp(settings.regexPattern, settings.caseSensitive ? '' : 'i')
        isCorrect = regex.test(userAnswer)
      } catch (error) {
        // Игнорируем ошибки в регулярном выражении
      }
    }

    // Частичное совпадение
    if (!isCorrect && settings.allowPartialMatch) {
      isCorrect = normalizedCorrectAnswer.includes(normalizedUserAnswer) ||
                  normalizedUserAnswer.includes(normalizedCorrectAnswer)
    }

    return {
      isCorrect,
      feedback: isCorrect ? 'Правильно!' : (taskContent.hint || 'Неправильно, попробуйте еще раз'),
      normalizedAnswer: normalizedUserAnswer
    }
  }

  /**
   * Валидирует ответ пользователя на квиз
   */
  validateQuizAnswer(selectedOptionIds: string[]): {
    isCorrect: boolean
    correctOptionIds: string[]
    feedback?: string
    explanation?: string
  } {
    if (!this.isQuiz()) {
      throw new DomainError('Валидация ответа доступна только для квизов')
    }

    const quizContent = this.getQuizContent()
    const correctOptionIds = quizContent.options
      .filter(option => option.isCorrect)
      .map(option => option.id)

    const isCorrect = this.arraysEqual(selectedOptionIds.sort(), correctOptionIds.sort())

    return {
      isCorrect,
      correctOptionIds,
      feedback: isCorrect ? 'Правильно!' : 'Неправильно',
      explanation: quizContent.explanation
    }
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((val, index) => val === b[index])
  }

  // ===== МЕТОДЫ ОБНОВЛЕНИЯ =====

  /**
   * Обновляет настройки компонента
   */
  updateSettings(newSettings: Record<string, any>): ComponentSnapshot {
    return new ComponentSnapshot({
      ...this.props,
      settings: { ...this.props.settings, ...newSettings },
      updatedAt: new Date()
    })
  }

  /**
   * Помечает компонент как обновленный
   */
  touch(): ComponentSnapshot {
    return new ComponentSnapshot({
      ...this.props,
      updatedAt: new Date()
    })
  }

  // ===== ВАЛИДАЦИЯ =====

  private validate(): void {
    if (!this.props.stepSnapshotId?.trim()) {
      throw new DomainError('ComponentSnapshot должен принадлежать FlowStepSnapshot')
    }

    if (!this.props.originalComponentReference?.originalComponentId?.trim()) {
      throw new DomainError('ComponentSnapshot должен содержать ссылку на оригинальный компонент')
    }

    if (!this.props.originalComponentReference?.originalComponentTitle?.trim()) {
      throw new DomainError('ComponentSnapshot должен иметь название')
    }

    if (this.props.originalComponentReference.originalOrder < 0) {
      throw new DomainError('Порядковый номер компонента не может быть отрицательным')
    }

    if (!this.props.metadata?.componentType) {
      throw new DomainError('ComponentSnapshot должен иметь тип компонента')
    }

    if (!['ARTICLE', 'TASK', 'QUIZ', 'VIDEO'].includes(this.props.metadata.componentType)) {
      throw new DomainError(`Неподдерживаемый тип компонента: ${this.props.metadata.componentType}`)
    }

    if (!this.props.content) {
      throw new DomainError('ComponentSnapshot должен иметь содержимое')
    }

    if (!this.props.createdBy?.trim()) {
      throw new DomainError('ComponentSnapshot должен иметь создателя')
    }

    // Валидация специфичного содержимого
    this.validateContentByType()
  }

  private validateContentByType(): void {
    switch (this.type) {
      case 'ARTICLE':
        this.validateArticleContent()
        break
      case 'TASK':
        this.validateTaskContent()
        break
      case 'QUIZ':
        this.validateQuizContent()
        break
      case 'VIDEO':
        this.validateVideoContent()
        break
    }
  }

  private validateArticleContent(): void {
    const content = this.content as ArticleContent
    if (!content.text?.trim()) {
      throw new DomainError('Статья должна содержать текст')
    }
  }

  private validateTaskContent(): void {
    const content = this.content as TaskContent
    if (!content.instruction?.trim()) {
      throw new DomainError('Задание должно содержать инструкцию')
    }
  }

  private validateQuizContent(): void {
    const content = this.content as QuizContent
    if (!content.question?.trim()) {
      throw new DomainError('Квиз должен содержать вопрос')
    }
    if (!content.options || content.options.length < 2) {
      throw new DomainError('Квиз должен содержать минимум 2 варианта ответа')
    }
    if (!content.options.some(option => option.isCorrect)) {
      throw new DomainError('Квиз должен содержать минимум один правильный ответ')
    }
  }

  private validateVideoContent(): void {
    const content = this.content as VideoContent
    if (!content.videoUrl?.trim()) {
      throw new DomainError('Видео должно содержать URL')
    }
  }

  // ===== ПРЕОБРАЗОВАНИЯ =====

  /**
   * Преобразует в объект для сериализации
   */
  toJSON(): any {
    return {
      id: this.id,
      stepSnapshotId: this.stepSnapshotId,
      originalComponentReference: this.originalComponentReference,
      metadata: this.metadata,
      content: this.content,
      isRequired: this.isRequired,
      maxAttempts: this.maxAttempts,
      settings: this.settings,
      createdBy: this.createdBy,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString()
    }
  }

  /**
   * Создает краткое представление для логов
   */
  toLogString(): string {
    return `ComponentSnapshot(${this.id}, type: ${this.type}, step: ${this.stepSnapshotId}, order: ${this.order})`
  }
}

// ===== ФАБРИКИ ДЛЯ СОЗДАНИЯ СНАПШОТОВ КОМПОНЕНТОВ =====

interface BaseCreateComponentSnapshotInput {
  stepSnapshotId: string
  originalComponentId: string
  order: number
  isRequired: boolean
  title: string
  description?: string
  maxAttempts?: number
  estimatedDuration?: number
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD'
  tags?: string[]
  createdBy: string
  snapshotVersion: string
  settings?: Record<string, any>
}

export class ComponentSnapshotFactory {
  
  /**
   * Создает снапшот статьи
   */
  static createArticle(input: BaseCreateComponentSnapshotInput & {
    text: string
    htmlContent?: string
    images?: ArticleContent['images']
    attachments?: ArticleContent['attachments']
    externalLinks?: ArticleContent['externalLinks']
  }): ComponentSnapshot {
    const content: ArticleContent = {
      text: input.text,
      htmlContent: input.htmlContent,
      images: input.images || [],
      attachments: input.attachments || [],
      externalLinks: input.externalLinks || []
    }

    return this.createComponentSnapshot(input, 'ARTICLE', content)
  }

  /**
   * Создает снапшот задания
   */
  static createTask(input: BaseCreateComponentSnapshotInput & {
    instruction: string
    correctAnswer?: string
    alternativeAnswers?: string[]
    hint?: string
    validationSettings?: TaskContent['validationSettings']
    examples?: string[]
    maxAnswerLength?: number
  }): ComponentSnapshot {
    const content: TaskContent = {
      instruction: input.instruction,
      correctAnswer: input.correctAnswer,
      alternativeAnswers: input.alternativeAnswers,
      hint: input.hint,
      validationSettings: input.validationSettings,
      examples: input.examples,
      maxAnswerLength: input.maxAnswerLength
    }

    return this.createComponentSnapshot(input, 'TASK', content)
  }

  /**
   * Создает снапшот квиза
   */
  static createQuiz(input: BaseCreateComponentSnapshotInput & {
    question: string
    options: QuizContent['options']
    quizType: QuizContent['quizType']
    explanation?: string
    showResultImmediately?: boolean
    shuffleOptions?: boolean
  }): ComponentSnapshot {
    const content: QuizContent = {
      question: input.question,
      options: input.options,
      quizType: input.quizType,
      explanation: input.explanation,
      showResultImmediately: input.showResultImmediately,
      shuffleOptions: input.shuffleOptions
    }

    return this.createComponentSnapshot(input, 'QUIZ', content)
  }

  /**
   * Создает снапшот видео
   */
  static createVideo(input: BaseCreateComponentSnapshotInput & {
    videoUrl: string
    duration?: number
    thumbnail?: string
    subtitles?: VideoContent['subtitles']
    chapters?: VideoContent['chapters']
    requireFullWatch?: boolean
    minWatchPercentage?: number
  }): ComponentSnapshot {
    const content: VideoContent = {
      videoUrl: input.videoUrl,
      duration: input.duration,
      thumbnail: input.thumbnail,
      subtitles: input.subtitles || [],
      chapters: input.chapters || [],
      requireFullWatch: input.requireFullWatch,
      minWatchPercentage: input.minWatchPercentage
    }

    return this.createComponentSnapshot(input, 'VIDEO', content)
  }

  /**
   * Общий метод создания снапшота компонента
   */
  private static createComponentSnapshot(
    input: BaseCreateComponentSnapshotInput,
    componentType: ComponentType,
    content: ComponentContent
  ): ComponentSnapshot {
    const now = new Date()
    const id = this.generateComponentSnapshotId(input.stepSnapshotId, input.originalComponentId)
    
    const contentSize = this.estimateContentSize(content)

    const props: ComponentSnapshotProps = {
      id,
      stepSnapshotId: input.stepSnapshotId,
      originalComponentReference: {
        originalComponentId: input.originalComponentId,
        originalComponentTitle: input.title,
        originalComponentDescription: input.description,
        originalOrder: input.order
      },
      metadata: {
        snapshotVersion: input.snapshotVersion,
        componentType,
        contentSize,
        estimatedDurationMinutes: input.estimatedDuration,
        difficulty: input.difficulty,
        tags: input.tags || []
      },
      content,
      isRequired: input.isRequired,
      maxAttempts: input.maxAttempts,
      settings: input.settings,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now
    }

    return new ComponentSnapshot(props)
  }

  /**
   * Генерирует уникальный ID для снапшота компонента
   */
  private static generateComponentSnapshotId(stepSnapshotId: string, componentId: string): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 6)
    return `cs_${stepSnapshotId}_${componentId}_${timestamp}_${random}`
  }

  /**
   * Оценивает размер содержимого компонента
   */
  private static estimateContentSize(content: ComponentContent): number {
    return JSON.stringify(content).length * 2 // UTF-16 encoding
  }
}