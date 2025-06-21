/**
 * GraphQL типы для снапшотов
 * 
 * Определяет типы для снапшотов потоков, шагов и компонентов.
 * Эти типы используются клиентами для получения неизменяемых
 * копий контента, с которыми работают пользователи.
 * 
 * Ключевые типы:
 * - FlowSnapshot: снапшот всего потока
 * - FlowStepSnapshot: снапшот отдельного шага
 * - ComponentSnapshot: снапшот компонента (статья, задание, квиз, видео)
 */

import { builder } from '../../index'

// ===== БАЗОВЫЕ СКАЛЯРНЫЕ ТИПЫ =====

/**
 * JSON данные компонента
 */
builder.scalarType('ComponentData', {
  description: 'JSON данные компонента (зависят от типа компонента)',
  serialize: (value) => value,
  parseValue: (value) => value,
})

/**
 * Условия разблокировки
 */
builder.scalarType('UnlockConditions', {
  description: 'JSON массив условий разблокировки шага',
  serialize: (value) => value,
  parseValue: (value) => value,
})

/**
 * Требования завершения
 */
builder.scalarType('CompletionRequirements', {
  description: 'JSON объект требований для завершения шага',
  serialize: (value) => value,
  parseValue: (value) => value,
})

// ===== ПЕРЕЧИСЛЕНИЯ =====

/**
 * Типы компонентов
 */
builder.enumType('ComponentType', {
  description: 'Тип компонента в потоке',
  values: {
    ARTICLE: { description: 'Статья для чтения' },
    TASK: { description: 'Задание с кодовым словом' },
    QUIZ: { description: 'Квиз с вопросами' },
    VIDEO: { description: 'Видео для просмотра' }
  }
})

/**
 * Уровни сложности потока
 */
builder.enumType('FlowDifficulty', {
  description: 'Уровень сложности потока',
  values: {
    BEGINNER: { description: 'Начальный уровень' },
    INTERMEDIATE: { description: 'Средний уровень' },
    ADVANCED: { description: 'Продвинутый уровень' }
  }
})

// ===== ИНТЕРФЕЙСЫ =====

/**
 * Базовый интерфейс для всех снапшотов
 */
builder.interfaceType('BaseSnapshot', {
  description: 'Базовый интерфейс для всех типов снапшотов',
  fields: (t) => ({
    id: t.id({ description: 'Уникальный идентификатор снапшота' }),
    createdAt: t.field({ 
      type: 'DateTime',
      description: 'Дата и время создания снапшота'
    }),
    snapshotVersion: t.string({
      description: 'Версия алгоритма создания снапшота'
    }),
    createdBy: t.string({
      description: 'ID пользователя, создавшего снапшот'
    })
  })
})

// ===== ТИПЫ СНАПШОТОВ =====

/**
 * Снапшот потока
 */
builder.objectType('FlowSnapshot', {
  description: 'Неизменяемый снапшот потока на момент назначения пользователю',
  interfaces: ['BaseSnapshot'],
  fields: (t) => ({
    // Базовые поля из интерфейса
    id: t.id(),
    createdAt: t.field({ type: 'DateTime' }),
    snapshotVersion: t.string(),
    createdBy: t.string(),
    
    // Специфичные поля
    assignmentId: t.id({
      description: 'ID назначения, к которому относится снапшот'
    }),
    originalFlowId: t.id({
      description: 'ID оригинального потока'
    }),
    title: t.string({
      description: 'Название потока'
    }),
    description: t.string({
      description: 'Описание потока'
    }),
    version: t.string({
      description: 'Версия потока на момент снапшота'
    }),
    estimatedDuration: t.int({
      nullable: true,
      description: 'Примерное время прохождения (в минутах)'
    }),
    difficulty: t.field({
      type: 'FlowDifficulty',
      nullable: true,
      description: 'Уровень сложности'
    }),
    tags: t.stringList({
      description: 'Теги для категоризации'
    }),
    stepCount: t.int({
      description: 'Количество шагов в потоке',
      resolve: (flowSnapshot, _, context) => {
        return flowSnapshot.stepSnapshotIds?.length || 0
      }
    }),
    
    // Связанные данные
    stepSnapshots: t.field({
      type: ['FlowStepSnapshot'],
      description: 'Снапшоты шагов потока',
      resolve: async (flowSnapshot, _, context) => {
        const stepSnapshots = await context.prisma.flowStepSnapshot.findMany({
          where: { flowSnapshotId: flowSnapshot.id },
          orderBy: { order: 'asc' }
        })
        return stepSnapshots
      }
    }),
    
    assignment: t.field({
      type: 'FlowAssignment',
      description: 'Назначение, к которому относится снапшот',
      resolve: async (flowSnapshot, _, context) => {
        const assignment = await context.prisma.flowAssignment.findUnique({
          where: { id: flowSnapshot.assignmentId }
        })
        return assignment
      }
    }),
    
    // Метаданные
    context: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Дополнительный контекст снапшота'
    })
  })
})

