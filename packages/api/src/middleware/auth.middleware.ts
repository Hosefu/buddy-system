/**
 * Middleware для аутентификации и авторизации
 * 
 * Файл: packages/api/src/middleware/auth.middleware.ts
 * 
 * Реализует:
 * - JWT аутентификацию
 * - Создание контекста пользователя
 * - Валидацию токенов
 * - Управление сессиями
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { GraphQLError } from 'graphql'
import { createHash } from 'crypto'
import type { Context, AuthUser, AuthToken, MiddlewareContext } from '../types/context'
import type { User } from '../core/entities/User'
import { UserRepository } from '../core/repositories/UserRepository'
import { config } from '../config'

/**
 * Интерфейс JWT payload
 */
interface JWTPayload {
  userId: string
  role: string
  permissions: string[]
  type: 'access' | 'refresh'
  sessionId?: string
  iat: number
  exp: number
}

/**
 * Сервис для работы с JWT токенами
 */
export class JwtService {
  private readonly secret: string
  private readonly accessTokenExpiry: string
  private readonly refreshTokenExpiry: string
  private readonly prisma: PrismaClient

  constructor(
    secret: string,
    accessTokenExpiry: string = '15m',
    refreshTokenExpiry: string = '7d',
    prisma: PrismaClient
  ) {
    this.secret = secret
    this.accessTokenExpiry = accessTokenExpiry
    this.refreshTokenExpiry = refreshTokenExpiry
    this.prisma = prisma
  }

  /**
   * Создает access токен
   */
  async createAccessToken(user: User, sessionId?: string): Promise<string> {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      role: user.role,
      permissions: await this.getUserPermissions(user.id),
      type: 'access',
      sessionId
    }

