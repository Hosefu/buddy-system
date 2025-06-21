/**
 * GraphQL типы для компонентов обучения
 * 
 * Файл: packages/api/src/schema/types/component/component.type.ts
 * 
 * Определяет структуру данных для различных типов компонентов:
 * статей, заданий, квизов и их снапшотов.
 * 
 * Типы:
 * - Component: Базовый тип компонента
 * - ComponentSnapshot: Снапшот компонента
 * - ArticleComponent, TaskComponent, QuizComponent: Специфичные типы
 * - ComponentProgress: Прогресс по компоненту
 */

import { builder } from '../../index'

/**
 * Енумы для компонентов
 */
builder.enumType('ComponentType', {
  description: 'Типы компонентов в системе обучения',
  values: {
    ARTICLE: {
      value: 'ARTICLE',
      description: 'Статья для чтения'
    },
    TASK: {
      value: 'TASK',
      description: 'Практическое задание'
    },
    QUIZ: {
      value: 'QUIZ',
      description: 'Тест с вопросами'
    },
    VIDEO: {
      value: 'VIDEO',
      description: 'Видеоматериал'
    },
    INTERACTIVE: {
      value: 'INTERACTIVE',
      description: 'Интерактивный контент'
    }
  }
})

builder.enumType('ComponentStatus', {
  description: 'Статусы прогресса компонента',
  values: {
    NOT_STARTED: {
      value: 'NOT_STARTED',
      description: 'Не начат'
    },
    IN_PROGRESS: {
      value: 'IN_PROGRESS',
      description: 'В процессе'
    },
    COMPLETED: {
      value: 'COMPLETED',
      description: 'Завершен'
    },
    FAILED: {
      value: 'FAILED',
      description: 'Не пройден'
    },
    SKIPPED: {
      value: 'SKIPPED',
      description: 'Пропущен'
    }
  }
})

/**
 * Базовый интерфейс для всех компонентов
 */
builder.interfaceType('ComponentSnapshot', {
  description: 'Базовый интерфейс для снапшотов компонентов',
  fields: (t) => ({
    id: t.id({
      description: 'ID снапшота компонента'
    }),
    type: t.field({
      type: 'ComponentType',
      description: 'Тип компонента'
    }),
    typeVersion: t.string({
      description: 'Версия типа компонента'
    }),
    order: t.int({
      description: 'Порядковый номер в шаге'
    }),
    isRequired: t.boolean({
      description: 'Обязателен ли компонент для завершения'
    }),
    userProgress: t.field({
      type: 'ComponentProgress',
      nullable: true,
      description: 'Прогресс пользователя по этому компоненту'
    }),
    stepSnapshot: t.field({
      type: 'FlowStepSnapshot',
      description: 'Шаг, к которому принадлежит компонент'
    }),
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата создания снапшота'
    })
  }),
  resolveType: (component) => {
    // Определяем конкретный тип на основе поля type
    switch (component.type) {
      case 'ARTICLE':
        return 'ArticleComponent'
      case 'TASK':
        return 'TaskComponent'
      case 'QUIZ':
        return 'QuizComponent'
      case 'VIDEO':
        return 'VideoComponent'
      case 'INTERACTIVE':
        return 'InteractiveComponent'
      default:
        throw new Error(`Неизвестный тип компонента: ${component.type}`)
    }
  }
})

/**
 * Компонент-статья
 */
builder.objectType('ArticleComponent', {
  description: 'Компонент-статья для чтения',
  interfaces: ['ComponentSnapshot'],
  fields: (t) => ({
    // Базовые поля из interface
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    typeVersion: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    userProgress: t.field({ 
      type: 'ComponentProgress', 
      nullable: true,
      resolve: async (component, _, context) => {
        const currentUser = context.user
        if (!currentUser) return null
        
        const progress = await context.prisma.componentProgress.findFirst({
          where: {
            componentSnapshotId: component.id,
            userId: currentUser.id
          }
        })
        return progress
      }
    }),
    stepSnapshot: t.field({ 
      type: 'FlowStepSnapshot',
      resolve: async (component, _, context) => {
        const stepSnapshot = await context.prisma.flowStepSnapshot.findUnique({
          where: { id: component.stepSnapshotId }
        })
        return stepSnapshot
      }
    }),
    createdAt: t.field({ type: 'DateTime' }),
    
    // Специфичные поля для статьи
    title: t.string({
      description: 'Заголовок статьи'
    }),
    content: t.string({
      description: 'Содержимое статьи в формате HTML/Markdown'
    }),
    summary: t.string({
      nullable: true,
      description: 'Краткое изложение статьи'
    }),
    estimatedReadTime: t.int({
      nullable: true,
      description: 'Примерное время чтения (в минутах)'
    }),
    attachments: t.field({
      type: ['Attachment'],
      description: 'Прикрепленные файлы',
      resolve: async (component, _, context) => {
        const attachments = await context.prisma.attachment.findMany({
          where: { componentSnapshotId: component.id }
        })
        return attachments
      }
    })
  })
})

