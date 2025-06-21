/**
 * Основной файл GraphQL схемы
 * 
 * Файл: packages/api/src/schema/index.ts
 * 
 * Инициализирует Pothos GraphQL builder, настраивает типы и импортирует
 * все определения схемы. Экспортирует готовую схему для использования
 * в Apollo Server.
 */

import SchemaBuilder from '@pothos/core'
import PrismaPlugin from '@pothos/plugin-prisma'
import ValidationPlugin from '@pothos/plugin-validation'
import ScopeAuthPlugin from '@pothos/plugin-scope-auth'
import ErrorsPlugin from '@pothos/plugin-errors'
import SimpleObjectsPlugin from '@pothos/plugin-simple-objects'
import { PrismaClient } from '@prisma/client'
import { GraphQLError } from 'graphql'
import type { Context } from '../types/context'
import type { User } from '../core/entities/User'

/**
 * Типы для Pothos builder
 */
export interface SchemaTypes {
  Context: Context
  AuthScopes: {
    // Базовая аутентификация
    authenticated: boolean
    
    // Роли
    user: boolean
    buddy: boolean
    admin: boolean
    superAdmin: boolean
    
    // Комбинированные права
    adminOrBuddy: boolean
    buddyOrAdmin: boolean
    
    // Специфичные разрешения
    canManageUsers: boolean
    canCreateFlows: boolean
    canAssignFlows: boolean
    canViewAnalytics: boolean
  }
  PrismaTypes: any // Будет автоматически выведен из Prisma схемы
  Scalars: {
    DateTime: {
      Input: Date
      Output: Date
    }
    JSON: {
      Input: any
      Output: any
    }
    EmailAddress: {
      Input: string
      Output: string
    }
    Time: {
      Input: string
      Output: string
    }
    Date: {
      Input: string
      Output: string
    }
  }
}

/**
 * Инициализация Pothos GraphQL Builder
 */
export const builder = new SchemaBuilder<SchemaTypes>({
  plugins: [
    PrismaPlugin,
    ValidationPlugin,
    ScopeAuthPlugin,
    ErrorsPlugin,
    SimpleObjectsPlugin
  ],
  
  // Настройки плагинов
  authScopes: async (context) => {
    const user = context.user
    
    return {
      authenticated: !!user,
      user: !!user,
      buddy: !!user?.isBuddy,
      admin: !!user?.isAdmin,
      superAdmin: user?.role === 'SUPER_ADMIN',
      adminOrBuddy: !!(user?.isAdmin || user?.isBuddy),
      buddyOrAdmin: !!(user?.isBuddy || user?.isAdmin),
      canManageUsers: !!(user?.isAdmin),
      canCreateFlows: !!(user?.isAdmin || user?.isBuddy),
      canAssignFlows: !!(user?.isAdmin || user?.isBuddy),
      canViewAnalytics: !!(user?.isAdmin || user?.isBuddy)
    }
  },
  
  prisma: {
    client: (context: Context) => context.prisma,
    // Автоматическое экспонирование типов Prisma в GraphQL
    exposeDescriptions: true,
    filterConnectionTotalCount: true
  },
  
  validationOptions: {
    // Настройки валидации
    validationError: (zodError) => {
      return new GraphQLError(`Ошибка валидации: ${zodError.message}`, {
        extensions: {
          code: 'VALIDATION_ERROR',
          zodError: zodError.format()
        }
      })
    }
  },
  
  errorOptions: {
    defaultTypes: ['Error']
  }
})

/**
 * Утилиты для работы с аутентификацией в резолверах
 */

/**
 * Требует аутентифицированного пользователя
 */
export function requireAuth(context: Context): User {
  if (!context.user) {
    throw new GraphQLError('Требуется аутентификация', {
      extensions: {
        code: 'UNAUTHENTICATED'
      }
    })
  }
  return context.user
}

/**
 * Требует права администратора
 */
export function requireAdmin(context: Context): User {
  const user = requireAuth(context)
  if (!user.isAdmin) {
    throw new GraphQLError('Недостаточно прав доступа. Требуются права администратора', {
      extensions: {
        code: 'FORBIDDEN',
        requiredRole: 'ADMIN'
      }
    })
  }
  return user
}

/**
 * Требует права наставника или администратора
 */
export function requireBuddy(context: Context): User {
  const user = requireAuth(context)
  if (!user.isBuddy && !user.isAdmin) {
    throw new GraphQLError('Недостаточно прав доступа. Требуются права наставника или администратора', {
      extensions: {
        code: 'FORBIDDEN',
        requiredRole: 'BUDDY_OR_ADMIN'
      }
    })
  }
  return user
}

/**
 * Требует права администратора или наставника
 */
export function requireAdminOrBuddy(context: Context): User {
  return requireBuddy(context) // Та же логика
}

/**
 * Проверяет, может ли пользователь просматривать данные другого пользователя
 */