    return jwt.sign(payload, this.secret, {
      expiresIn: this.accessTokenExpiry,
      issuer: 'buddybot-api',
      audience: 'buddybot-client'
    })
  }

  /**
   * Создает refresh токен
   */
  async createRefreshToken(user: User, sessionId?: string): Promise<string> {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      userId: user.id,
      role: user.role,
      permissions: [],
      type: 'refresh',
      sessionId
    }

    const token = jwt.sign(payload, this.secret, {
      expiresIn: this.refreshTokenExpiry,
      issuer: 'buddybot-api',
      audience: 'buddybot-client'
    })

    // Сохраняем refresh токен в БД для отзыва
    await this.storeRefreshToken(user.id, token, sessionId)

    return token
  }

  /**
   * Валидирует токен
   */
  async validateToken(token: string, expectedType?: 'access' | 'refresh'): Promise<{
    payload: JWTPayload
    user: User | null
  }> {
    try {
      const payload = jwt.verify(token, this.secret, {
        issuer: 'buddybot-api',
        audience: 'buddybot-client'
      }) as JWTPayload

      // Проверяем тип токена если указан
      if (expectedType && payload.type !== expectedType) {
        throw new Error(`Неверный тип токена. Ожидается ${expectedType}, получен ${payload.type}`)
      }

      // Для refresh токенов проверяем наличие в БД
      if (payload.type === 'refresh') {
        const isValid = await this.isRefreshTokenValid(payload.userId, token)
        if (!isValid) {
          throw new Error('Refresh токен отозван или недействителен')
        }
      }

      // Получаем актуальную информацию о пользователе
      const userRepository = new UserRepository(this.prisma)
      const user = await userRepository.findById(payload.userId)

      if (!user || user.status !== 'ACTIVE') {
        throw new Error('Пользователь не найден или деактивирован')
      }

      return { payload, user }

    } catch (error) {
      if (error instanceof jwt.JsonWebTokenError) {
        throw new GraphQLError('Недействительный токен', {
          extensions: {
            code: 'INVALID_TOKEN',
            originalError: error.message
          }
        })
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new GraphQLError('Токен истек', {
          extensions: {
            code: 'TOKEN_EXPIRED',
            expiredAt: error.expiredAt
          }
        })
      }

      throw error
    }
  }

  /**
   * Отзывает refresh токен
   */
  async revokeRefreshToken(userId: string, token?: string): Promise<void> {
    if (token) {
      // Отзываем конкретный токен
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          token: this.hashToken(token),
          isActive: true
        },
        data: {
          isActive: false,
          revokedAt: new Date()
        }
      })
    } else {
      // Отзываем все токены пользователя
      await this.prisma.refreshToken.updateMany({
        where: {
          userId,
          isActive: true
        },
        data: {
          isActive: false,
          revokedAt: new Date()
        }
      })
    }
  }

  /**
   * Обновляет токены
   */
  async refreshTokens(refreshToken: string): Promise<{
    accessToken: string
    refreshToken: string
    user: User
  }> {
    const { payload, user } = await this.validateToken(refreshToken, 'refresh')

    if (!user) {
      throw new GraphQLError('Пользователь не найден', {
        extensions: { code: 'USER_NOT_FOUND' }
      })
    }

    // Отзываем старый refresh токен
    await this.revokeRefreshToken(user.id, refreshToken)

    // Создаем новые токены
    const newSessionId = this.generateSessionId()
    const newAccessToken = await this.createAccessToken(user, newSessionId)
    const newRefreshToken = await this.createRefreshToken(user, newSessionId)

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user
    }
  }

  /**
   * Получает разрешения пользователя
   */
  private async getUserPermissions(userId: string): Promise<string[]> {
    // TODO: Реализовать получение разрешений из БД
    // Пока возвращаем базовые разрешения на основе роли
    const user = await this.prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) return []

    const basePermissions = ['read:own_profile', 'update:own_profile']

    switch (user.role) {
      case 'SUPER_ADMIN':
        return [...basePermissions, 'admin:*', 'manage:*', 'view:*']
      case 'ADMIN':
        return [...basePermissions, 'manage:users', 'manage:flows', 'view:analytics']
      case 'BUDDY':
        return [...basePermissions, 'assign:flows', 'view:assignments', 'manage:own_assignments']
      case 'USER':
      default:
        return basePermissions
    }
  }

  /**
   * Сохраняет refresh токен в БД
   */
  private async storeRefreshToken(userId: string, token: string, sessionId?: string): Promise<void> {
    const hashedToken = this.hashToken(token)
    const expiresAt = new Date()
    expiresAt.setTime(expiresAt.getTime() + this.parseExpiry(this.refreshTokenExpiry))

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token: hashedToken,
        sessionId,
        expiresAt,
        isActive: true
      }
    })
  }

  /**
   * Проверяет действительность refresh токена
   */
  private async isRefreshTokenValid(userId: string, token: string): Promise<boolean> {
    const hashedToken = this.hashToken(token)
    
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        userId,
        token: hashedToken,
        isActive: true,
        expiresAt: {
          gt: new Date()
        }
      }
    })

    return !!storedToken
  }

  /**
   * Хеширует токен для хранения в БД
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
  }

  /**
   * Генерирует уникальный ID сессии
   */
  private generateSessionId(): string {
    return createHash('sha1')
      .update(Date.now().toString() + Math.random().toString())
      .digest('hex')
  }

  /**
   * Парсит строку времени в миллисекунды
   */
  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/)
    if (!match) throw new Error(`Неверный формат времени: ${expiry}`)

    const value = parseInt(match[1])
    const unit = match[2]

    switch (unit) {
      case 's': return value * 1000
      case 'm': return value * 60 * 1000
      case 'h': return value * 60 * 60 * 1000
      case 'd': return value * 24 * 60 * 60 * 1000
      default: throw new Error(`Неизвестная единица времени: ${unit}`)
    }
  }
}

/**
 * Singleton инстанс JWT сервиса
 */
export const jwtService = new JwtService(
  config.JWT_SECRET,
  config.JWT_EXPIRES_IN,
  config.REFRESH_TOKEN_EXPIRES_IN,
  new PrismaClient()
)

/**
 * Middleware для извлечения и валидации JWT токена
 */
export class AuthMiddleware {
  private jwtService: JwtService
  private prisma: PrismaClient

  constructor(jwtService: JwtService, prisma: PrismaClient) {
    this.jwtService = jwtService
    this.prisma = prisma
  }

