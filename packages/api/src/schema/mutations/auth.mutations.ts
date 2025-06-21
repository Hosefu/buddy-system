/**
 * GraphQL мутации для аутентификации
 * 
 * Реализует операции для входа, выхода, обновления токенов
 * и управления сессиями пользователей через Telegram.
 * 
 * Мутации:
 * - login: Вход через Telegram
 * - refreshToken: Обновление access токена
 * - logout: Выход из системы
 * - updateProfile: Обновление профиля пользователя
 */

import { builder } from '../index'
import { LoginUseCase, TelegramAuthInput } from '../../core/usecases/auth/LoginUseCase'
import { UserService } from '../../core/services/user/UserService'
import { jwtService } from '../../middleware/auth.middleware'
import { handleResolverError, requireAuth } from '../index'
import { z } from 'zod'

/**
 * Валидационные схемы для входных данных
 */
const LoginInputSchema = z.object({
  telegramId: z.string().min(1, 'Telegram ID обязателен'),
  name: z.string().min(2, 'Имя должно быть минимум 2 символа').max(100, 'Имя не должно превышать 100 символов'),
  telegramUsername: z.string().optional(),
  avatarUrl: z.string().url('Некорректный URL аватара').optional(),
  telegramHash: z.string().optional()
})

const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token обязателен')
})

const UpdateProfileInputSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  telegramUsername: z.string().regex(/^[a-zA-Z0-9_]{5,32}$/, 'Некорректный формат username').optional(),
  avatarUrl: z.string().url().optional()
})

/**
 * Входные типы для мутаций
 */
builder.inputType('LoginInput', {
  description: 'Данные для входа через Telegram',
  fields: (t) => ({
    telegramId: t.string({ 
      description: 'Telegram ID пользователя',
      validate: { minLength: 1 }
    }),
    name: t.string({ 
      description: 'Имя пользователя',
      validate: { minLength: 2, maxLength: 100 }
    }),
    telegramUsername: t.string({ 
      required: false,
      description: 'Telegram username (без @)'
    }),
    avatarUrl: t.string({ 
      required: false,
      description: 'URL аватара пользователя'
    }),
    telegramHash: t.string({ 
      required: false,
      description: 'Хеш для валидации данных Telegram'
    })
  })
})

builder.inputType('RefreshTokenInput', {
  description: 'Данные для обновления токена',
  fields: (t) => ({
    refreshToken: t.string({ 
      description: 'Refresh token для обновления'
    })
  })
})

/**
 * Результаты аутентификации
 */
builder.objectType('LoginResult', {
  description: 'Результат успешного входа в систему',
  fields: (t) => ({
    success: t.boolean({
      description: 'Успешность операции'
    }),
    message: t.string({
      nullable: true,
      description: 'Сообщение о результате'
    }),
    user: t.field({
      type: 'User',
      nullable: true,
      description: 'Данные пользователя'
    }),
    tokens: t.field({
      type: 'AuthTokens',
      nullable: true,
      description: 'Токены доступа'
    }),
    isNewUser: t.boolean({
      description: 'Новый ли это пользователь'
    }),
    permissions: t.stringList({
      description: 'Разрешения пользователя'
    })
  })
})

builder.objectType('AuthTokens', {
  description: 'Токены аутентификации',
  fields: (t) => ({
    accessToken: t.string({
      description: 'Access token для API запросов'
    }),
    refreshToken: t.string({
      description: 'Refresh token для обновления access token'
    }),
    expiresIn: t.int({
      description: 'Время жизни access token в секундах'
    }),
    tokenType: t.string({
      description: 'Тип токена (обычно Bearer)'
    })
  })
})

builder.objectType('RefreshTokenResult', {
  description: 'Результат обновления токена',
  fields: (t) => ({
    success: t.boolean(),
    message: t.string({ nullable: true }),
    tokens: t.field({
      type: 'AuthTokens',
      nullable: true
    }),
    errors: t.field({
      type: ['MutationError'],
      nullable: true
    })
  })
})

/**
 * Мутации аутентификации
 */
