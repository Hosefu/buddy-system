/**
 * Основной файл сервера BuddyBot API
 * 
 * Файл: packages/api/src/server.ts
 * 
 * Инициализирует и настраивает:
 * - Express сервер
 * - Apollo GraphQL сервер
 * - Middleware для аутентификации, CORS, логирования
 * - Подключения к базам данных
 * - WebSocket для подписок
 * - Обработку ошибок
 */

import express from 'express'
import { createServer } from 'http'
import { ApolloServer } from '@apollo/server'
import { expressMiddleware } from '@apollo/server/express4'
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer'
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/lib/use/ws'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

// Внутренние импорты
import { schema, createGraphQLContext, formatGraphQLError } from './schema'
import { authMiddleware } from './middleware/auth.middleware'
import { config } from './config'
import type { Context } from './types/context'

/**
 * Основной класс сервера
 */
export class BuddyBotServer {
  private app: express.Application
  private httpServer: any
  private apolloServer: ApolloServer<Context>
  private prisma: PrismaClient
  private redis?: Redis
  private wsServer?: WebSocketServer

  constructor() {
    this.app = express()
    this.prisma = new PrismaClient()
    
    // Инициализация Redis если настроен
    if (config.REDIS_URL) {
      this.redis = new Redis(config.REDIS_URL, {
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      })
    }
  }

  /**
   * Инициализация и запуск сервера
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Запуск BuddyBot API сервера...')

      // 1. Проверяем подключения к БД
      await this.checkDatabaseConnection()
      
      // 2. Настраиваем middleware
      this.setupMiddleware()
      
      // 3. Настраиваем маршруты
      this.setupRoutes()
      
      // 4. Создаем HTTP сервер
      this.httpServer = createServer(this.app)
      
      // 5. Настраиваем WebSocket для подписок (если включены)
      if (config.ENABLE_SUBSCRIPTIONS) {
        await this.setupWebSocket()
      }
      
      // 6. Настраиваем Apollo GraphQL сервер
      await this.setupApolloServer()
      
      // 7. Обработка graceful shutdown
      this.setupGracefulShutdown()
      
      // 8. Запускаем сервер
      const port = config.PORT || 4000
      this.httpServer.listen(port, () => {
        console.log(`✅ BuddyBot API сервер запущен на http://localhost:${port}`)
        console.log(`📊 GraphQL endpoint: http://localhost:${port}/graphql`)
        
        if (config.GRAPHQL_PLAYGROUND) {
          console.log(`🎮 GraphQL Playground: http://localhost:${port}/graphql`)
        }
        
        if (config.ENABLE_SUBSCRIPTIONS) {
          console.log(`🔌 WebSocket subscriptions: ws://localhost:${port}/graphql`)
        }
        
        console.log(`🌐 Environment: ${config.NODE_ENV}`)
        console.log(`📦 API Version: ${config.API_VERSION}`)
      })

    } catch (error) {
      console.error('❌ Ошибка запуска сервера:', error)
      process.exit(1)
    }
  }

  /**
   * Проверка подключения к базе данных
   */
  private async checkDatabaseConnection(): Promise<void> {
    try {
      console.log('🔗 Проверка подключения к PostgreSQL...')
      await this.prisma.$connect()
      console.log('✅ Подключение к PostgreSQL установлено')

      // Проверяем Redis если настроен
      if (this.redis) {
        console.log('🔗 Проверка подключения к Redis...')
        await this.redis.ping()
        console.log('✅ Подключение к Redis установлено')
      }

    } catch (error) {
      console.error('❌ Ошибка подключения к базе данных:', error)
      throw error
    }
  }

