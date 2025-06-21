/**
 * Типы контекста для GraphQL резолверов
 * 
 * Файл: packages/api/src/types/context.ts
 * 
 * Определяет структуру контекста, который передается во все резолверы.
 * Содержит информацию о пользователе, подключения к БД, сервисы и утилиты.
 */

import { PrismaClient } from '@prisma/client'
import { Redis } from 'ioredis'
import { Request, Response } from 'express'
import type { User } from '../core/entities/User'
import type { EventBus } from '../infrastructure/events/EventBus'

/**
 * Основной контекст GraphQL
 */
export interface Context {
  // Аутентификация и авторизация
  user?: User
  token?: string
  permissions: string[]
  
  // Подключения к базам данных
  prisma: PrismaClient
  redis?: Redis
  
  // Event-driven архитектура
  eventBus?: EventBus
  
  // HTTP контекст (для access к request/response если нужно)
  req?: Request
  res?: Response
  
  // Утилиты контекста
  isAuthenticated(): boolean
  hasPermission(permission: string): boolean
  hasRole(role: string): boolean
  
  // Метаданные запроса
  requestId?: string
  userAgent?: string
  clientIP?: string
  
  // Настройки и конфигурация
  config?: AppConfig
  
  // Логирование и мониторинг
  logger?: Logger
  metrics?: MetricsCollector
}

/**
 * Конфигурация приложения
 */
export interface AppConfig {
  // Окружение
  NODE_ENV: 'development' | 'production' | 'test'
  PORT: number
  API_VERSION: string
  
  // База данных
  DATABASE_URL: string
  REDIS_URL?: string
  
  // Аутентификация
  JWT_SECRET: string
  JWT_EXPIRES_IN: string
  REFRESH_TOKEN_EXPIRES_IN: string
  
  // Telegram
  TELEGRAM_BOT_TOKEN: string
  TELEGRAM_WEBHOOK_URL?: string
  
  // Email
  EMAIL_PROVIDER?: 'sendgrid' | 'mailgun' | 'smtp'
  EMAIL_API_KEY?: string
  EMAIL_FROM?: string
  
  // Файловое хранилище
  STORAGE_PROVIDER: 'local' | 's3' | 'gcs'
  STORAGE_BUCKET?: string
  AWS_REGION?: string
  AWS_ACCESS_KEY_ID?: string
  AWS_SECRET_ACCESS_KEY?: string
  
  // Мониторинг
  SENTRY_DSN?: string
  APOLLO_STUDIO_API_KEY?: string
  
  // GraphQL
  GRAPHQL_INTROSPECTION: boolean
  GRAPHQL_PLAYGROUND: boolean
  
  // Безопасность
  CORS_ORIGINS: string[]
  RATE_LIMIT_MAX: number
  RATE_LIMIT_WINDOW_MS: number
  
  // Особенности
  ENABLE_SUBSCRIPTIONS: boolean
  ENABLE_APOLLO_TRACING: boolean
}

/**
 * Интерфейс для логгера
 */
export interface Logger {
  debug(message: string, meta?: any): void
  info(message: string, meta?: any): void
  warn(message: string, meta?: any): void
  error(message: string, error?: Error, meta?: any): void
  fatal(message: string, error?: Error, meta?: any): void
}

/**
 * Интерфейс для сбора метрик
 */
export interface MetricsCollector {
  // Счетчики
  incrementCounter(name: string, labels?: Record<string, string>): void
  
  // Гистограммы (для измерения времени)
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void
  
  // Измерители
  setGauge(name: string, value: number, labels?: Record<string, string>): void
  
  // Время выполнения
  startTimer(name: string, labels?: Record<string, string>): () => void
}

/**
 * Информация о пользователе для контекста
 */
export interface AuthUser {
  id: string
  role: 'USER' | 'BUDDY' | 'ADMIN' | 'SUPER_ADMIN'
  permissions: string[]
  isAdmin: boolean
  isBuddy: boolean
  telegramId?: string
  lastActivity?: Date
}

/**
 * Токен аутентификации
 */
export interface AuthToken {
  userId: string
  role: string
  permissions: string[]
  type: 'access' | 'refresh'
  expiresAt: Date
  issuedAt: Date
}

/**
 * Результат аутентификации
 */
