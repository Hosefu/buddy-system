/**
 * GraphQL типы для системы прогресса
 * 
 * Определяет типы для отслеживания прогресса пользователей по компонентам,
 * шагам и потокам. Включает детализированные данные прогресса для разных
 * типов компонентов и аналитику.
 */

import { builder } from '../../index'

// ===== ПЕРЕЧИСЛЕНИЯ =====

/**
 * Статусы прогресса компонента
 */
builder.enumType('ComponentProgressStatus', {
  description: 'Статус прохождения компонента',
  values: {
    NOT_STARTED: { description: 'Компонент не начат' },
    IN_PROGRESS: { description: 'Компонент в процессе прохождения' },
    COMPLETED: { description: 'Компонент успешно завершен' },
    FAILED: { description: 'Компонент провален' },
    SKIPPED: { description: 'Компонент пропущен' }
  }
})

/**
 * Типы действий с компонентами
 */
builder.enumType('ComponentAction', {
  description: 'Тип взаимодействия с компонентом',
  values: {
    START_READING: { description: 'Начать чтение статьи' },
    FINISH_READING: { description: 'Завершить чтение статьи' },
    SUBMIT_ANSWER: { description: 'Отправить ответ на задание' },
    SUBMIT_QUIZ_ANSWER: { description: 'Отправить ответ на вопрос квиза' },
    START_VIDEO: { description: 'Начать просмотр видео' },
    UPDATE_VIDEO_PROGRESS: { description: 'Обновить прогресс видео' },
    FINISH_VIDEO: { description: 'Завершить просмотр видео' }
  }
})

// ===== СКАЛЯРНЫЕ ТИПЫ =====

/**
 * Типизированные данные прогресса
 */
builder.scalarType('ProgressData', {
  description: 'JSON данные прогресса (структура зависит от типа компонента)',
  serialize: (value) => value,
  parseValue: (value) => value,
})

// ===== ОСНОВНЫЕ ТИПЫ ПРОГРЕССА =====

/**
 * Прогресс пользователя по компоненту
 */
builder.objectType('ComponentProgress', {
  description: 'Прогресс пользователя по конкретному компоненту',
  fields: (t) => ({
    id: t.id({
      description: 'Уникальный идентификатор записи прогресса'
    }),
    userId: t.id({
      description: 'ID пользователя'
    }),
    assignmentId: t.id({
      description: 'ID назначения потока'
    }),
    componentSnapshotId: t.id({
      description: 'ID снапшота компонента'
    }),
    status: t.field({
      type: 'ComponentProgressStatus',
      description: 'Статус прохождения компонента'
    }),
    componentType: t.field({
      type: 'ComponentType',
      description: 'Тип компонента'
    }),
    progressData: t.field({
      type: 'ProgressData',
      description: 'Детализированные данные прогресса'
    }),
    
    // Временные метки
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата создания записи прогресса'
    }),
    updatedAt: t.field({
      type: 'DateTime',
      description: 'Дата последнего обновления'
    }),
    startedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Дата начала прохождения компонента'
    }),
    completedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Дата завершения компонента'
    }),
    
    // Вычисляемые поля
    completionPercentage: t.int({
      description: 'Процент завершения компонента (0-100)',
      resolve: async (progress, _, context) => {
        // Здесь должна быть логика вычисления процента в зависимости от типа компонента
        switch (progress.componentType) {
          case 'ARTICLE':
            const articleData = progress.progressData as any
            return articleData?.reachedEnd ? 100 : Math.round((articleData?.scrollProgress || 0) * 100)
          
          case 'TASK':
            const taskData = progress.progressData as any
            return taskData?.isCorrect ? 100 : 0
          
          case 'QUIZ':
            const quizData = progress.progressData as any
            return quizData?.passed ? 100 : (quizData?.bestScore || 0)
          
          case 'VIDEO':
            const videoData = progress.progressData as any
            return Math.round(videoData?.watchedPercentage || 0)
          
          default:
            return 0
        }
      }
    }),
    
    totalTimeSpent: t.int({
      description: 'Общее время, потраченное на компонент (в секундах)',
      resolve: async (progress, _, context) => {
        const data = progress.progressData as any
        
        switch (progress.componentType) {
          case 'ARTICLE':
            return data?.totalReadTime || 0
          
          case 'TASK':
            return data?.attemptHistory?.reduce((sum: number, attempt: any) => 
              sum + (attempt.timeSpentSeconds || 0), 0) || 0
          
          case 'QUIZ':
            return data?.attemptHistory?.reduce((sum: number, attempt: any) => 
              sum + (attempt.timeSpentSeconds || 0), 0) || 0
          
          case 'VIDEO':
            return data?.totalWatchTime || 0
          
          default:
            return 0
        }
      }
    }),
    
    attemptCount: t.int({
      description: 'Количество попыток прохождения',
      resolve: async (progress, _, context) => {
        const data = progress.progressData as any
        
        switch (progress.componentType) {
          case 'TASK':
          case 'QUIZ':
            return data?.attempts || 0
          default:
            return 1
        }
      }
    }),
    
    // Связанные данные
    componentSnapshot: t.field({
      type: 'ComponentSnapshot',
      description: 'Снапшот компонента',
      resolve: async (progress, _, context) => {
        const componentSnapshot = await context.prisma.componentSnapshot.findUnique({
          where: { id: progress.componentSnapshotId }
        })
        return componentSnapshot
      }
    }),
    
    user: t.field({
      type: 'User',
      description: 'Пользователь',
      resolve: async (progress, _, context) => {
        const user = await context.prisma.user.findUnique({
          where: { id: progress.userId }
        })
        return user
      }
    }),
    
    // Метаданные
    version: t.string({
      description: 'Версия схемы прогресса'
    }),
    platform: t.string({
      nullable: true,
      description: 'Платформа, с которой проходится компонент'
    })
  })
})

