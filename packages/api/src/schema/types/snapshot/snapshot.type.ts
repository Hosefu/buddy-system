/**
 * GraphQL типы для снапшотов
 * 
 * Файл: packages/api/src/schema/types/snapshot/snapshot.type.ts
 * 
 * Определяет GraphQL типы для работы со снапшотами потоков, шагов и компонентов.
 * Эти типы обеспечивают типобезопасный API для клиентских приложений.
 */

import { builder } from '../../index'
import { FlowSnapshot } from '../../../core/entities/FlowSnapshot'
import { FlowStepSnapshot } from '../../../core/entities/FlowStepSnapshot'
import { ComponentSnapshot, ComponentType } from '../../../core/entities/ComponentSnapshot'

// ===== СКАЛЯРНЫЕ ТИПЫ =====

const JSONScalar = builder.scalarType('JSON', {
  serialize: (value) => value,
  parseValue: (value) => value,
})

// ===== ЕНУМЫ =====

const ComponentTypeEnum = builder.enumType('ComponentType', {
  values: ['ARTICLE', 'TASK', 'QUIZ', 'VIDEO'] as const,
  description: 'Типы компонентов в снапшотах'
})

const DifficultyEnum = builder.enumType('Difficulty', {
  values: ['EASY', 'MEDIUM', 'HARD'] as const,
  description: 'Уровни сложности компонентов'
})

const QuizTypeEnum = builder.enumType('QuizType', {
  values: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'] as const,
  description: 'Типы квизов'
})

// ===== VALUE OBJECT ТИПЫ =====

const FlowSnapshotMetadataType = builder.objectType('FlowSnapshotMetadata', {
  description: 'Метаданные снапшота потока',
  fields: (t) => ({
    snapshotVersion: t.exposeString('snapshotVersion', {
      description: 'Версия снапшота для обратной совместимости'
    }),
    sizeBytes: t.exposeInt('sizeBytes', {
      description: 'Размер снапшота в байтах'
    }),
    creationTimeMs: t.exposeFloat('creationTimeMs', {
      description: 'Время создания снапшота в миллисекундах'
    }),
    totalSteps: t.exposeInt('totalSteps', {
      description: 'Общее количество шагов в снапшоте'
    }),
    totalComponents: t.exposeInt('totalComponents', {
      description: 'Общее количество компонентов в снапшоте'
    }),
    contentHash: t.exposeString('contentHash', {
      description: 'Хеш содержимого для проверки целостности'
    })
  })
})

const OriginalFlowReferenceType = builder.objectType('OriginalFlowReference', {
  description: 'Ссылка на оригинальный поток',
  fields: (t) => ({
    originalFlowId: t.exposeString('originalFlowId', {
      description: 'ID оригинального потока'
    }),
    originalFlowVersion: t.exposeString('originalFlowVersion', {
      description: 'Версия оригинального потока'
    }),
    originalFlowTitle: t.exposeString('originalFlowTitle', {
      description: 'Название оригинального потока'
    }),
    originalFlowDescription: t.exposeString('originalFlowDescription', {
      nullable: true,
      description: 'Описание оригинального потока'
    })
  })
})

const ComponentSnapshotMetadataType = builder.objectType('ComponentSnapshotMetadata', {
  description: 'Метаданные снапшота компонента',
  fields: (t) => ({
    snapshotVersion: t.exposeString('snapshotVersion'),
    componentType: t.field({
      type: ComponentTypeEnum,
      resolve: (metadata: any) => metadata.componentType
    }),
    contentSize: t.exposeInt('contentSize'),
    estimatedDurationMinutes: t.exposeInt('estimatedDurationMinutes', { nullable: true }),
    difficulty: t.field({
      type: DifficultyEnum,
      nullable: true,
      resolve: (metadata: any) => metadata.difficulty
    }),
    tags: t.exposeStringList('tags')
  })
})

// ===== ТИПЫ СОДЕРЖИМОГО КОМПОНЕНТОВ =====

