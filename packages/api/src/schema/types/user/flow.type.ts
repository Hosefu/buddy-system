/**
 * GraphQL запросы для работы с потоками и назначениями
 * 
 * Реализует операции для получения информации о потоках,
 * назначениях, прогрессе и связанных данных.
 * 
 * Queries:
 * - flows: Список доступных потоков
 * - flow: Детальная информация о потоке
 * - myAssignments: Назначенные текущему пользователю потоки
 * - assignment: Детальная информация о назначении
 * - flowProgress: Прогресс прохождения потока
 * - assignmentStats: Статистика по назначению
 */

import { builder } from '../index'
import { FlowService } from '../../core/services/flow/FlowService'
import { FlowAssignmentService } from '../../core/services/assignment/FlowAssignmentService'
import { ProgressService } from '../../core/services/progress/ProgressService'
import { FlowRepository } from '../../core/repositories/FlowRepository'
import { FlowAssignmentRepository } from '../../core/repositories/FlowAssignmentRepository'
import { ProgressRepository } from '../../core/repositories/ProgressRepository'
import { ComponentRepository } from '../../core/repositories/ComponentRepository'
import { handleResolverError, requireAuth, requireAdminOrBuddy } from '../index'
import { z } from 'zod'

/**
 * Валидационные схемы для фильтров
 */
const FlowsFilterSchema = z.object({
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED']).optional(),
  category: z.string().optional(),
  createdBy: z.string().optional(),
  search: z.string().optional(),
  isPublic: z.boolean().optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional()
})

const AssignmentsFilterSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'OVERDUE', 'CANCELLED']).optional(),
  flowId: z.string().optional(),
  buddyId: z.string().optional(),
  assignedAfter: z.string().datetime().optional(),
  assignedBefore: z.string().datetime().optional(),
  deadlineAfter: z.string().datetime().optional(),
  deadlineBefore: z.string().datetime().optional()
})

/**
 * Входные типы для фильтрации
 */
builder.inputType('FlowsFilter', {
  description: 'Фильтры для поиска потоков',
  fields: (t) => ({
    status: t.field({
      type: 'FlowStatus',
      description: 'Статус потока',
      required: false
    }),
    category: t.string({
      description: 'Категория потока',
      required: false
    }),
    createdBy: t.id({
      description: 'ID создателя потока',
      required: false
    }),
    search: t.string({
      description: 'Поиск по названию и описанию',
      required: false
    }),
    isPublic: t.boolean({
      description: 'Только публичные потоки',
      required: false
    }),
    difficulty: t.field({
      type: 'FlowDifficulty',
      description: 'Уровень сложности',
      required: false
    })
  })
})

builder.inputType('AssignmentsFilter', {
  description: 'Фильтры для назначений',
  fields: (t) => ({
    status: t.field({
      type: 'AssignmentStatus',
      description: 'Статус назначения',
      required: false
    }),
    flowId: t.id({
      description: 'ID потока',
      required: false
    }),
    buddyId: t.id({
      description: 'ID наставника',
      required: false
    }),
    assignedAfter: t.field({
      type: 'DateTime',
      description: 'Назначено после даты',
      required: false
    }),
    assignedBefore: t.field({
      type: 'DateTime',
      description: 'Назначено до даты',
      required: false
    }),
    deadlineAfter: t.field({
      type: 'DateTime',
      description: 'Дедлайн после даты',
      required: false
    }),
    deadlineBefore: t.field({
      type: 'DateTime',
      description: 'Дедлайн до даты',
      required: false
    })
  })
})

/**
 * Основные queries для потоков
 */