/**
 * Сводная информация о прогрессе пользователя
 */
builder.objectType('ProgressSummary', {
  description: 'Сводная информация о прогрессе пользователя по назначению',
  fields: (t) => ({
    assignmentId: t.id({
      description: 'ID назначения'
    }),
    userId: t.id({
      description: 'ID пользователя'
    }),
    flowProgress: t.int({
      description: 'Общий прогресс по потоку (0-100)'
    }),
    
    // Прогресс по шагам
    stepProgress: t.field({
      type: ['StepProgressSummary'],
      description: 'Прогресс по каждому шагу'
    }),
    
    // Прогресс по компонентам
    componentProgress: t.field({
      type: ['ComponentProgressSummary'],
      description: 'Прогресс по компонентам'
    }),
    
    // Разблокированные элементы
    unlockedStepIds: t.idList({
      description: 'ID разблокированных шагов'
    }),
    
    nextComponent: t.field({
      type: 'NextComponentInfo',
      nullable: true,
      description: 'Следующий доступный компонент'
    }),
    
    // Статистика
    stats: t.field({
      type: 'ProgressStats',
      description: 'Общая статистика прогресса'
    }),
    
    // Временные метки
    lastActivity: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время последней активности'
    }),
    
    startedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время начала прохождения потока'
    })
  })
})

/**
 * Прогресс по шагу (краткая информация)
 */
builder.objectType('StepProgressSummary', {
  description: 'Краткая информация о прогрессе по шагу',
  fields: (t) => ({
    stepSnapshotId: t.id({
      description: 'ID снапшота шага'
    }),
    stepTitle: t.string({
      description: 'Название шага'
    }),
    stepOrder: t.int({
      description: 'Порядковый номер шага'
    }),
    progress: t.int({
      description: 'Процент завершения шага (0-100)'
    }),
    status: t.string({
      description: 'Статус шага: LOCKED, AVAILABLE, IN_PROGRESS, COMPLETED'
    }),
    componentCount: t.int({
      description: 'Общее количество компонентов в шаге'
    }),
    completedComponents: t.int({
      description: 'Количество завершенных компонентов'
    }),
    estimatedDuration: t.int({
      nullable: true,
      description: 'Примерное время прохождения шага (в минутах)'
    })
  })
})

/**
 * Прогресс по компоненту (краткая информация)
 */
builder.objectType('ComponentProgressSummary', {
  description: 'Краткая информация о прогрессе по компоненту',
  fields: (t) => ({
    componentSnapshotId: t.id({
      description: 'ID снапшота компонента'
    }),
    componentTitle: t.string({
      description: 'Название компонента'
    }),
    componentType: t.field({
      type: 'ComponentType',
      description: 'Тип компонента'
    }),
    progress: t.int({
      description: 'Процент завершения компонента (0-100)'
    }),
    status: t.field({
      type: 'ComponentProgressStatus',
      description: 'Статус прохождения компонента'
    }),
    timeSpent: t.int({
      description: 'Время, потраченное на компонент (в секундах)'
    }),
    attempts: t.int({
      description: 'Количество попыток'
    }),
    isRequired: t.boolean({
      description: 'Является ли компонент обязательным'
    })
  })
})