/**
 * Снапшот шага потока
 */
builder.objectType('FlowStepSnapshot', {
  description: 'Неизменяемый снапшот шага потока',
  interfaces: ['BaseSnapshot'],
  fields: (t) => ({
    // Базовые поля
    id: t.id(),
    createdAt: t.field({ type: 'DateTime' }),
    snapshotVersion: t.string(),
    createdBy: t.string(),
    
    // Специфичные поля
    flowSnapshotId: t.id({
      description: 'ID снапшота потока'
    }),
    originalStepId: t.id({
      description: 'ID оригинального шага'
    }),
    title: t.string({
      description: 'Название шага'
    }),
    description: t.string({
      description: 'Описание шага'
    }),
    order: t.int({
      description: 'Порядковый номер шага в потоке'
    }),
    estimatedDuration: t.int({
      nullable: true,
      description: 'Примерное время прохождения шага (в минутах)'
    }),
    icon: t.string({
      nullable: true,
      description: 'Иконка или emoji для шага'
    }),
    themeColor: t.string({
      nullable: true,
      description: 'Цвет темы шага (hex)'
    }),
    componentCount: t.int({
      description: 'Количество компонентов в шаге',
      resolve: (stepSnapshot, _, context) => {
        return stepSnapshot.componentSnapshotIds?.length || 0
      }
    }),
    
    // Условия и требования
    unlockConditions: t.field({
      type: 'UnlockConditions',
      description: 'Условия разблокировки шага'
    }),
    completionRequirements: t.field({
      type: 'CompletionRequirements',
      description: 'Требования для завершения шага'
    }),
    
    // Связанные данные
    flowSnapshot: t.field({
      type: 'FlowSnapshot',
      description: 'Снапшот потока, к которому относится шаг',
      resolve: async (stepSnapshot, _, context) => {
        const flowSnapshot = await context.prisma.flowSnapshot.findUnique({
          where: { id: stepSnapshot.flowSnapshotId }
        })
        return flowSnapshot
      }
    }),
    
    componentSnapshots: t.field({
      type: ['ComponentSnapshot'],
      description: 'Снапшоты компонентов этого шага',
      resolve: async (stepSnapshot, _, context) => {
        const componentSnapshots = await context.prisma.componentSnapshot.findMany({
          where: { stepSnapshotId: stepSnapshot.id },
          orderBy: { order: 'asc' }
        })
        return componentSnapshots
      }
    }),
    
    // Прогресс пользователя по шагу
    userProgress: t.field({
      type: 'StepProgress',
      nullable: true,
      description: 'Прогресс текущего пользователя по этому шагу',
      resolve: async (stepSnapshot, _, context) => {
        const currentUser = context.user
        if (!currentUser) return null
        
        // Получаем прогресс пользователя по всем компонентам шага
        const componentProgress = await context.prisma.componentProgress.findMany({
          where: {
            userId: currentUser.id,
            componentSnapshotId: {
              in: stepSnapshot.componentSnapshotIds || []
            }
          }
        })
        
        // Вычисляем прогресс шага
        const totalComponents = stepSnapshot.componentSnapshotIds?.length || 0
        const completedComponents = componentProgress.filter(p => p.status === 'COMPLETED').length
        const progressPercentage = totalComponents > 0 ? Math.round((completedComponents / totalComponents) * 100) : 0
        
        // Определяем статус шага
        let status = 'LOCKED'
        if (completedComponents === totalComponents && totalComponents > 0) {
          status = 'COMPLETED'
        } else if (componentProgress.length > 0) {
          status = 'IN_PROGRESS'
        } else {
          // Здесь должна быть логика проверки условий разблокировки
          status = 'AVAILABLE' // Упрощение
        }
        
        return {
          stepSnapshotId: stepSnapshot.id,
          status,
          progressPercentage,
          completedComponents,
          totalComponents,
          lastActivity: componentProgress.length > 0 ? 
            Math.max(...componentProgress.map(p => p.updatedAt.getTime())) : null
        }
      }
    })
  })
})