const ArticleContentType = builder.objectType('ArticleContent', {
  description: 'Содержимое статьи',
  fields: (t) => ({
    text: t.exposeString('text', {
      description: 'Основной текст статьи'
    }),
    htmlContent: t.exposeString('htmlContent', {
      nullable: true,
      description: 'HTML разметка статьи'
    }),
    images: t.field({
      type: [ImageAttachmentType],
      resolve: (content: any) => content.images || []
    }),
    attachments: t.field({
      type: [FileAttachmentType],
      resolve: (content: any) => content.attachments || []
    }),
    externalLinks: t.field({
      type: [ExternalLinkType],
      resolve: (content: any) => content.externalLinks || []
    })
  })
})

const TaskContentType = builder.objectType('TaskContent', {
  description: 'Содержимое задания',
  fields: (t) => ({
    instruction: t.exposeString('instruction', {
      description: 'Инструкция к заданию'
    }),
    correctAnswer: t.exposeString('correctAnswer', {
      nullable: true,
      description: 'Правильный ответ (может быть скрыт от пользователя)'
    }),
    alternativeAnswers: t.exposeStringList('alternativeAnswers', {
      nullable: true,
      description: 'Альтернативные правильные ответы'
    }),
    hint: t.exposeString('hint', {
      nullable: true,
      description: 'Подсказка для пользователя'
    }),
    examples: t.exposeStringList('examples', {
      nullable: true,
      description: 'Примеры правильных ответов'
    }),
    maxAnswerLength: t.exposeInt('maxAnswerLength', {
      nullable: true,
      description: 'Максимальная длина ответа'
    }),
    validationSettings: t.field({
      type: TaskValidationSettingsType,
      nullable: true,
      resolve: (content: any) => content.validationSettings
    })
  })
})

const QuizContentType = builder.objectType('QuizContent', {
  description: 'Содержимое квиза',
  fields: (t) => ({
    question: t.exposeString('question', {
      description: 'Вопрос квиза'
    }),
    options: t.field({
      type: [QuizOptionType],
      description: 'Варианты ответов',
      resolve: (content: any) => content.options || []
    }),
    quizType: t.field({
      type: QuizTypeEnum,
      description: 'Тип квиза',
      resolve: (content: any) => content.quizType
    }),
    explanation: t.exposeString('explanation', {
      nullable: true,
      description: 'Объяснение правильного ответа'
    }),
    showResultImmediately: t.exposeBoolean('showResultImmediately', {
      nullable: true,
      description: 'Показывать результат сразу после ответа'
    }),
    shuffleOptions: t.exposeBoolean('shuffleOptions', {
      nullable: true,
      description: 'Перемешивать варианты ответов'
    })
  })
})

const VideoContentType = builder.objectType('VideoContent', {
  description: 'Содержимое видео',
  fields: (t) => ({
    videoUrl: t.exposeString('videoUrl', {
      description: 'URL видео файла'
    }),
    duration: t.exposeInt('duration', {
      nullable: true,
      description: 'Продолжительность видео в секундах'
    }),
    thumbnail: t.exposeString('thumbnail', {
      nullable: true,
      description: 'URL изображения-превью'
    }),
    subtitles: t.field({
      type: [VideoSubtitleType],
      resolve: (content: any) => content.subtitles || []
    }),
    chapters: t.field({
      type: [VideoChapterType],
      resolve: (content: any) => content.chapters || []
    }),
    requireFullWatch: t.exposeBoolean('requireFullWatch', {
      nullable: true,
      description: 'Требуется ли просмотр до конца'
    }),
    minWatchPercentage: t.exposeInt('minWatchPercentage', {
      nullable: true,
      description: 'Минимальный процент просмотра'
    })
  })
})

// ===== ВСПОМОГАТЕЛЬНЫЕ ТИПЫ =====

const ImageAttachmentType = builder.objectType('ImageAttachment', {
  fields: (t) => ({
    url: t.exposeString('url'),
    alt: t.exposeString('alt', { nullable: true }),
    caption: t.exposeString('caption', { nullable: true })
  })
})

const FileAttachmentType = builder.objectType('FileAttachment', {
  fields: (t) => ({
    url: t.exposeString('url'),
    filename: t.exposeString('filename'),
    fileType: t.exposeString('fileType'),
    size: t.exposeInt('size')
  })
})