/**
 * Информация о следующем доступном компоненте
 */
builder.objectType('NextComponentInfo', {
  description: 'Информация о следующем доступном компоненте',
  fields: (t) => ({
    componentSnapshotId: t.id({
      description: 'ID снапшота компонента'
    }),
    stepSnapshotId: t.id({
      description: 'ID снапшота шага'
    }),
    title: t.string({
      description: 'Название компонента'
    }),
    type: t.field({
      type: 'ComponentType',
      description: 'Тип компонента'
    }),
    estimatedDuration: t.int({
      nullable: true,
      description: 'Примерное время прохождения (в минутах)'
    }),
    isRequired: t.boolean({
      description: 'Является ли компонент обязательным'
    })
  })
})

/**
 * Статистика прогресса
 */
builder.objectType('ProgressStats', {
  description: 'Статистика прогресса пользователя',
  fields: (t) => ({
    totalTimeSpent: t.int({
      description: 'Общее время обучения (в секундах)'
    }),
    totalAttempts: t.int({
      description: 'Общее количество попыток'
    }),
    completedComponents: t.int({
      description: 'Количество завершенных компонентов'
    }),
    totalComponents: t.int({
      description: 'Общее количество компонентов'
    }),
    completedSteps: t.int({
      description: 'Количество завершенных шагов'
    }),
    totalSteps: t.int({
      description: 'Общее количество шагов'
    }),
    averageTimePerComponent: t.int({
      description: 'Среднее время на компонент (в секундах)'
    }),
    completionRate: t.float({
      description: 'Процент завершения потока (0.0-1.0)'
    })
  })
})

// ===== ТИПЫ ДЛЯ СПЕЦИАЛИЗИРОВАННЫХ ДАННЫХ ПРОГРЕССА =====

/**
 * Прогресс чтения статьи
 */
builder.objectType('ArticleProgressData', {
  description: 'Детализированный прогресс чтения статьи',
  fields: (t) => ({
    totalReadTime: t.int({
      description: 'Общее время чтения (в секундах)'
    }),
    scrollProgress: t.float({
      description: 'Прогресс прокрутки (0.0-1.0)'
    }),
    reachedEnd: t.boolean({
      description: 'Достигнут ли конец статьи'
    }),
    readingSessions: t.field({
      type: ['ReadingSession'],
      description: 'Сессии чтения'
    })
  })
})

/**
 * Сессия чтения
 */
builder.objectType('ReadingSession', {
  description: 'Отдельная сессия чтения статьи',
  fields: (t) => ({
    startedAt: t.field({
      type: 'DateTime',
      description: 'Время начала сессии'
    }),
    endedAt: t.field({
      type: 'DateTime',
      description: 'Время окончания сессии'
    }),
    durationSeconds: t.int({
      description: 'Длительность сессии (в секундах)'
    }),
    scrollReached: t.float({
      description: 'Максимальная прокрутка в этой сессии (0.0-1.0)'
    })
  })
})

/**
 * Прогресс выполнения задания
 */
builder.objectType('TaskProgressData', {
  description: 'Детализированный прогресс выполнения задания',
  fields: (t) => ({
    attempts: t.int({
      description: 'Количество попыток'
    }),
    lastAnswer: t.string({
      nullable: true,
      description: 'Последний отправленный ответ'
    }),
    isCorrect: t.boolean({
      description: 'Правильный ли последний ответ'
    }),
    attemptHistory: t.field({
      type: ['TaskAttempt'],
      description: 'История всех попыток'
    }),
    firstAttemptAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время первой попытки'
    }),
    solvedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время правильного ответа'
    }),
    hintUsed: t.boolean({
      description: 'Использовалась ли подсказка'
    })
  })
})

/**
 * Попытка выполнения задания
 */
builder.objectType('TaskAttempt', {
  description: 'Отдельная попытка выполнения задания',
  fields: (t) => ({
    attemptNumber: t.int({
      description: 'Номер попытки'
    }),
    answer: t.string({
      description: 'Отправленный ответ'
    }),
    isCorrect: t.boolean({
      description: 'Правильность ответа'
    }),
    submittedAt: t.field({
      type: 'DateTime',
      description: 'Время отправки ответа'
    }),
    timeSpentSeconds: t.int({
      description: 'Время, потраченное на попытку (в секундах)'
    })
  })
})