/**
 * Снапшот компонента
 */
builder.objectType('ComponentSnapshot', {
  description: 'Неизменяемый снапшот компонента (статья, задание, квиз, видео)',
  interfaces: ['BaseSnapshot'],
  fields: (t) => ({
    // Базовые поля
    id: t.id(),
    createdAt: t.field({ type: 'DateTime' }),
    snapshotVersion: t.string(),
    createdBy: t.string(),
    
    // Специфичные поля
    stepSnapshotId: t.id({
      description: 'ID снапшота шага'
    }),
    originalComponentId: t.id({
      description: 'ID оригинального компонента'
    }),
    type: t.field({
      type: 'ComponentType',
      description: 'Тип компонента'
    }),
    typeVersion: t.string({
      description: 'Версия типа компонента'
    }),
    order: t.int({
      description: 'Порядковый номер компонента в шаге'
    }),
    isRequired: t.boolean({
      description: 'Является ли компонент обязательным'
    }),
    
    // Универсальные поля (извлекаются из data в зависимости от типа)
    title: t.string({
      description: 'Название компонента',
      resolve: (componentSnapshot, _, context) => {
        const data = componentSnapshot.data as any
        return data?.title || 'Untitled Component'
      }
    }),
    
    description: t.string({
      nullable: true,
      description: 'Описание компонента',
      resolve: (componentSnapshot, _, context) => {
        const data = componentSnapshot.data as any
        return data?.description || data?.summary || null
      }
    }),
    
    estimatedDuration: t.int({
      nullable: true,
      description: 'Примерное время прохождения (в минутах)',
      resolve: (componentSnapshot, _, context) => {
        const data = componentSnapshot.data as any
        
        switch (componentSnapshot.type) {
          case 'ARTICLE':
            return data?.estimatedReadTime || 5
          case 'VIDEO':
            return data?.duration ? Math.ceil(data.duration / 60) : 10
          case 'TASK':
            return 10
          case 'QUIZ':
            const questionsCount = data?.questions?.length || 1
            return Math.max(questionsCount * 2, 5)
          default:
            return 5
        }
      }
    }),
    
    // Типизированные данные компонента
    data: t.field({
      type: 'ComponentData',
      description: 'Данные компонента (структура зависит от типа)'
    }),
    
    // Связанные данные
    stepSnapshot: t.field({
      type: 'FlowStepSnapshot',
      description: 'Снапшот шага, к которому относится компонент',
      resolve: async (componentSnapshot, _, context) => {
        const stepSnapshot = await context.prisma.flowStepSnapshot.findUnique({
          where: { id: componentSnapshot.stepSnapshotId }
        })
        return stepSnapshot
      }
    }),
    
    // Прогресс пользователя по компоненту
    userProgress: t.field({
      type: 'ComponentProgress',
      nullable: true,
      description: 'Прогресс текущего пользователя по этому компоненту',
      resolve: async (componentSnapshot, _, context) => {
        const currentUser = context.user
        if (!currentUser) return null
        
        const progress = await context.prisma.componentProgress.findFirst({
          where: {
            componentSnapshotId: componentSnapshot.id,
            userId: currentUser.id
          }
        })
        return progress
      }
    })
  })
})