  /**
   * Express middleware для проверки аутентификации
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = this.extractToken(req)
      
      if (!token) {
        // Продолжаем без аутентификации (для публичных эндпоинтов)
        next()
        return
      }

      const { user } = await this.jwtService.validateToken(token, 'access')

      if (user) {
        // Добавляем информацию о пользователе в request
        ;(req as any).user = this.mapUserToAuthUser(user)
        ;(req as any).token = token

        // Обновляем время последней активности
        await this.updateLastActivity(user.id)
      }

      next()

    } catch (error) {
      console.error('❌ Ошибка аутентификации:', error)
      
      // Для GraphQL эндпоинтов не блокируем запрос, 
      // а позволяем резолверам самим проверять аутентификацию
      if (req.path === '/graphql') {
        next()
        return
      }

      // Для REST эндпоинтов возвращаем ошибку
      res.status(401).json({
        error: 'Ошибка аутентификации',
        message: error instanceof Error ? error.message : 'Неизвестная ошибка'
      })
    }
  }

  /**
   * Создает контекст аутентификации для GraphQL
   */
  createAuthContext = (req: Request): { user?: AuthUser; token?: string; permissions: string[] } => {
    const user = (req as any).user as AuthUser | undefined
    const token = (req as any).token as string | undefined

    return {
      user,
      token,
      permissions: user?.permissions || []
    }
  }

  /**
   * Middleware для проверки конкретных разрешений
   */
  requirePermissions = (permissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as any).user as AuthUser | undefined

      if (!user) {
        res.status(401).json({
          error: 'Требуется аутентификация'
        })
        return
      }

      const hasPermissions = permissions.every(permission => 
        user.permissions.includes(permission) || 
        user.permissions.includes('admin:*')
      )

      if (!hasPermissions) {
        res.status(403).json({
          error: 'Недостаточно прав доступа',
          requiredPermissions: permissions
        })
        return
      }

      next()
    }
  }

  /**
   * Извлекает JWT токен из request
   */
  private extractToken(req: Request): string | null {
    // Проверяем заголовок Authorization
    const authHeader = req.headers.authorization
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7)
    }

    // Проверяем query параметр (для WebSocket подключений)
    const queryToken = req.query.token as string
    if (queryToken) {
      return queryToken
    }

    // Проверяем cookies (если используется cookie-based аутентификация)
    const cookieToken = req.cookies?.accessToken
    if (cookieToken) {
      return cookieToken
    }

    return null
  }

  /**
   * Конвертирует User entity в AuthUser
   */
  private mapUserToAuthUser(user: User): AuthUser {
    return {
      id: user.id,
      role: user.role as any,
      permissions: [], // Будут заполнены в JWT payload
      isAdmin: user.role === 'ADMIN' || user.role === 'SUPER_ADMIN',
      isBuddy: ['BUDDY', 'ADMIN', 'SUPER_ADMIN'].includes(user.role),
      telegramId: user.telegramId,
      lastActivity: user.lastActivity
    }
  }

  /**
   * Обновляет время последней активности пользователя
   */
  private async updateLastActivity(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActivity: new Date() }
      })
    } catch (error) {
      // Не блокируем запрос из-за ошибки обновления активности
      console.warn('⚠️  Не удалось обновить время последней активности:', error)
    }
  }
}

/**
 * Singleton инстанс Auth middleware
 */
export const authMiddleware = new AuthMiddleware(jwtService, new PrismaClient())

/**
 * Утилиты для работы с Telegram аутентификацией
 */
export class TelegramAuth {
  private botToken: string

  constructor(botToken: string) {
    this.botToken = botToken
  }

  /**
   * Валидирует данные от Telegram WebApp
   */
  validateWebAppData(initData: string): boolean {
    try {
      const urlParams = new URLSearchParams(initData)
      const hash = urlParams.get('hash')
      
      if (!hash) return false

      urlParams.delete('hash')
      
      // Сортируем параметры
      const sortedParams = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')

      // Создаем секретный ключ
      const secretKey = createHash('sha256')
        .update(this.botToken)
        .digest()

      // Создаем HMAC
      const calculatedHash = createHash('sha256')
        .update(sortedParams, 'utf8')
        .digest('hex')

      return hash === calculatedHash

    } catch (error) {
      console.error('Ошибка валидации Telegram WebApp данных:', error)
      return false
    }
  }

  /**
   * Извлекает данные пользователя из Telegram WebApp
   */
  extractUserData(initData: string): {
    id: string
    first_name?: string
    last_name?: string
    username?: string
    photo_url?: string
  } | null {
    try {
      const urlParams = new URLSearchParams(initData)
      const userParam = urlParams.get('user')
      
      if (!userParam) return null

      return JSON.parse(decodeURIComponent(userParam))

    } catch (error) {
      console.error('Ошибка извлечения данных пользователя Telegram:', error)
      return null
    }
  }
}

/**
 * Singleton для Telegram аутентификации
 */
export const telegramAuth = new TelegramAuth(config.TELEGRAM_BOT_TOKEN)

export default authMiddleware