const ExternalLinkType = builder.objectType('ExternalLink', {
  fields: (t) => ({
    url: t.exposeString('url'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true })
  })
})

const TaskValidationSettingsType = builder.objectType('TaskValidationSettings', {
  fields: (t) => ({
    caseSensitive: t.exposeBoolean('caseSensitive', { nullable: true }),
    trimWhitespace: t.exposeBoolean('trimWhitespace', { nullable: true }),
    allowPartialMatch: t.exposeBoolean('allowPartialMatch', { nullable: true }),
    regexPattern: t.exposeString('regexPattern', { nullable: true })
  })
})

const QuizOptionType = builder.objectType('QuizOption', {
  fields: (t) => ({
    id: t.exposeString('id'),
    text: t.exposeString('text'),
    isCorrect: t.exposeBoolean('isCorrect'),
    explanation: t.exposeString('explanation', { nullable: true })
  })
})

const VideoSubtitleType = builder.objectType('VideoSubtitle', {
  fields: (t) => ({
    language: t.exposeString('language'),
    url: t.exposeString('url')
  })
})

const VideoChapterType = builder.objectType('VideoChapter', {
  fields: (t) => ({
    time: t.exposeInt('time'),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true })
  })
})

// ===== UNION ТИП ДЛЯ СОДЕРЖИМОГО КОМПОНЕНТОВ =====

const ComponentContentUnion = builder.unionType('ComponentContent', {
  types: [ArticleContentType, TaskContentType, QuizContentType, VideoContentType],
  resolveType: (content: any, context: any, info: any) => {
    // Определяем тип по структуре данных
    if (content.text && (content.images !== undefined || content.attachments !== undefined)) {
      return ArticleContentType
    }
    if (content.instruction) {
      return TaskContentType
    }
    if (content.question && content.options) {
      return QuizContentType
    }
    if (content.videoUrl) {
      return VideoContentType
    }
    
    throw new Error('Неизвестный тип содержимого компонента')
  },
  description: 'Содержимое компонента различных типов'
})

// ===== ОСНОВНЫЕ ТИПЫ СНАПШОТОВ =====

const ComponentSnapshotType = builder.objectRef<ComponentSnapshot>('ComponentSnapshot').implement({
  description: 'Снапшот компонента - неизменяемая копия компонента',
  fields: (t) => ({
    id: t.exposeID('id', {
      description: 'Уникальный ID снапшота компонента'
    }),
    
    stepSnapshotId: t.exposeString('stepSnapshotId', {
      description: 'ID снапшота шага, к которому принадлежит компонент'
    }),
    
    title: t.string({
      description: 'Название компонента',
      resolve: (snapshot) => snapshot.title
    }),
    
    description: t.string({
      nullable: true,
      description: 'Описание компонента',
      resolve: (snapshot) => snapshot.description
    }),
    
    type: t.field({
      type: ComponentTypeEnum,
      description: 'Тип компонента',
      resolve: (snapshot) => snapshot.type
    }),
    
    content: t.field({
      type: ComponentContentUnion,
      description: 'Содержимое компонента',
      resolve: (snapshot) => snapshot.content
    }),
    
    metadata: t.field({
      type: ComponentSnapshotMetadataType,
      description: 'Метаданные снапшота компонента',
      resolve: (snapshot) => snapshot.metadata
    }),
    
    isRequired: t.boolean({
      description: 'Является ли компонент обязательным',
      resolve: (snapshot) => snapshot.isRequired
    }),
    
    order: t.int({
      description: 'Порядковый номер компонента в шаге',
      resolve: (snapshot) => snapshot.order
    }),
    
    maxAttempts: t.int({
      nullable: true,
      description: 'Максимальное количество попыток',
      resolve: (snapshot) => snapshot.maxAttempts
    }),
    
    estimatedDuration: t.int({
      nullable: true,
      description: 'Приблизительное время прохождения в минутах',
      resolve: (snapshot) => snapshot.estimatedDuration
    }),
    
    difficulty: t.field({
      type: DifficultyEnum,
      nullable: true,
      description: 'Уровень сложности',
      resolve: (snapshot) => snapshot.difficulty
    }),
    
    tags: t.stringList({
      description: 'Теги компонента',
      resolve: (snapshot) => snapshot.tags
    }),
    
    settings: t.field({
      type: JSONScalar,
      nullable: true,
      description: 'Дополнительные настройки компонента',
      resolve: (snapshot) => snapshot.settings
    }),
    
    createdAt: t.string({
      description: 'Дата создания снапшота',
      resolve: (snapshot) => snapshot.createdAt.toISOString()
    }),
    
    // ===== ВЫЧИСЛЯЕМЫЕ ПОЛЯ =====
    
    hasTimeLimit: t.boolean({
      description: 'Есть ли временные ограничения',
      resolve: (snapshot) => snapshot.hasTimeLimit
    }),
    
    allowsMultipleAttempts: t.boolean({
      description: 'Разрешены ли множественные попытки',
      resolve: (snapshot) => snapshot.allowsMultipleAttempts
    })
  })
})