/**
 * Компонент-задание
 */
builder.objectType('TaskComponent', {
  description: 'Компонент-задание с проверкой по кодовому слову',
  interfaces: ['ComponentSnapshot'],
  fields: (t) => ({
    // Базовые поля из interface
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    typeVersion: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    userProgress: t.field({ 
      type: 'ComponentProgress', 
      nullable: true,
      resolve: async (component, _, context) => {
        const currentUser = context.user
        if (!currentUser) return null
        
        const progress = await context.prisma.componentProgress.findFirst({
          where: {
            componentSnapshotId: component.id,
            userId: currentUser.id
          }
        })
        return progress
      }
    }),
    stepSnapshot: t.field({ 
      type: 'FlowStepSnapshot',
      resolve: async (component, _, context) => {
        const stepSnapshot = await context.prisma.flowStepSnapshot.findUnique({
          where: { id: component.stepSnapshotId }
        })
        return stepSnapshot
      }
    }),
    createdAt: t.field({ type: 'DateTime' }),
    
    // Специфичные поля для задания
    title: t.string({
      description: 'Название задания'
    }),
    description: t.string({
      description: 'Описание задания'
    }),
    instruction: t.string({
      description: 'Подробная инструкция по выполнению'
    }),
    hint: t.string({
      nullable: true,
      description: 'Подсказка для выполнения'
    }),
    maxAttempts: t.int({
      nullable: true,
      description: 'Максимальное количество попыток'
    }),
    
    // Кодовое слово НЕ показываем в GraphQL по соображениям безопасности
    // codeWord остается скрытым
    
    attachments: t.field({
      type: ['Attachment'],
      description: 'Материалы к заданию',
      resolve: async (component, _, context) => {
        const attachments = await context.prisma.attachment.findMany({
          where: { componentSnapshotId: component.id }
        })
        return attachments
      }
    })
  })
})

/**
 * Компонент-квиз
 */
builder.objectType('QuizComponent', {
  description: 'Компонент-квиз с вопросами и ответами',
  interfaces: ['ComponentSnapshot'],
  fields: (t) => ({
    // Базовые поля из interface
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    typeVersion: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    userProgress: t.field({ 
      type: 'ComponentProgress', 
      nullable: true,
      resolve: async (component, _, context) => {
        const currentUser = context.user
        if (!currentUser) return null
        
        const progress = await context.prisma.componentProgress.findFirst({
          where: {
            componentSnapshotId: component.id,
            userId: currentUser.id
          }
        })
        return progress
      }
    }),
    stepSnapshot: t.field({ 
      type: 'FlowStepSnapshot',
      resolve: async (component, _, context) => {
        const stepSnapshot = await context.prisma.flowStepSnapshot.findUnique({
          where: { id: component.stepSnapshotId }
        })
        return stepSnapshot
      }
    }),
    createdAt: t.field({ type: 'DateTime' }),
    
    // Специфичные поля для квиза
    title: t.string({
      description: 'Название квиза'
    }),
    questions: t.field({
      type: ['QuizQuestion'],
      description: 'Вопросы квиза',
      resolve: async (component, _, context) => {
        const questions = await context.prisma.quizQuestion.findMany({
          where: { componentSnapshotId: component.id },
          orderBy: { order: 'asc' },
          include: {
            options: {
              orderBy: { order: 'asc' }
            }
          }
        })
        return questions
      }
    }),
    passingScore: t.int({
      nullable: true,
      description: 'Минимальный балл для прохождения'
    }),
    timeLimit: t.int({
      nullable: true,
      description: 'Ограничение по времени (в минутах)'
    }),
    allowRetakes: t.boolean({
      description: 'Разрешены ли повторные попытки'
    }),
    showCorrectAnswers: t.boolean({
      description: 'Показывать ли правильные ответы после завершения'
    })
  })
})

/**
 * Вопрос квиза
 */
builder.objectType('QuizQuestion', {
  description: 'Вопрос в квизе',
  fields: (t) => ({
    id: t.id({
      description: 'ID вопроса'
    }),
    order: t.int({
      description: 'Порядковый номер вопроса'
    }),
    type: t.field({
      type: 'QuestionType',
      description: 'Тип вопроса'
    }),
    text: t.string({
      description: 'Текст вопроса'
    }),
    explanation: t.string({
      nullable: true,
      description: 'Объяснение правильного ответа'
    }),
    points: t.int({
      description: 'Количество баллов за правильный ответ'
    }),
    options: t.field({
      type: ['QuizOption'],
      description: 'Варианты ответов',
      resolve: async (question, _, context) => {
        const options = await context.prisma.quizOption.findMany({
          where: { questionId: question.id },
          orderBy: { order: 'asc' }
        })
        return options
      }
    })
  })
})

/**
 * Вариант ответа в квизе
 */