  /**
   * Настройка middleware
   */
  private setupMiddleware(): void {
    console.log('⚙️  Настройка middleware...')

    // Безопасность
    this.app.use(helmet({
      contentSecurityPolicy: config.NODE_ENV === 'production',
      crossOriginEmbedderPolicy: false
    }))

    // CORS
    this.app.use(cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-apollo-operation-name']
    }))

    // Сжатие ответов
    this.app.use(compression())

    // Парсинг JSON
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX,
      message: {
        error: 'Слишком много запросов',
        retryAfter: config.RATE_LIMIT_WINDOW_MS / 1000
      },
      standardHeaders: true,
      legacyHeaders: false
    })
    this.app.use('/graphql', limiter)

    // Логирование запросов
    this.app.use((req, res, next) => {
      const start = Date.now()
      res.on('finish', () => {
        const duration = Date.now() - start
        console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`)
      })
      next()
    })

    // Аутентификация
    this.app.use(authMiddleware.authenticate)

    console.log('✅ Middleware настроены')
  }

  /**
   * Настройка маршрутов
   */
  private setupRoutes(): void {
    console.log('🛣️  Настройка маршрутов...')

    // Health check
    this.app.get('/health', async (req, res) => {
      try {
        // Проверяем подключение к БД
        await this.prisma.$queryRaw`SELECT 1`
        const dbHealthy = true

        // Проверяем Redis если настроен
        let redisHealthy = true
        if (this.redis) {
          try {
            await this.redis.ping()
          } catch (error) {
            redisHealthy = false
          }
        }

        const health = {
          status: dbHealthy && redisHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          version: config.API_VERSION,
          environment: config.NODE_ENV,
          services: {
            database: dbHealthy ? 'healthy' : 'unhealthy',
            redis: this.redis ? (redisHealthy ? 'healthy' : 'unhealthy') : 'not_configured',
            graphql: 'healthy'
          },
          uptime: process.uptime()
        }

        res.status(dbHealthy && redisHealthy ? 200 : 503).json(health)
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        })
      }
    })

    // Информация о версии API
    this.app.get('/version', (req, res) => {
      res.json({
        version: config.API_VERSION,
        environment: config.NODE_ENV,
        buildDate: process.env.BUILD_DATE || new Date().toISOString(),
        nodeVersion: process.version,
        uptime: process.uptime()
      })
    })

    // Метрики (базовые)
    this.app.get('/metrics', (req, res) => {
      const memUsage = process.memoryUsage()
      res.json({
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
          external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
        },
        cpu: process.cpuUsage()
      })
    })

    // Telegram webhook
    this.app.post('/webhooks/telegram', express.raw({ type: 'application/json' }), (req, res) => {
      try {
        console.log('📱 Получен Telegram webhook')
        // TODO: Обработка Telegram webhook
        // const update = JSON.parse(req.body.toString())
        // await telegramBotHandler.handleUpdate(update)
        
        res.status(200).json({ ok: true })
      } catch (error) {
        console.error('❌ Ошибка обработки Telegram webhook:', error)
        res.status(500).json({ ok: false, error: 'Internal server error' })
      }
    })

    // Fallback для несуществующих маршрутов
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        availableRoutes: [
          'GET /health',
          'GET /version', 
          'GET /metrics',
          'POST /graphql',
          'GET /graphql (playground)',
          'POST /webhooks/telegram'
        ]
      })
    })

    console.log('✅ Маршруты настроены')
  }

  /**
   * Настройка WebSocket для GraphQL подписок
   */
  private async setupWebSocket(): Promise<void> {
    console.log('🔌 Настройка WebSocket для подписок...')

    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/graphql'
    })

    // Настраиваем обработчик WebSocket подключений
    const serverCleanup = useServer({
      schema,
      context: async (ctx) => {
        // Извлекаем токен из query параметров или заголовков
        const token = ctx.connectionParams?.authorization as string ||
                     ctx.connectionParams?.token as string

        if (token) {
          try {
            // Валидируем токен и создаем контекст
            const authContext = { token, user: undefined, permissions: [] }
            // TODO: Валидация токена для WebSocket
            return createGraphQLContext(authContext)
          } catch (error) {
            console.error('WebSocket auth error:', error)
            throw new Error('Unauthorized')
          }
        }

        // Возвращаем контекст без аутентификации
        return createGraphQLContext({ permissions: [] })
      },
      onConnect: (ctx) => {
        console.log('🔌 WebSocket подключение установлено')
      },
      onDisconnect: (ctx) => {
        console.log('🔌 WebSocket подключение закрыто')
      }
    }, this.wsServer)

    // Сохраняем cleanup функцию для graceful shutdown
    this.wsServer.on('close', serverCleanup)

    console.log('✅ WebSocket настроен')
  }

  /**
   * Настройка Apollo GraphQL сервера
   */
  private async setupApolloServer(): Promise<void> {
    console.log('🚀 Настройка Apollo GraphQL сервера...')

    this.apolloServer = new ApolloServer<Context>({
      schema,
      formatError: formatGraphQLError,
      introspection: config.GRAPHQL_INTROSPECTION,
      
      plugins: [
        // Graceful shutdown для HTTP сервера
        ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
        
        // Landing page настройки
        config.GRAPHQL_PLAYGROUND 
          ? ApolloServerPluginLandingPageLocalDefault({ footer: false })
          : ApolloServerPluginLandingPageLocalDefault({ footer: false }),
        
        // Логирование операций
        {
          requestDidStart() {
            return {
              didResolveOperation({ operationName, variables, request }) {
                if (config.NODE_ENV === 'development') {
                  console.log(`📊 GraphQL операция: ${operationName || 'Anonymous'}`)
                }
              },
              didEncounterErrors({ errors, operationName, request }) {
                console.error(`❌ GraphQL ошибки в операции ${operationName}:`)
                errors.forEach(error => {
                  console.error(`  - ${error.message}`)
                  if (config.NODE_ENV === 'development') {
                    console.error(`    Path: ${error.path?.join('.')}`)
                    console.error(`    Extensions:`, error.extensions)
                  }
                })
              },
              willSendResponse({ response }) {
                // Добавляем кастомные заголовки
                response.http?.headers.set('X-API-Version', config.API_VERSION)
              }
            }
          }
        }
      ]
    })

    await this.apolloServer.start()

    // Подключаем Apollo к Express
    this.app.use(
      '/graphql',
      expressMiddleware(this.apolloServer, {
        context: async ({ req, res }) => {
          // Создаем контекст аутентификации из Express middleware
          const authContext = authMiddleware.createAuthContext(req as any)
          const context = createGraphQLContext(authContext)
          
          // Добавляем req/res в контекст если нужны
          context.req = req
          context.res = res
          
          return context
        }
      })
    )

    console.log('✅ Apollo GraphQL сервер настроен')
  }

  /**
   * Настройка graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n📴 Получен сигнал ${signal}. Начинаем graceful shutdown...`)

      try {
        // Останавливаем Apollo сервер
        if (this.apolloServer) {
          await this.apolloServer.stop()
          console.log('✅ Apollo сервер остановлен')
        }

        // Закрываем WebSocket сервер
        if (this.wsServer) {
          this.wsServer.close()
          console.log('✅ WebSocket сервер остановлен')
        }

        // Закрываем HTTP сервер
        if (this.httpServer) {
          this.httpServer.close(() => {
            console.log('✅ HTTP сервер остановлен')
          })
        }

        // Закрываем подключения к БД
        await this.prisma.$disconnect()
        console.log('✅ Подключение к PostgreSQL закрыто')

        if (this.redis) {
          this.redis.disconnect()
          console.log('✅ Подключение к Redis закрыто')
        }

        console.log('👋 Graceful shutdown завершен')
        process.exit(0)

      } catch (error) {
        console.error('❌ Ошибка во время shutdown:', error)
        process.exit(1)
      }
    }

    // Обработчики сигналов
    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))

    // Обработчик необработанных ошибок
    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
      // Не завершаем процесс автоматически, логируем для анализа
    })

    process.on('uncaughtException', (error) => {
      console.error('❌ Uncaught Exception:', error)
      shutdown('UNCAUGHT_EXCEPTION')
    })
  }

  /**
   * Остановка сервера
   */
  async stop(): Promise<void> {
    console.log('🛑 Останавливаем сервер...')

    if (this.apolloServer) {
      await this.apolloServer.stop()
    }

    if (this.httpServer) {
      this.httpServer.close()
    }

    await this.prisma.$disconnect()

    if (this.redis) {
      this.redis.disconnect()
    }

    console.log('✅ Сервер остановлен')
  }
}

/**
 * Функция для запуска сервера (если файл запускается напрямую)
 */
async function main() {
  const server = new BuddyBotServer()
  await server.start()
}

// Запускаем сервер если файл выполняется напрямую
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Критическая ошибка при запуске сервера:', error)
    process.exit(1)
  })
}

export { BuddyBotServer }
export default BuddyBotServer