const FlowStepSnapshotType = builder.objectRef<FlowStepSnapshot>('FlowStepSnapshot').implement({
  description: 'Снапшот шага потока - неизменяемая копия шага со всеми компонентами',
  fields: (t) => ({
    id: t.exposeID('id', {
      description: 'Уникальный ID снапшота шага'
    }),
    
    flowSnapshotId: t.exposeString('flowSnapshotId', {
      description: 'ID снапшота потока, к которому принадлежит шаг'
    }),
    
    title: t.string({
      description: 'Название шага',
      resolve: (snapshot) => snapshot.title
    }),
    
    description: t.string({
      nullable: true,
      description: 'Описание шага',
      resolve: (snapshot) => snapshot.description
    }),
    
    order: t.int({
      description: 'Порядковый номер шага в потоке',
      resolve: (snapshot) => snapshot.order
    }),
    
    componentCount: t.int({
      description: 'Количество компонентов в шаге',
      resolve: (snapshot) => snapshot.componentCount
    }),
    
    requiredComponentCount: t.int({
      description: 'Количество обязательных компонентов',
      resolve: (snapshot) => snapshot.requiredComponentCount
    }),
    
    isSkippable: t.boolean({
      description: 'Можно ли пропустить этот шаг',
      resolve: (snapshot) => snapshot.isSkippable
    }),
    
    requiresPreviousCompletion: t.boolean({
      description: 'Требуется ли завершение предыдущих шагов',
      resolve: (snapshot) => snapshot.requiresPreviousCompletion
    }),
    
    estimatedDuration: t.int({
      nullable: true,
      description: 'Приблизительное время прохождения в минутах',
      resolve: (snapshot) => snapshot.estimatedDuration
    }),
    
    hasTimeLimit: t.boolean({
      description: 'Есть ли временные ограничения на прохождение',
      resolve: (snapshot) => snapshot.hasTimeLimit
    }),
    
    createdAt: t.string({
      description: 'Дата создания снапшота',
      resolve: (snapshot) => snapshot.createdAt.toISOString()
    }),
    
    // ===== СВЯЗАННЫЕ ДАННЫЕ =====
    
    components: t.field({
      type: [ComponentSnapshotType],
      description: 'Компоненты шага',
      resolve: async (snapshot, args, context) => {
        // TODO: Загрузить компоненты через репозиторий или DataLoader
        return []
      }
    }),
    
    // ===== ВЫЧИСЛЯЕМЫЕ ПОЛЯ =====
    
    hasRequiredComponents: t.boolean({
      description: 'Содержит ли шаг обязательные компоненты',
      resolve: (snapshot) => snapshot.hasRequiredComponents
    }),
    
    hasOptionalComponents: t.boolean({
      description: 'Содержит ли шаг необязательные компоненты',
      resolve: (snapshot) => snapshot.hasOptionalComponents
    })
  })
})