export interface AuthResult {
  user: AuthUser
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * Контекст для middleware
 */
export interface MiddlewareContext {
  req: Request
  res: Response
  user?: AuthUser
  token?: string
  startTime: number
  requestId: string
}

/**
 * Контекст для событий
 */
export interface EventContext {
  userId?: string
  requestId?: string
  source: 'graphql' | 'webhook' | 'cron' | 'manual'
  timestamp: Date
  metadata?: Record<string, any>
}

/**
 * Настройки пагинации
 */
export interface PaginationArgs {
  first?: number
  after?: string
  last?: number
  before?: string
}

/**
 * Результат пагинации
 */
export interface PaginationResult<T> {
  edges: Array<{
    node: T
    cursor: string
  }>
  pageInfo: {
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor?: string
    endCursor?: string
  }
  totalCount: number
}

/**
 * Фильтры для поиска
 */
export interface SearchFilters {
  query?: string
  dateFrom?: Date
  dateTo?: Date
  status?: string[]
  tags?: string[]
  createdBy?: string
  [key: string]: any
}

/**
 * Параметры сортировки
 */
export interface SortOptions {
  field: string
  direction: 'ASC' | 'DESC'
}

/**
 * Опции запроса
 */
export interface QueryOptions {
  pagination?: PaginationArgs
  filters?: SearchFilters
  sort?: SortOptions[]
  include?: string[]
  exclude?: string[]
}

/**
 * Результат операции
 */
export interface OperationResult<T = any> {
  success: boolean
  data?: T
  errors?: string[]
  message?: string
  code?: string
}

/**
 * Права доступа
 */
export interface Permission {
  id: string
  name: string
  description: string
  resource: string
  action: string
}

/**
 * Контекст безопасности
 */
export interface SecurityContext {
  user?: AuthUser
  permissions: Permission[]
  ipAddress: string
  userAgent: string
  requestId: string
  timestamp: Date
}

/**
 * Настройки кеширования
 */
export interface CacheOptions {
  key: string
  ttl: number // время жизни в секундах
  tags?: string[] // теги для инвалидации
}

/**
 * Контекст кеширования
 */
export interface CacheContext {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  del(key: string): Promise<void>
  delByPattern(pattern: string): Promise<void>
  delByTags(tags: string[]): Promise<void>
}

/**
 * Утилиты для работы с контекстом
 */
export namespace ContextUtils {
  /**
   * Создает базовый контекст для тестов
   */
  export function createTestContext(overrides?: Partial<Context>): Context {
    return {
      user: undefined,
      token: undefined,
      permissions: [],
      prisma: {} as PrismaClient, // Mock для тестов
      isAuthenticated: () => false,
      hasPermission: () => false,
      hasRole: () => false,
      ...overrides
    }
  }
  
  /**
   * Проверяет, есть ли у пользователя необходимые права
   */
  export function checkPermissions(context: Context, requiredPermissions: string[]): boolean {
    if (!context.user) return false
    
    return requiredPermissions.every(permission => 
      context.hasPermission(permission)
    )
  }
  
  /**
   * Получает ID текущего пользователя или бросает ошибку
   */
  export function getCurrentUserId(context: Context): string {
    if (!context.user) {
      throw new Error('Пользователь не аутентифицирован')
    }
    return context.user.id
  }
  
  /**
   * Проверяет, может ли пользователь выполнить действие над ресурсом
   */
  export function canAccessResource(
    context: Context, 
    resourceOwnerId: string,
    requiredPermission?: string
  ): boolean {
    if (!context.user) return false
    
    // Владелец ресурса всегда может к нему обращаться
    if (context.user.id === resourceOwnerId) return true
    
    // Админы могут обращаться ко всем ресурсам
    if (context.user.isAdmin) return true
    
    // Проверяем специфичное разрешение если указано
    if (requiredPermission && context.hasPermission(requiredPermission)) {
      return true
    }
    
    return false
  }
}

/**
 * Типы для event-driven архитектуры
 */
export interface DomainEvent {
  id: string
  type: string
  aggregateId: string
  aggregateType: string
  version: number
  timestamp: Date
  userId?: string
  data: any
  metadata?: Record<string, any>
}

export interface EventHandler<T = any> {
  handle(event: DomainEvent<T>, context: EventContext): Promise<void>
}

export interface EventBusInterface {
  publish(event: DomainEvent): Promise<void>
  subscribe<T>(eventType: string, handler: EventHandler<T>): void
  unsubscribe(eventType: string, handler: EventHandler): void
}

export default Context