/**
 * Прогресс прохождения квиза
 */
builder.objectType('QuizProgressData', {
  description: 'Детализированный прогресс прохождения квиза',
  fields: (t) => ({
    attempts: t.int({
      description: 'Количество попыток прохождения'
    }),
    bestScore: t.int({
      description: 'Лучший результат (процент правильных ответов)'
    }),
    currentScore: t.int({
      description: 'Текущий результат'
    }),
    passed: t.boolean({
      description: 'Пройден ли квиз (достигнут ли проходной балл)'
    }),
    attemptHistory: t.field({
      type: ['QuizAttempt'],
      description: 'История попыток прохождения'
    }),
    currentAttemptStartedAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время начала текущей попытки'
    })
  })
})

/**
 * Попытка прохождения квиза
 */
builder.objectType('QuizAttempt', {
  description: 'Отдельная попытка прохождения квиза',
  fields: (t) => ({
    attemptNumber: t.int({
      description: 'Номер попытки'
    }),
    score: t.int({
      description: 'Результат (процент правильных ответов)'
    }),
    correctAnswers: t.int({
      description: 'Количество правильных ответов'
    }),
    totalQuestions: t.int({
      description: 'Общее количество вопросов'
    }),
    timeSpentSeconds: t.int({
      description: 'Время прохождения (в секундах)'
    }),
    startedAt: t.field({
      type: 'DateTime',
      description: 'Время начала попытки'
    }),
    completedAt: t.field({
      type: 'DateTime',
      description: 'Время завершения попытки'
    })
  })
})

/**
 * Прогресс просмотра видео
 */
builder.objectType('VideoProgressData', {
  description: 'Детализированный прогресс просмотра видео',
  fields: (t) => ({
    totalWatchTime: t.int({
      description: 'Общее время просмотра (в секундах)'
    }),
    maxPosition: t.int({
      description: 'Максимальная достигнутая позиция (в секундах)'
    }),
    currentPosition: t.int({
      description: 'Текущая позиция воспроизведения (в секундах)'
    }),
    watchedPercentage: t.float({
      description: 'Процент просмотренного видео (0.0-100.0)'
    }),
    fullyWatched: t.boolean({
      description: 'Полностью ли просмотрено видео'
    }),
    watchSessions: t.field({
      type: ['VideoWatchSession'],
      description: 'Сессии просмотра'
    }),
    playbackSpeed: t.float({
      description: 'Скорость воспроизведения'
    })
  })
})

/**
 * Сессия просмотра видео
 */
builder.objectType('VideoWatchSession', {
  description: 'Отдельная сессия просмотра видео',
  fields: (t) => ({
    startedAt: t.field({
      type: 'DateTime',
      description: 'Время начала сессии'
    }),
    endedAt: t.field({
      type: 'DateTime',
      description: 'Время окончания сессии'
    }),
    startPosition: t.int({
      description: 'Начальная позиция в видео (в секундах)'
    }),
    endPosition: t.int({
      description: 'Конечная позиция в видео (в секундах)'
    }),
    durationSeconds: t.int({
      description: 'Длительность сессии (в секундах)'
    })
  })
})

// ===== РЕЗУЛЬТАТЫ ОПЕРАЦИЙ =====

/**
 * Результат обновления прогресса
 */
builder.objectType('ProgressUpdateResult', {
  description: 'Результат обновления прогресса компонента',
  fields: (t) => ({
    success: t.boolean({
      description: 'Успешность операции'
    }),
    message: t.string({
      nullable: true,
      description: 'Сообщение для пользователя'
    }),
    componentProgress: t.field({
      type: 'ComponentProgress',
      nullable: true,
      description: 'Обновленный прогресс компонента'
    }),
    unlockResult: t.field({
      type: 'UnlockResult',
      nullable: true,
      description: 'Информация о разблокированных элементах'
    }),
    nextActions: t.stringList({
      description: 'Рекомендуемые следующие действия'
    }),
    errors: t.stringList({
      description: 'Ошибки, если есть'
    })
  })
})

/**
 * Результат разблокировки новых элементов
 */