builder.queryFields((t) => ({
  /**
   * Получение списка потоков
   */
  flows: t.field({
    type: 'FlowConnection',
    description: 'Список потоков с пагинацией и фильтрацией',
    args: {
      filter: t.arg({
        type: 'FlowsFilter',
        required: false,
        description: 'Фильтры для поиска потоков'
      }),
      first: t.arg.int({
        required: false,
        description: 'Количество элементов с начала',
        validate: { min: 1, max: 100 }
      }),
      after: t.arg.string({
        required: false,
        description: 'Курсор для пагинации'
      }),
      orderBy: t.arg({
        type: 'FlowOrderBy',
        required: false,
        description: 'Сортировка результатов'
      })
    },
    resolve: async (_, args, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Валидация фильтров
        const validatedFilter = args.filter ? FlowsFilterSchema.parse(args.filter) : {}
        
        const flowRepository = new FlowRepository(context.prisma)
        const flowService = new FlowService(
          flowRepository,
          new ComponentRepository(context.prisma),
          context.eventBus
        )
        
        // Получаем потоки с учетом прав пользователя
        const result = await flowService.getFlows({
          filter: validatedFilter,
          pagination: {
            first: args.first || 20,
            after: args.after
          },
          orderBy: args.orderBy,
          userId: currentUser.id,
          userRole: currentUser.role
        })
        
        return result
        
      } catch (error) {
        console.error('❌ Ошибка получения потоков:', error)
        throw handleResolverError(error, 'Не удалось получить список потоков')
      }
    }
  }),

  /**
   * Получение детальной информации о потоке
   */
  flow: t.field({
    type: 'Flow',
    nullable: true,
    description: 'Детальная информация о потоке',
    args: {
      id: t.arg.id({
        required: true,
        description: 'ID потока'
      })
    },
    resolve: async (_, { id }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        const flowRepository = new FlowRepository(context.prisma)
        const flowService = new FlowService(
          flowRepository,
          new ComponentRepository(context.prisma),
          context.eventBus
        )
        
        // Получаем поток с проверкой прав доступа
        const flow = await flowService.getFlowById(id, {
          userId: currentUser.id,
          userRole: currentUser.role
        })
        
        return flow
        
      } catch (error) {
        console.error('❌ Ошибка получения потока:', error)
        throw handleResolverError(error, 'Не удалось получить поток')
      }
    }
  }),

  /**
   * Назначения текущего пользователя
   */
  myAssignments: t.field({
    type: 'FlowAssignmentConnection',
    description: 'Потоки, назначенные текущему пользователю',
    args: {
      filter: t.arg({
        type: 'AssignmentsFilter',
        required: false,
        description: 'Фильтры для назначений'
      }),
      first: t.arg.int({
        required: false,
        validate: { min: 1, max: 50 }
      }),
      after: t.arg.string({ required: false }),
      orderBy: t.arg({
        type: 'AssignmentOrderBy',
        required: false
      })
    },
    resolve: async (_, args, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Валидация фильтров
        const validatedFilter = args.filter ? AssignmentsFilterSchema.parse(args.filter) : {}
        
        const assignmentRepository = new FlowAssignmentRepository(context.prisma)
        const assignmentService = new FlowAssignmentService(
          assignmentRepository,
          new FlowRepository(context.prisma),
          context.eventBus
        )
        
        // Получаем назначения пользователя
        const result = await assignmentService.getUserAssignments({
          userId: currentUser.id,
          filter: validatedFilter,
          pagination: {
            first: args.first || 20,
            after: args.after
          },
          orderBy: args.orderBy
        })
        
        return result
        
      } catch (error) {
        console.error('❌ Ошибка получения назначений пользователя:', error)
        throw handleResolverError(error, 'Не удалось получить ваши назначения')
      }
    }
  }),

  /**
   * Детальная информация о назначении
   */
  assignment: t.field({
    type: 'FlowAssignment',
    nullable: true,
    description: 'Детальная информация о назначении потока',
    args: {
      id: t.arg.id({
        required: true,
        description: 'ID назначения'
      })
    },
    resolve: async (_, { id }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        const assignmentRepository = new FlowAssignmentRepository(context.prisma)
        const assignmentService = new FlowAssignmentService(
          assignmentRepository,
          new FlowRepository(context.prisma),
          context.eventBus
        )
        
        // Получаем назначение с проверкой прав доступа
        const assignment = await assignmentService.getAssignmentById(id, {
          userId: currentUser.id,
          userRole: currentUser.role
        })
        
        return assignment
        
      } catch (error) {
        console.error('❌ Ошибка получения назначения:', error)
        throw handleResolverError(error, 'Не удалось получить назначение')
      }
    }
  }),

  /**
   * Прогресс прохождения потока
   */
  flowProgress: t.field({
    type: 'FlowProgress',
    nullable: true,
    description: 'Детальный прогресс прохождения потока',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения потока'
      })
    },
    resolve: async (_, { assignmentId }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        const progressRepository = new ProgressRepository(context.prisma)
        const progressService = new ProgressService(progressRepository, context.eventBus)
        
        // Получаем прогресс с проверкой прав доступа
        const progress = await progressService.getFlowProgress(assignmentId, {
          userId: currentUser.id,
          userRole: currentUser.role
        })
        
        return progress
        
      } catch (error) {
        console.error('❌ Ошибка получения прогресса потока:', error)
        throw handleResolverError(error, 'Не удалось получить прогресс потока')
      }
    }
  }),

  /**
   * Статистика по назначению
   */
  assignmentStats: t.field({
    type: 'AssignmentStats',
    description: 'Детальная статистика по назначению',
    authScopes: { buddyOrAdmin: true },
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения'
      })
    },
    resolve: async (_, { assignmentId }, context) => {
      try {
        const currentUser = requireAdminOrBuddy(context)
        
        const assignmentRepository = new FlowAssignmentRepository(context.prisma)
        const progressRepository = new ProgressRepository(context.prisma)
        const assignmentService = new FlowAssignmentService(
          assignmentRepository,
          new FlowRepository(context.prisma),
          context.eventBus
        )
        
        // Получаем статистику с проверкой прав доступа
        const stats = await assignmentService.getAssignmentStats(assignmentId, {
          buddyId: currentUser.isBuddy ? currentUser.id : undefined,
          requesterId: currentUser.id
        })
        
        return stats
        
      } catch (error) {
        console.error('❌ Ошибка получения статистики назначения:', error)
        throw handleResolverError(error, 'Не удалось получить статистику назначения')
      }
    }
  }),

  /**
   * Получение назначений, которые курирует buddy
   */
  myBuddyAssignments: t.field({
    type: 'FlowAssignmentConnection',
    description: 'Назначения, которые курирует текущий buddy',
    authScopes: { buddy: true },
    args: {
      filter: t.arg({
        type: 'AssignmentsFilter',
        required: false
      }),
      first: t.arg.int({
        required: false,
        validate: { min: 1, max: 50 }
      }),
      after: t.arg.string({ required: false }),
      orderBy: t.arg({
        type: 'AssignmentOrderBy',
        required: false
      })
    },
    resolve: async (_, args, context) => {
      try {
        const currentUser = requireAuth(context)
        
        if (!currentUser.isBuddy) {
          throw new Error('Доступ только для наставников')
        }
        
        // Валидация фильтров
        const validatedFilter = args.filter ? AssignmentsFilterSchema.parse(args.filter) : {}
        
        const assignmentRepository = new FlowAssignmentRepository(context.prisma)
        const assignmentService = new FlowAssignmentService(
          assignmentRepository,
          new FlowRepository(context.prisma),
          context.eventBus
        )
        
        // Получаем назначения, которые курирует этот buddy
        const result = await assignmentService.getBuddyAssignments({
          buddyId: currentUser.id,
          filter: validatedFilter,
          pagination: {
            first: args.first || 20,
            after: args.after
          },
          orderBy: args.orderBy
        })
        
        return result
        
      } catch (error) {
        console.error('❌ Ошибка получения назначений buddy:', error)
        throw handleResolverError(error, 'Не удалось получить ваши курируемые назначения')
      }
    }
  }),

  /**
   * Поиск потоков
   */
  searchFlows: t.field({
    type: 'FlowSearchResult',
    description: 'Поиск потоков по различным критериям',
    args: {
      query: t.arg.string({
        required: true,
        description: 'Поисковый запрос',
        validate: { minLength: 2 }
      }),
      filters: t.arg({
        type: 'FlowsFilter',
        required: false,
        description: 'Дополнительные фильтры'
      }),
      limit: t.arg.int({
        required: false,
        description: 'Максимальное количество результатов',
        validate: { min: 1, max: 50 }
      })
    },
    resolve: async (_, { query, filters, limit = 10 }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        const flowRepository = new FlowRepository(context.prisma)
        const flowService = new FlowService(
          flowRepository,
          new ComponentRepository(context.prisma),
          context.eventBus
        )
        
        const searchResults = await flowService.searchFlows({
          query,
          filters: filters || {},
          limit,
          userId: currentUser.id,
          userRole: currentUser.role
        })
        
        return {
          query,
          results: searchResults,
          totalCount: searchResults.length
        }
        
      } catch (error) {
        console.error('❌ Ошибка поиска потоков:', error)
        throw handleResolverError(error, 'Не удалось выполнить поиск потоков')
      }
    }
  })
}))