builder.mutationFields((t) => ({
  /**
   * Вход в систему через Telegram
   */
  login: t.field({
    type: 'LoginResult',
    description: 'Аутентификация пользователя через Telegram',
    authScopes: { public: true },
    args: {
      input: t.arg({ type: 'LoginInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        // Валидируем входные данные
        const validatedInput = LoginInputSchema.parse(input)

        // Создаем экземпляр Use Case
        const userService = new UserService(context.prisma.user as any)
        const loginUseCase = new LoginUseCase(
          userService,
          jwtService,
          // TODO: Реализовать TelegramValidator
          { validateAuthData: () => true },
          process.env.TELEGRAM_BOT_TOKEN || ''
        )

        // Выполняем аутентификацию
        const result = await loginUseCase.execute(validatedInput as TelegramAuthInput)

        return {
          success: true,
          message: result.isNewUser ? 'Добро пожаловать в BuddyBot!' : 'С возвращением!',
          user: result.user,
          tokens: {
            accessToken: result.tokens.accessToken,
            refreshToken: result.tokens.refreshToken,
            expiresIn: 15 * 60, // 15 минут
            tokenType: 'Bearer'
          },
          isNewUser: result.isNewUser,
          permissions: result.permissions
        }
      } catch (error) {
        console.error('❌ Ошибка входа:', error)
        return {
          success: false,
          message: error.message || 'Ошибка аутентификации',
          user: null,
          tokens: null,
          isNewUser: false,
          permissions: []
        }
      }
    }
  }),

  /**
   * Обновление access токена
   */
  refreshToken: t.field({
    type: 'RefreshTokenResult',
    description: 'Обновление access токена с помощью refresh токена',
    authScopes: { public: true },
    args: {
      input: t.arg({ type: 'RefreshTokenInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        // Валидируем входные данные
        const validatedInput = RefreshTokenInputSchema.parse(input)

        // Создаем экземпляр Use Case
        const userService = new UserService(context.prisma.user as any)
        const loginUseCase = new LoginUseCase(
          userService,
          jwtService,
          { validateAuthData: () => true },
          process.env.TELEGRAM_BOT_TOKEN || ''
        )

        // Обновляем токены
        const tokens = await loginUseCase.refreshTokens(validatedInput.refreshToken)

        return {
          success: true,
          message: 'Токены успешно обновлены',
          tokens: {
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            expiresIn: 15 * 60, // 15 минут
            tokenType: 'Bearer'
          },
          errors: null
        }
      } catch (error) {
        console.error('❌ Ошибка обновления токена:', error)
        return {
          success: false,
          message: error.message || 'Ошибка обновления токена',
          tokens: null,
          errors: [{
            message: error.message || 'Недействительный refresh token',
            code: 'INVALID_REFRESH_TOKEN',
            field: 'refreshToken'
          }]
        }
      }
    }
  }),

  /**
   * Выход из системы
   */
  logout: t.field({
    type: 'MutationResult',
    description: 'Выход пользователя из системы',
    authScopes: { authenticated: true },
    args: {
      refreshToken: t.arg.string({ required: false })
    },
    resolve: async (_, { refreshToken }, context) => {
      try {
        const user = requireAuth(context)

        // Создаем экземпляр Use Case
        const userService = new UserService(context.prisma.user as any)
        const loginUseCase = new LoginUseCase(
          userService,
          jwtService,
          { validateAuthData: () => true },
          process.env.TELEGRAM_BOT_TOKEN || ''
        )

        // Выполняем выход
        await loginUseCase.logout(user.id, refreshToken || undefined)

        return {
          success: true,
          message: 'Выход выполнен успешно',
          errors: null
        }
      } catch (error) {
        handleResolverError(error)
      }
    }
  }),

  /**
   * Обновление профиля пользователя
   */
  updateProfile: t.field({
    type: 'UpdateUserResult',
    description: 'Обновление профиля текущего пользователя',
    authScopes: { authenticated: true },
    args: {
      input: t.arg({ type: 'UpdateUserProfileInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireAuth(context)

        // Валидируем входные данные
        const validatedInput = UpdateProfileInputSchema.parse(input)

        // Создаем сервис пользователей
        const userService = new UserService(context.prisma.user as any)

        // Обновляем профиль
        const updatedUser = await userService.updateUserProfile(
          currentUser.id,
          validatedInput,
          currentUser.id
        )

        return {
          success: true,
          message: 'Профиль успешно обновлен',
          user: updatedUser,
          errors: null
        }
      } catch (error) {
        console.error('❌ Ошибка обновления профиля:', error)
        return {
          success: false,
          message: error.message || 'Ошибка обновления профиля',
          user: null,
          errors: [{
            message: error.message || 'Неизвестная ошибка',
            code: 'UPDATE_PROFILE_ERROR',
            field: null
          }]
        }
      }
    }
  }),

  /**
   * Валидация токена доступа
   */
  validateToken: t.field({
    type: 'TokenValidationResult',
    description: 'Проверка действительности токена доступа',
    authScopes: { authenticated: true },
    resolve: async (_, args, context) => {
      try {
        const user = requireAuth(context)

        return {
          valid: true,
          user,
          expiresAt: null, // TODO: Получить время истечения из токена
          permissions: context.hasPermission ? [] : [] // TODO: Получить разрешения
        }
      } catch (error) {
        return {
          valid: false,
          user: null,
          expiresAt: null,
          permissions: []
        }
      }
    }
  })
}))

/**
 * Результат валидации токена
 */
builder.objectType('TokenValidationResult', {
  description: 'Результат валидации токена',
  fields: (t) => ({
    valid: t.boolean({
      description: 'Действителен ли токен'
    }),
    user: t.field({
      type: 'User',
      nullable: true,
      description: 'Пользователь, если токен действителен'
    }),
    expiresAt: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время истечения токена'
    }),
    permissions: t.stringList({
      description: 'Разрешения пользователя'
    })
  })
})

/**
 * Расширение для мутаций управления пользователями (только для админов)
 */
builder.mutationFields((t) => ({
  /**
   * Деактивация пользователя
   */
  deactivateUser: t.field({
    type: 'UpdateUserResult',
    description: 'Деактивация пользователя (только для админов)',
    authScopes: { admin: true },
    args: {
      userId: t.arg.id({ required: true }),
      reason: t.arg.string({ required: false })
    },
    resolve: async (_, { userId, reason }, context) => {
      try {
        const currentUser = requireAuth(context)
        const userService = new UserService(context.prisma.user as any)

        const deactivatedUser = await userService.deactivateUser(
          userId,
          currentUser.id
        )

        return {
          success: true,
          message: `Пользователь ${deactivatedUser.name} деактивирован`,
          user: deactivatedUser,
          errors: null
        }
      } catch (error) {
        console.error('❌ Ошибка деактивации пользователя:', error)
        return {
          success: false,
          message: error.message || 'Ошибка деактивации пользователя',
          user: null,
          errors: [{
            message: error.message || 'Неизвестная ошибка',
            code: 'DEACTIVATE_USER_ERROR',
            field: 'userId'
          }]
        }
      }
    }
  }),

  /**
   * Активация пользователя
   */
  activateUser: t.field({
    type: 'UpdateUserResult',
    description: 'Активация пользователя (только для админов)',
    authScopes: { admin: true },
    args: {
      userId: t.arg.id({ required: true })
    },
    resolve: async (_, { userId }, context) => {
      try {
        const currentUser = requireAuth(context)
        const userService = new UserService(context.prisma.user as any)

        const activatedUser = await userService.activateUser(
          userId,
          currentUser.id
        )

        return {
          success: true,
          message: `Пользователь ${activatedUser.name} активирован`,
          user: activatedUser,
          errors: null
        }
      } catch (error) {
        console.error('❌ Ошибка активации пользователя:', error)
        return {
          success: false,
          message: error.message || 'Ошибка активации пользователя',
          user: null,
          errors: [{
            message: error.message || 'Неизвестная ошибка',
            code: 'ACTIVATE_USER_ERROR',
            field: 'userId'
          }]
        }
      }
    }
  }),

  /**
   * Обновление ролей пользователя
   */
  updateUserRoles: t.field({
    type: 'UpdateUserResult',
    description: 'Обновление ролей пользователя (только для админов)',
    authScopes: { admin: true },
    args: {
      userId: t.arg.id({ required: true }),
      roles: t.arg({ type: ['Role'], required: true })
    },
    resolve: async (_, { userId, roles }, context) => {
      try {
        const currentUser = requireAuth(context)
        const userService = new UserService(context.prisma.user as any)

        const updatedUser = await userService.updateUserRoles({
          userId,
          roles,
          updatedBy: currentUser.id
        })

        return {
          success: true,
          message: `Роли пользователя ${updatedUser.name} обновлены`,
          user: updatedUser,
          errors: null
        }
      } catch (error) {
        console.error('❌ Ошибка обновления ролей:', error)
        return {
          success: false,
          message: error.message || 'Ошибка обновления ролей',
          user: null,
          errors: [{
            message: error.message || 'Неизвестная ошибка',
            code: 'UPDATE_ROLES_ERROR',
            field: 'roles'
          }]
        }
      }
    }
  })
}))

export {}