export function canViewUser(context: Context, targetUserId: string): boolean {
  const currentUser = context.user
  if (!currentUser) return false
  
  // Может просматривать свои данные
  if (currentUser.id === targetUserId) return true
  
  // Админы и buddy могут просматривать данные других
  if (currentUser.isAdmin || currentUser.isBuddy) return true
  
  return false
}

/**
 * Обработчик ошибок для резолверов
 */
export function handleResolverError(error: unknown, defaultMessage: string): never {
  console.error('Ошибка в резолвере:', error)
  
  // Если это уже GraphQLError, просто пробрасываем
  if (error instanceof GraphQLError) {
    throw error
  }
  
  // Если это стандартная ошибка с сообщением
  if (error instanceof Error) {
    throw new GraphQLError(error.message, {
      extensions: {
        code: 'INTERNAL_ERROR',
        originalError: error.name
      }
    })
  }
  
  // Неизвестная ошибка
  throw new GraphQLError(defaultMessage, {
    extensions: {
      code: 'UNKNOWN_ERROR'
    }
  })
}

/**
 * Создание контекста для GraphQL
 */
export function createGraphQLContext(authContext: {
  user?: User
  token?: string
  permissions?: string[]
}): Context {
  return {
    user: authContext.user,
    token: authContext.token,
    permissions: authContext.permissions || [],
    prisma: new PrismaClient(), // В продакшене это должен быть singleton
    eventBus: null as any, // TODO: Инициализация event bus
    redis: null as any, // TODO: Инициализация Redis клиента
    
    // Методы для контекста
    isAuthenticated: () => !!authContext.user,
    hasPermission: (permission: string) => authContext.permissions?.includes(permission) || false,
    hasRole: (role: string) => authContext.user?.role === role || false
  }
}

/**
 * Форматирование ошибок GraphQL
 */
export function formatGraphQLError(formattedError: any, error: unknown) {
  // В продакшене скрываем внутренние детали
  if (process.env.NODE_ENV === 'production') {
    // Удаляем стек трейс и внутренние детали
    delete formattedError.extensions?.exception?.stacktrace
    delete formattedError.extensions?.exception?.config
    
    // Логируем полную ошибку для разработчиков
    console.error('GraphQL Error:', error)
  }
  
  return formattedError
}

// Импортируем все определения типов и резолверов
// Порядок импорта важен для корректной сборки схемы

// 1. Скалярные типы (должны быть первыми)
import './types/scalars'

// 2. Основные типы сущностей
import './types/user/user.type'
import './types/flow/flow.type'
import './types/component/component.type'

// 3. Queries (после типов)
import './queries/user.queries'
import './queries/flow.queries'

// 4. Mutations (после queries)
import './mutations/auth.mutations'
import './mutations/assignment.mutations'
import './mutations/component.mutations'

// 5. Subscriptions (если есть)
// import './subscriptions/progress.subscriptions'

/**
 * Корневые типы Query и Mutation
 * Pothos автоматически создает их на основе определений в файлах
 */

// Добавляем базовые поля для Query
builder.queryType({
  description: 'Корневой тип для всех запросов GraphQL'
})

// Добавляем базовые поля для Mutation
builder.mutationType({
  description: 'Корневой тип для всех мутаций GraphQL'
})

// Добавляем Subscription если нужно real-time функциональность
builder.subscriptionType({
  description: 'Корневой тип для всех подписок GraphQL'
})

/**
 * Экспорт собранной схемы
 */
export const schema = builder.toSchema({})

/**
 * Схема в SDL формате (для документации и инструментов)
 */
export function getSchemaSDL(): string {
  const { printSchema } = require('graphql')
  return printSchema(schema)
}

/**
 * Валидация схемы (для тестов)
 */
export function validateSchema(): boolean {
  try {
    const { validateSchema } = require('graphql')
    const errors = validateSchema(schema)
    
    if (errors.length > 0) {
      console.error('Ошибки валидации схемы:', errors)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Ошибка при валидации схемы:', error)
    return false
  }
}

/**
 * Статистика схемы (для мониторинга)
 */
export function getSchemaStats() {
  const typeMap = schema.getTypeMap()
  const types = Object.keys(typeMap).filter(name => !name.startsWith('__'))
  
  const stats = {
    totalTypes: types.length,
    objectTypes: types.filter(name => {
      const type = typeMap[name]
      return type.constructor.name === 'GraphQLObjectType'
    }).length,
    inputTypes: types.filter(name => {
      const type = typeMap[name]
      return type.constructor.name === 'GraphQLInputObjectType'
    }).length,
    enumTypes: types.filter(name => {
      const type = typeMap[name]
      return type.constructor.name === 'GraphQLEnumType'
    }).length,
    scalarTypes: types.filter(name => {
      const type = typeMap[name]
      return type.constructor.name === 'GraphQLScalarType'
    }).length
  }
  
  return stats
}

// Экспорт типов для использования в других файлах
export type { Context, SchemaTypes }

export default schema