// ===== ВСПОМОГАТЕЛЬНЫЕ ТИПЫ =====

/**
 * Прогресс по шагу (вычисляемый тип)
 */
builder.objectType('StepProgress', {
  description: 'Прогресс пользователя по шагу',
  fields: (t) => ({
    stepSnapshotId: t.id({
      description: 'ID снапшота шага'
    }),
    status: t.string({
      description: 'Статус шага: LOCKED, AVAILABLE, IN_PROGRESS, COMPLETED'
    }),
    progressPercentage: t.int({
      description: 'Процент завершения шага (0-100)'
    }),
    completedComponents: t.int({
      description: 'Количество завершенных компонентов'
    }),
    totalComponents: t.int({
      description: 'Общее количество компонентов в шаге'
    }),
    lastActivity: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время последней активности в этом шаге'
    })
  })
})

/**
 * Статистика снапшота
 */
builder.objectType('SnapshotStats', {
  description: 'Статистика снапшота потока',
  fields: (t) => ({
    totalSteps: t.int({
      description: 'Общее количество шагов'
    }),
    totalComponents: t.int({
      description: 'Общее количество компонентов'
    }),
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата создания снапшота'
    }),
    sizeInBytes: t.int({
      description: 'Приблизительный размер снапшота в байтах'
    }),
    snapshotVersion: t.string({
      description: 'Версия алгоритма создания снапшота'
    })
  })
})

// ===== ТИПЫ ДЛЯ СПЕЦИАЛИЗИРОВАННЫХ КОМПОНЕНТОВ =====

/**
 * Интерфейс для всех типов компонентов
 */
builder.interfaceType('ComponentSnapshotInterface', {
  description: 'Базовый интерфейс для всех типов компонентов',
  fields: (t) => ({
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    title: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    estimatedDuration: t.int({ nullable: true })
  })
})

/**
 * Снапшот статьи
 */
builder.objectType('ArticleComponentSnapshot', {
  description: 'Снапшот компонента-статьи',
  interfaces: ['ComponentSnapshotInterface'],
  fields: (t) => ({
    // Базовые поля из интерфейса
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    title: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    estimatedDuration: t.int({ nullable: true }),
    
    // Специфичные поля для статьи
    content: t.string({
      description: 'Содержимое статьи (Markdown/HTML)'
    }),
    summary: t.string({
      nullable: true,
      description: 'Краткое изложение статьи'
    }),
    estimatedReadTime: t.int({
      nullable: true,
      description: 'Примерное время чтения (в минутах)'
    })
    // TODO: добавить attachments
  })
})

/**
 * Снапшот задания
 */
builder.objectType('TaskComponentSnapshot', {
  description: 'Снапшот компонента-задания',
  interfaces: ['ComponentSnapshotInterface'],
  fields: (t) => ({
    // Базовые поля
    id: t.id(),
    type: t.field({ type: 'ComponentType' }),
    title: t.string(),
    order: t.int(),
    isRequired: t.boolean(),
    estimatedDuration: t.int({ nullable: true }),
    
    // Специфичные поля для задания
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
      description: 'Максимальное количество попыток',
      resolve: (taskSnapshot, _, context) => {
        const data = taskSnapshot.data as any
        return data?.validationSettings?.maxAttempts || null
      }
    })
    // Правильный ответ не передаем клиенту из соображений безопасности
  })
})

// TODO: Добавить QuizComponentSnapshot и VideoComponentSnapshot аналогично

export {}