const FlowSnapshotType = builder.objectRef<FlowSnapshot>('FlowSnapshot').implement({
  description: 'Снапшот потока - неизменяемая копия всего потока со всеми шагами и компонентами',
  fields: (t) => ({
    id: t.exposeID('id', {
      description: 'Уникальный ID снапшота потока'
    }),
    
    assignmentId: t.exposeString('assignmentId', {
      description: 'ID назначения, для которого создан снапшот'
    }),
    
    originalFlowReference: t.field({
      type: OriginalFlowReferenceType,
      description: 'Ссылка на оригинальный поток',
      resolve: (snapshot) => snapshot.originalFlowReference
    }),
    
    metadata: t.field({
      type: FlowSnapshotMetadataType,
      description: 'Метаданные снапшота',
      resolve: (snapshot) => snapshot.metadata
    }),
    
    stepCount: t.int({
      description: 'Количество шагов в снапшоте',
      resolve: (snapshot) => snapshot.stepCount
    }),
    
    isLarge: t.boolean({
      description: 'Является ли снапшот большим (>10MB)',
      resolve: (snapshot) => snapshot.isLarge
    }),
    
    isRecent: t.boolean({
      description: 'Является ли снапшот недавно созданным (<1 недели)',
      resolve: (snapshot) => snapshot.isRecent
    }),
    
    context: t.field({
      type: JSONScalar,
      nullable: true,
      description: 'Дополнительный контекст снапшота',
      resolve: (snapshot) => snapshot.context
    }),
    
    createdBy: t.exposeString('createdBy', {
      description: 'ID пользователя, создавшего снапшот'
    }),
    
    createdAt: t.string({
      description: 'Дата создания снапшота',
      resolve: (snapshot) => snapshot.createdAt.toISOString()
    }),
    
    updatedAt: t.string({
      description: 'Дата последнего обновления',
      resolve: (snapshot) => snapshot.updatedAt.toISOString()
    }),
    
    // ===== СВЯЗАННЫЕ ДАННЫЕ =====
    
    steps: t.field({
      type: [FlowStepSnapshotType],
      description: 'Шаги снапшота потока',
      resolve: async (snapshot, args, context) => {
        // TODO: Загрузить шаги через репозиторий или DataLoader
        return []
      }
    }),
    
    assignment: t.field({
      type: 'FlowAssignment', // Ссылка на существующий тип
      description: 'Назначение, для которого создан снапшот',
      resolve: async (snapshot, args, context) => {
        // TODO: Загрузить назначение через репозиторий
        return null
      }
    }),
    
    // ===== НАВИГАЦИОННЫЕ МЕТОДЫ =====
    
    firstStepId: t.string({
      nullable: true,
      description: 'ID первого шага для навигации',
      resolve: (snapshot) => snapshot.getFirstStepId()
    }),
    
    lastStepId: t.string({
      nullable: true,
      description: 'ID последнего шага',
      resolve: (snapshot) => snapshot.getLastStepId()
    })
  })
})

// ===== INPUT ТИПЫ ДЛЯ МУТАЦИЙ =====

const ComponentSnapshotFilterInput = builder.inputType('ComponentSnapshotFilter', {
  fields: (t) => ({
    type: t.field({ type: ComponentTypeEnum, required: false }),
    isRequired: t.boolean({ required: false }),
    difficulty: t.field({ type: DifficultyEnum, required: false }),
    tags: t.stringList({ required: false })
  })
})

const FlowSnapshotFilterInput = builder.inputType('FlowSnapshotFilter', {
  fields: (t) => ({
    assignmentId: t.string({ required: false }),
    originalFlowId: t.string({ required: false }),
    createdBy: t.string({ required: false }),
    snapshotVersion: t.string({ required: false }),
    sizeRange: t.field({
      type: builder.inputType('SizeRange', {
        fields: (t) => ({
          min: t.int({ required: false }),
          max: t.int({ required: false })
        })
      }),
      required: false
    }),
    createdDateRange: t.field({
      type: builder.inputType('DateRange', {
        fields: (t) => ({
          from: t.string({ required: false }), // ISO date string
          to: t.string({ required: false })
        })
      }),
      required: false
    })
  })
})

// ===== ЭКСПОРТ =====

export {
  FlowSnapshotType,
  FlowStepSnapshotType,
  ComponentSnapshotType,
  ComponentContentUnion,
  FlowSnapshotFilterInput,
  ComponentSnapshotFilterInput,
  ComponentTypeEnum,
  DifficultyEnum,
  QuizTypeEnum
}