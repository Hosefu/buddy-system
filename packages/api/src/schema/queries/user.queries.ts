/**
 * GraphQL запросы для работы с пользователями
 * 
 * Реализует операции для получения информации о пользователях,
 * их профилях, статистике и связанных данных.
 * 
 * Queries:
 * - me: Текущий пользователь
 * - user: Пользователь по ID
 * - users: Список пользователей (с пагинацией)
 * - userStats: Статистика пользователя
 * - userActivity: Активность пользователя
 */

import { builder } from '../index'
import { UserService } from '../../core/services/user/UserService'
import { UserStatsService } from '../../core/services/user/UserStatsService'
import { UserRepository } from '../../core/repositories/UserRepository'
import { FlowAssignmentRepository } from '../../core/repositories/FlowAssignmentRepository'
import { ProgressRepository } from '../../core/repositories/ProgressRepository'
import { handleResolverError, requireAuth, requireAdminOrBuddy } from '../index'
import { z } from 'zod'

/**
 * Валидационные схемы для параметров запросов
 */
const UsersFilterSchema = z.object({
  search: z.string().optional(),
  role: z.enum(['USER', 'BUDDY', 'ADMIN', 'SUPER_ADMIN']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  department: z.string().optional(),
  registeredAfter: z.string().datetime().optional(),
  registeredBefore: z.string().datetime().optional()
})

const PaginationSchema = z.object({
  first: z.number().int().min(1).max(100).optional(),
  after: z.string().optional(),
  last: z.number().int().min(1).max(100).optional(),
  before: z.string().optional()
})

/**
 * Входные типы для фильтрации и поиска
 */
builder.inputType('UsersFilter', {
  description: 'Фильтры для поиска пользователей',
  fields: (t) => ({
    search: t.string({
      description: 'Поиск по имени, username или email',
      required: false
    }),
    role: t.field({
      type: 'UserRole',
      description: 'Фильтр по роли пользователя',
      required: false
    }),
    status: t.field({
      type: 'UserStatus',
      description: 'Фильтр по статусу пользователя',
      required: false
    }),
    department: t.string({
      description: 'Фильтр по отделу',
      required: false
    }),
    registeredAfter: t.field({
      type: 'DateTime',
      description: 'Зарегистрированы после указанной даты',
      required: false
    }),
    registeredBefore: t.field({
      type: 'DateTime',
      description: 'Зарегистрированы до указанной даты',
      required: false
    })
  })
})

builder.inputType('UserActivityFilter', {
  description: 'Фильтры для активности пользователя',
  fields: (t) => ({
    fromDate: t.field({
      type: 'DateTime',
      description: 'Начальная дата периода',
      required: false
    }),
    toDate: t.field({
      type: 'DateTime',
      description: 'Конечная дата периода',
      required: false
    }),
    activityTypes: t.stringList({
      description: 'Типы активности для фильтрации',
      required: false
    })
  })
})

/**
 * Основные queries для пользователей
 */
builder.queryFields((t) => ({
  /**
   * Получение текущего пользователя
   */
  me: t.field({
    type: 'User',
    description: 'Информация о текущем пользователе',
    resolve: async (_, __, context) => {
      try {
        const currentUser = requireAuth(context)
        
        const userRepository = new UserRepository(context.prisma)
        const userService = new UserService(userRepository, context.eventBus)
        
        // Получаем полную информацию о пользователе
        const user = await userService.getUserById(currentUser.id)
        
        if (!user) {
          throw new Error('Пользователь не найден')
        }
        
        return user
        
      } catch (error) {
        console.error('❌ Ошибка получения текущего пользователя:', error)
        throw handleResolverError(error, 'Не удалось получить информацию о пользователе')
      }
    }
  }),

  /**
   * Получение пользователя по ID
   */
  user: t.field({
    type: 'User',
    nullable: true,
    description: 'Получение пользователя по ID',
    args: {
      id: t.arg.id({ 
        required: true,
        description: 'ID пользователя' 
      })
    },
    resolve: async (_, { id }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        const userRepository = new UserRepository(context.prisma)
        const userService = new UserService(userRepository, context.eventBus)
        
        // Проверяем права доступа
        if (currentUser.id !== id && !currentUser.isAdmin && !currentUser.isBuddy) {
          throw new Error('Недостаточно прав для просмотра этого пользователя')
        }
        
        const user = await userService.getUserById(id)
        return user
        
      } catch (error) {
        console.error('❌ Ошибка получения пользователя:', error)
        throw handleResolverError(error, 'Не удалось получить пользователя')
      }
    }
  }),

  /**
   * Получение списка пользователей с пагинацией
   */
  users: t.field({
    type: 'UserConnection',
    description: 'Список пользователей с пагинацией и фильтрацией',
    authScopes: { adminOrBuddy: true },
    args: {
      filter: t.arg({
        type: 'UsersFilter',
        required: false,
        description: 'Фильтры для поиска'
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
      last: t.arg.int({
        required: false,
        description: 'Количество элементов с конца',
        validate: { min: 1, max: 100 }
      }),
      before: t.arg.string({
        required: false,
        description: 'Курсор для обратной пагинации'
      })
    },
    resolve: async (_, args, context) => {
      try {
        const currentUser = requireAdminOrBuddy(context)
        
        // Валидация параметров
        const validatedFilter = args.filter ? UsersFilterSchema.parse(args.filter) : {}
        const validatedPagination = PaginationSchema.parse({
          first: args.first,
          after: args.after,
          last: args.last,
          before: args.before
        })
        
        const userRepository = new UserRepository(context.prisma)
        const userService = new UserService(userRepository, context.eventBus)
        
        // Получаем пользователей с учетом прав доступа
        const result = await userService.getUsers({
          filter: validatedFilter,
          pagination: validatedPagination,
          requesterId: currentUser.id,
          requesterRole: currentUser.role
        })
        
        return result
        
      } catch (error) {
        console.error('❌ Ошибка получения списка пользователей:', error)
        throw handleResolverError(error, 'Не удалось получить список пользователей')
      }
    }
  }),

  /**
   * Статистика пользователя
   */
  userStats: t.field({
    type: 'UserStats',
    description: 'Детальная статистика пользователя',
    args: {
      userId: t.arg.id({
        required: true,
        description: 'ID пользователя для статистики'
      }),
      period: t.arg({
        type: 'StatsPeriod',
        required: false,
        description: 'Период для расчета статистики (по умолчанию - всё время)'
      })
    },
    resolve: async (_, { userId, period }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Проверяем права доступа
        if (currentUser.id !== userId && !currentUser.isAdmin && !currentUser.isBuddy) {
          throw new Error('Недостаточно прав для просмотра статистики этого пользователя')
        }
        
        const userRepository = new UserRepository(context.prisma)
        const progressRepository = new ProgressRepository(context.prisma)
        const assignmentRepository = new FlowAssignmentRepository(context.prisma)
        
        const userStatsService = new UserStatsService(
          userRepository,
          progressRepository,
          assignmentRepository
        )
        
        const stats = await userStatsService.getUserStats(userId, period)
        return stats
        
      } catch (error) {
        console.error('❌ Ошибка получения статистики пользователя:', error)
        throw handleResolverError(error, 'Не удалось получить статистику пользователя')
      }
    }
  }),

  /**
   * Активность пользователя
   */
  userActivity: t.field({
    type: 'UserActivityConnection',
    description: 'История активности пользователя',
    args: {
      userId: t.arg.id({
        required: true,
        description: 'ID пользователя'
      }),
      filter: t.arg({
        type: 'UserActivityFilter',
        required: false,
        description: 'Фильтры для активности'
      }),
      first: t.arg.int({
        required: false,
        validate: { min: 1, max: 50 }
      }),
      after: t.arg.string({ required: false })
    },
    resolve: async (_, { userId, filter, first = 20, after }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Проверяем права доступа
        if (currentUser.id !== userId && !currentUser.isAdmin && !currentUser.isBuddy) {
          throw new Error('Недостаточно прав для просмотра активности этого пользователя')
        }
        
        const userRepository = new UserRepository(context.prisma)
        const userStatsService = new UserStatsService(
          userRepository,
          new ProgressRepository(context.prisma),
          new FlowAssignmentRepository(context.prisma)
        )
        
        const activity = await userStatsService.getUserActivity({
          userId,
          filter: filter || {},
          pagination: { first, after }
        })
        
        return activity
        
      } catch (error) {
        console.error('❌ Ошибка получения активности пользователя:', error)
        throw handleResolverError(error, 'Не удалось получить активность пользователя')
      }
    }
  }),

  /**
   * Поиск пользователей
   */
  searchUsers: t.field({
    type: 'UserSearchResult',
    description: 'Поиск пользователей по различным критериям',
    authScopes: { adminOrBuddy: true },
    args: {
      query: t.arg.string({
        required: true,
        description: 'Поисковый запрос',
        validate: { minLength: 2 }
      }),
      limit: t.arg.int({
        required: false,
        description: 'Максимальное количество результатов',
        validate: { min: 1, max: 50 }
      })
    },
    resolve: async (_, { query, limit = 10 }, context) => {
      try {
        const currentUser = requireAdminOrBuddy(context)
        
        const userRepository = new UserRepository(context.prisma)
        const userService = new UserService(userRepository, context.eventBus)
        
        const searchResults = await userService.searchUsers({
          query,
          limit,
          requesterId: currentUser.id
        })
        
        return {
          query,
          results: searchResults,
          totalCount: searchResults.length
        }
        
      } catch (error) {
        console.error('❌ Ошибка поиска пользователей:', error)
        throw handleResolverError(error, 'Не удалось выполнить поиск пользователей')
      }
    }
  })
}))

/**
 * Дополнительные типы для результатов
 */
builder.enumType('StatsPeriod', {
  description: 'Периоды для расчета статистики',
  values: {
    ALL_TIME: { value: 'ALL_TIME', description: 'За всё время' },
    LAST_WEEK: { value: 'LAST_WEEK', description: 'За последнюю неделю' },
    LAST_MONTH: { value: 'LAST_MONTH', description: 'За последний месяц' },
    LAST_QUARTER: { value: 'LAST_QUARTER', description: 'За последний квартал' },
    LAST_YEAR: { value: 'LAST_YEAR', description: 'За последний год' },
    CURRENT_YEAR: { value: 'CURRENT_YEAR', description: 'За текущий год' }
  }
})

builder.objectType('UserSearchResult', {
  description: 'Результат поиска пользователей',
  fields: (t) => ({
    query: t.string({
      description: 'Исходный поисковый запрос'
    }),
    results: t.field({
      type: ['User'],
      description: 'Найденные пользователи'
    }),
    totalCount: t.int({
      description: 'Общее количество результатов'
    })
  })
})

export {}