builder.objectType('UnlockResult', {
  description: 'Результат проверки разблокировки новых элементов',
  fields: (t) => ({
    hasNewUnlocks: t.boolean({
      description: 'Были ли разблокированы новые элементы'
    }),
    newUnlockedStepIds: t.idList({
      description: 'ID новых разблокированных шагов'
    }),
    newUnlockedComponentIds: t.idList({
      description: 'ID новых разблокированных компонентов'
    }),
    unlockedSteps: t.field({
      type: ['FlowStepSnapshot'],
      description: 'Разблокированные шаги (полная информация)',
      resolve: async (unlockResult, _, context) => {
        if (!unlockResult.newUnlockedStepIds?.length) return []
        
        const steps = await context.prisma.flowStepSnapshot.findMany({
          where: { id: { in: unlockResult.newUnlockedStepIds } }
        })
        return steps
      }
    }),
    messages: t.stringList({
      description: 'Сообщения для пользователя о разблокировке'
    })
  })
})

// ===== АНАЛИТИКА ПРОГРЕССА =====

/**
 * Аналитика прогресса пользователя
 */
builder.objectType('ProgressAnalytics', {
  description: 'Детальная аналитика прогресса пользователя',
  fields: (t) => ({
    userId: t.id({
      description: 'ID пользователя'
    }),
    assignmentId: t.id({
      description: 'ID назначения'
    }),
    averageTimePerComponent: t.int({
      description: 'Среднее время на компонент (в секундах)'
    }),
    totalLearningTime: t.int({
      description: 'Общее время обучения (в секундах)'
    }),
    completionRate: t.float({
      description: 'Процент завершения потока (0.0-1.0)'
    }),
    strugglingComponents: t.field({
      type: ['StrugglingComponentInfo'],
      description: 'Компоненты, вызывающие затруднения'
    }),
    dailyActivity: t.field({
      type: ['DailyActivityInfo'],
      description: 'Активность по дням'
    }),
    learningPattern: t.field({
      type: 'LearningPattern',
      nullable: true,
      description: 'Паттерн обучения пользователя'
    })
  })
})

/**
 * Информация о проблемном компоненте
 */
builder.objectType('StrugglingComponentInfo', {
  description: 'Информация о компоненте, вызывающем затруднения',
  fields: (t) => ({
    componentSnapshotId: t.id({
      description: 'ID снапшота компонента'
    }),
    componentTitle: t.string({
      description: 'Название компонента'
    }),
    componentType: t.field({
      type: 'ComponentType',
      description: 'Тип компонента'
    }),
    attempts: t.int({
      description: 'Количество попыток'
    }),
    timeSpent: t.int({
      description: 'Время, потраченное на компонент (в секундах)'
    }),
    status: t.field({
      type: 'ComponentProgressStatus',
      description: 'Текущий статус компонента'
    }),
    difficultyScore: t.float({
      description: 'Оценка сложности для пользователя (0.0-1.0)'
    })
  })
})

/**
 * Информация о дневной активности
 */
builder.objectType('DailyActivityInfo', {
  description: 'Информация об активности пользователя за день',
  fields: (t) => ({
    date: t.string({
      description: 'Дата (YYYY-MM-DD)'
    }),
    componentsCompleted: t.int({
      description: 'Количество завершенных компонентов'
    }),
    timeSpent: t.int({
      description: 'Время обучения за день (в секундах)'
    }),
    attempts: t.int({
      description: 'Количество попыток за день'
    }),
    sessionsCount: t.int({
      description: 'Количество сессий обучения'
    })
  })
})

/**
 * Паттерн обучения пользователя
 */
builder.objectType('LearningPattern', {
  description: 'Анализ паттерна обучения пользователя',
  fields: (t) => ({
    preferredTimeOfDay: t.string({
      nullable: true,
      description: 'Предпочитаемое время дня для обучения'
    }),
    averageSessionDuration: t.int({
      description: 'Средняя длительность сессии (в секундах)'
    }),
    consistencyScore: t.float({
      description: 'Оценка постоянства обучения (0.0-1.0)'
    }),
    learningSpeed: t.string({
      description: 'Скорость обучения: SLOW, NORMAL, FAST'
    }),
    strugglingAreas: t.stringList({
      description: 'Области, вызывающие затруднения'
    }),
    strengths: t.stringList({
      description: 'Сильные стороны в обучении'
    })
  })
})

export {}