builder.objectType('QuizOption', {
  description: 'Вариант ответа на вопрос квиза',
  fields: (t) => ({
    id: t.id({
      description: 'ID варианта ответа'
    }),
    order: t.int({
      description: 'Порядковый номер варианта'
    }),
    text: t.string({
      description: 'Текст варианта ответа'
    }),
    // isCorrect НЕ показываем в GraphQL по соображениям безопасности
    // Правильность ответа определяется только на сервере
  })
})

/**
 * Типы вопросов
 */
builder.enumType('QuestionType', {
  description: 'Типы вопросов в квизе',
  values: {
    SINGLE_CHOICE: {
      value: 'SINGLE_CHOICE',
      description: 'Одиночный выбор'
    },
    MULTIPLE_CHOICE: {
      value: 'MULTIPLE_CHOICE',
      description: 'Множественный выбор'
    },
    TRUE_FALSE: {
      value: 'TRUE_FALSE',
      description: 'Правда/Ложь'
    },
    TEXT_INPUT: {
      value: 'TEXT_INPUT',
      description: 'Текстовый ввод'
    }
  }
})

/**
 * Прогресс пользователя по компоненту
 */
builder.objectType('ComponentProgress', {
  description: 'Прогресс пользователя по конкретному компоненту',
  fields: (t) => ({
    id: t.id({
      description: 'ID записи прогресса'
    }),
    
    // Связи
    userId: t.id({
      description: 'ID пользователя'
    }),
    assignmentId: t.id({
      description: 'ID назначения'
    }),
    componentSnapshotId: t.id({
      description: 'ID снапшота компонента'
    }),
    
    // Статус
    status: t.field({
      type: 'ComponentStatus',
      description: 'Текущий статус прохождения'
    }),
    
    // Прогресс
    attempts: t.int({
      description: 'Количество попыток'
    }),
    score: t.int({
      nullable: true,
      description: 'Набранный балл (для квизов)'
    }),
    maxScore: t.int({
      nullable: true,
      description: 'Максимально возможный балл'
    }),
    timeSpent: t.int({
      description: 'Время, потраченное на компонент (в секундах)'
    }),
    
    // Временные метки
    startedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время начала работы с компонентом'
    }),
    completedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время завершения компонента'
    }),
    lastInteractionAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время последнего взаимодействия'
    }),
    
    // Дополнительные данные
    data: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Дополнительные данные прогресса (ответы, заметки и т.д.)'
    }),
    
    // Вычисляемые поля
    isCompleted: t.boolean({
      description: 'Завершен ли компонент',
      resolve: (progress) => progress.status === 'COMPLETED'
    }),
    scorePercentage: t.float({
      nullable: true,
      description: 'Процент от максимального балла',
      resolve: (progress) => {
        if (!progress.score || !progress.maxScore) return null
        return (progress.score / progress.maxScore) * 100
      }
    }),
    
    // Временные метки
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата создания записи'
    }),
    updatedAt: t.field({
      type: 'DateTime',
      description: 'Дата последнего обновления'
    })
  })
})

/**
 * Прикрепленные файлы
 */
builder.objectType('Attachment', {
  description: 'Файл, прикрепленный к компоненту',
  fields: (t) => ({
    id: t.id({
      description: 'ID файла'
    }),
    filename: t.string({
      description: 'Имя файла'
    }),
    url: t.string({
      description: 'URL для скачивания файла'
    }),
    mimeType: t.string({
      description: 'MIME тип файла'
    }),
    size: t.int({
      description: 'Размер файла в байтах'
    }),
    description: t.string({
      nullable: true,
      description: 'Описание файла'
    }),
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата загрузки файла'
    })
  })
})

/**
 * Дополнительные типы компонентов (заглушки для будущего расширения)
 */
builder.objectType('VideoComponent', {
  description: 'Видео компонент (будет реализован позже)',
  interfaces: ['ComponentSnapshot'],
  fields: (t) => ({
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    typeVersion: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    userProgress: t.field({ type: 'ComponentProgress', nullable: true }),
    stepSnapshot: t.field({ type: 'FlowStepSnapshot' }),
    createdAt: t.field({ type: 'DateTime' }),
    
    title: t.string({ description: 'Название видео' }),
    videoUrl: t.string({ description: 'URL видео' }),
    duration: t.int({ nullable: true, description: 'Длительность в секундах' })
  })
})

builder.objectType('InteractiveComponent', {
  description: 'Интерактивный компонент (будет реализован позже)',
  interfaces: ['ComponentSnapshot'],
  fields: (t) => ({
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    typeVersion: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    userProgress: t.field({ type: 'ComponentProgress', nullable: true }),
    stepSnapshot: t.field({ type: 'FlowStepSnapshot' }),
    createdAt: t.field({ type: 'DateTime' }),
    
    title: t.string({ description: 'Название интерактивного элемента' }),
    interactiveData: t.field({ 
      type: 'JSON', 
      description: 'Данные интерактивного элемента' 
    })
  })
})

export {}