/**
 * Дополнительные енумы и типы для сортировки
 */
builder.enumType('FlowOrderBy', {
  description: 'Варианты сортировки потоков',
  values: {
    CREATED_DESC: { value: 'CREATED_DESC', description: 'По дате создания (новые первые)' },
    CREATED_ASC: { value: 'CREATED_ASC', description: 'По дате создания (старые первые)' },
    UPDATED_DESC: { value: 'UPDATED_DESC', description: 'По дате обновления (недавние первые)' },
    TITLE_ASC: { value: 'TITLE_ASC', description: 'По названию (А-Я)' },
    TITLE_DESC: { value: 'TITLE_DESC', description: 'По названию (Я-А)' },
    POPULARITY_DESC: { value: 'POPULARITY_DESC', description: 'По популярности' }
  }
})

builder.enumType('AssignmentOrderBy', {
  description: 'Варианты сортировки назначений',
  values: {
    ASSIGNED_DESC: { value: 'ASSIGNED_DESC', description: 'По дате назначения (новые первые)' },
    ASSIGNED_ASC: { value: 'ASSIGNED_ASC', description: 'По дате назначения (старые первые)' },
    DEADLINE_ASC: { value: 'DEADLINE_ASC', description: 'По дедлайну (ближайшие первые)' },
    DEADLINE_DESC: { value: 'DEADLINE_DESC', description: 'По дедлайну (дальние первые)' },
    PROGRESS_DESC: { value: 'PROGRESS_DESC', description: 'По прогрессу (больший первый)' },
    PROGRESS_ASC: { value: 'PROGRESS_ASC', description: 'По прогрессу (меньший первый)' },
    STATUS: { value: 'STATUS', description: 'По статусу' }
  }
})

builder.objectType('FlowSearchResult', {
  description: 'Результат поиска потоков',
  fields: (t) => ({
    query: t.string({
      description: 'Исходный поисковый запрос'
    }),
    results: t.field({
      type: ['Flow'],
      description: 'Найденные потоки'
    }),
    totalCount: t.int({
      description: 'Общее количество результатов'
    })
  })
})

export {}