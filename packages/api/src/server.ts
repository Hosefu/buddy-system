/**
 * Главный сервер BuddyBot API
 * 
 * Точка входа для всего API сервера. Настраивает и запускает:
 * - Express сервер с middleware
 * - GraphQL API с Apollo Server
 * - Подключение к базе данных
 * - Redis для кеширования и сессий
 * - Telegram webhook
 * - Система мониторинга и логирования
 * - Graceful shutdown
 * 
 * Архитектура:
 * Express → Middleware → Apollo GraphQL → Services → Repositories → Database
 */

import express from 'express'
import { ApolloServer } from 'apollo-server-express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/lib/use/ws'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'

// Конфигурация и схема
import { config, logConfig, isProduction, isDevelopment } from './config'
import { schema, createGraphQLContext } from './schema'

// Middleware
import { AuthMiddleware, jwtService } from './middleware/auth.middleware'
import { errorHandlerMiddleware, notFoundMiddleware, setupGlobalErrorHandlers, formatGraphQLError } from './middleware/error-handler.middleware'

// Инфраструктура
import { prisma, checkDatabaseConnection, disconnectPrisma } from '@buddybot/database/client'

// Сервисы и репозитории
import { UserRepository } from './core/repositories/UserRepository'
import { FlowRepository } from './core/repositories/FlowRepository'
import { FlowAssignmentRepository } from './core/repositories/FlowAssignmentRepository'
import { UserService } from './core/services/user/UserService'
import { FlowService } from './core/services/flow/FlowService'
import { FlowAssignmentService } from './core/services/assignment/FlowAssignmentService'

/**
 * Класс основного сервера приложения
 */
class BuddyBotServer {
  private app: express.Application
  private httpServer: any
  private apolloServer: ApolloServer | null = null
  private wsServer: WebSocketServer | null = null
  
  // Сервисы
  private userService: UserService
  private flowService: FlowService
  private assignmentService: FlowAssignmentService
  private authMiddleware: AuthMiddleware

  constructor() {
    this.app = express()
    this.httpServer = createServer(this.app)
    
    // Инициализируем репозитории
    const userRepository = new UserRepository()
    const flowRepository = new FlowRepository()
    const assignmentRepository = new FlowAssignmentRepository()
    
    // Инициализируем сервисы
    this.userService = new UserService(userRepository)
    this.flowService = new FlowService(flowRepository, userRepository)
    this.assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)
    
    // Инициализируем middleware аутентификации
    this.authMiddleware = new AuthMiddleware(this.userService, jwtService)
  }

  /**
   * Настраивает базовые middleware Express
   */
  private setupExpressMiddleware(): void {
    console.log('⚙️ Настройка Express middleware...')

    // Безопасность
    this.app.use(helmet({
      contentSecurityPolicy: isDevelopment ? false : undefined,
      crossOriginEmbedderPolicy: false
    }))

    // CORS
    this.app.use(cors({
      origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(','),
      credentials: config.CORS_CREDENTIALS,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }))

    // Сжатие
    this.app.use(compression())

    // Парсинг JSON
    this.app.use(express.json({ limit: '10mb' }))
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }))

    // Логирование запросов
    if (isDevelopment) {
      this.app.use(morgan('dev'))
    } else {
      this.app.use(morgan('combined'))
    }

    // Rate limiting
    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: {
        error: 'Слишком много запросов, попробуйте позже',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Более мягкие ограничения для GraphQL endpoint
      skip: (req) => req.path === '/graphql' && isProduction === false
    })

    this.app.use(limiter)

    console.log('✅ Express middleware настроены')
  }

  /**
   * Настраивает базовые маршруты
   */
  private setupRoutes(): void {
    console.log('🛣️ Настройка маршрутов...')

    // Проверка здоровья системы
    this.app.get('/health', async (req, res) => {
      try {
        const dbHealthy = await checkDatabaseConnection()
        
        const health = {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          version: process.env.npm_package_version || '1.0.0',
          environment: config.NODE_ENV,
          services: {
            database: dbHealthy ? 'healthy' : 'unhealthy',
            // TODO: Добавить проверки других сервисов
            redis: 'unknown',
            telegram: 'unknown'
          }
        }

        res.status(dbHealthy ? 200 : 503).json(health)
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
        version: process.env.npm_package_version || '1.0.0',
        apiVersion: config.API_VERSION,
        environment: config.NODE_ENV,
        buildDate: process.env.BUILD_DATE || new Date().toISOString()
      })
    })

    // Telegram webhook (будет добавлен позже)
    this.app.post('/webhooks/telegram', (req, res) => {
      // TODO: Обработка Telegram webhook
      console.log('📱 Получен Telegram webhook:', req.body)
      res.status(200).json({ ok: true })
    })

    console.log('✅ Маршруты настроены')
  }

  /**
   * Настраивает Apollo GraphQL сервер
   */
  private async setupApolloServer(): Promise<void> {
    console.log('🚀 Настройка Apollo GraphQL сервера...')

    this.apolloServer = new ApolloServer({
      schema,
      context: ({ req, res }) => {
        // Создаем контекст аутентификации
        const authContext = this.authMiddleware.createAuthContext(req as any)
        return createGraphQLContext(authContext)
      },
      formatError: formatGraphQLError,
      
      // Настройки для разработки
      introspection: config.GRAPHQL_INTROSPECTION,
      
      // Плагины для мониторинга и метрик
      plugins: [
        // Логирование запросов
        {
          requestDidStart() {
            return {
              didResolveOperation({ operationName, variables }) {
                if (isDevelopment) {
                  console.log(`📊 GraphQL операция: ${operationName}`)
                }
              },
              didEncounterErrors({ errors, operationName }) {
                console.error(`❌ GraphQL ошибки в операции ${operationName}:`, errors)
              }
            }
          }
        },
        
        // TODO: Добавить плагины для Apollo Studio, если ключ настроен
        // ...(config.APOLLO_STUDIO_API_KEY ? [ApolloServerPluginUsageReporting()] : [])
      ],

      // Настройки безопасности для production
      ...(isProduction && {
        introspection: false,
        debug: false
      })
    })

    await this.apolloServer.start()
    
    // Применяем middleware Apollo к Express
    this.apolloServer.applyMiddleware({ 
      app: this.app, 
      path: '/graphql',
      cors: false // CORS уже настроен на уровне Express
    })

    console.log(`✅ GraphQL сервер запущен на /graphql`)
  }

  /**
   * Настраивает WebSocket сервер для подписок
   */
  private setupWebSocketServer(): void {
    console.log('🔌 Настройка WebSocket сервера для подписок...')

    this.wsServer = new WebSocketServer({
      server: this.httpServer,
      path: '/graphql'
    })

    // Настраиваем GraphQL подписки через WebSocket
    useServer(
      {
        schema,
        context: async (ctx, msg, args) => {
          // TODO: Аутентификация для WebSocket соединений
          // Можно передавать токен через connection params
          return createGraphQLContext({
            user: undefined,
            isAuthenticated: false,
            hasRole: () => false,
            hasPermission: () => false,
            requireAuth: () => { throw new Error('WebSocket authentication required') },
            requireRole: () => { throw new Error('WebSocket authentication required') }
          })
        },
        onConnect: async (ctx) => {
          console.log('🔌 WebSocket соединение установлено')
        },
        onDisconnect: async (ctx) => {
          console.log('🔌 WebSocket соединение закрыто')
        }
      },
      this.wsServer
    )

    console.log('✅ WebSocket сервер настроен')
  }

  /**
   * Настраивает обработку ошибок
   */
  private setupErrorHandling(): void {
    console.log('🚨 Настройка обработки ошибок...')

    // Глобальные обработчики ошибок процесса
    setupGlobalErrorHandlers()

    // Middleware для 404 ошибок
    this.app.use(notFoundMiddleware)

    // Центральный обработчик ошибок Express
    this.app.use(errorHandlerMiddleware)

    console.log('✅ Обработка ошибок настроена')
  }

  /**
   * Проверяет соединения с внешними сервисами
   */
  private async checkExternalServices(): Promise<void> {
    console.log('🔍 Проверка подключений к внешним сервисам...')

    // Проверяем подключение к базе данных
    const dbConnected = await checkDatabaseConnection()
    if (!dbConnected) {
      throw new Error('❌ Не удалось подключиться к базе данных')
    }
    console.log('✅ База данных подключена')

    // TODO: Проверяем Redis
    // TODO: Проверяем Telegram Bot API

    console.log('✅ Все внешние сервисы доступны')
  }

  /**
   * Настраивает graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n📶 Получен сигнал ${signal}, начинаем graceful shutdown...`)

      // Даем время на завершение текущих запросов
      this.httpServer.close((err) => {
        if (err) {
          console.error('❌ Ошибка при закрытии HTTP сервера:', err)
        } else {
          console.log('✅ HTTP сервер закрыт')
        }
      })

      // Закрываем Apollo Server
      if (this.apolloServer) {
        await this.apolloServer.stop()
        console.log('✅ Apollo Server остановлен')
      }

      // Закрываем WebSocket сервер
      if (this.wsServer) {
        this.wsServer.close()
        console.log('✅ WebSocket сервер закрыт')
      }

      // Закрываем соединение с базой данных
      try {
        await disconnectPrisma()
        console.log('✅ Соединение с базой данных закрыто')
      } catch (error) {
        console.error('❌ Ошибка при закрытии соединения с БД:', error)
      }

      // TODO: Закрыть другие соединения (Redis, внешние API)

      console.log('👋 Graceful shutdown завершен')
      process.exit(0)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  }

  /**
   * Запускает сервер
   */
  async start(): Promise<void> {
    try {
      console.log('🚀 Запуск BuddyBot API сервера...')
      
      // Логируем конфигурацию
      logConfig()

      // Проверяем внешние сервисы
      await this.checkExternalServices()

      // Настраиваем компоненты
      this.setupExpressMiddleware()
      this.setupRoutes()
      await this.setupApolloServer()
      this.setupWebSocketServer()
      this.setupErrorHandling()
      this.setupGracefulShutdown()

      // Запускаем HTTP сервер
      this.httpServer.listen(config.PORT, () => {
        console.log('\n🎉 BuddyBot API сервер успешно запущен!')
        console.log(`📍 HTTP сервер: http://localhost:${config.PORT}`)
        console.log(`🚀 GraphQL API: http://localhost:${config.PORT}/graphql`)
        
        if (config.GRAPHQL_PLAYGROUND) {
          console.log(`🎮 GraphQL Playground: http://localhost:${config.PORT}/graphql`)
        }
        
        console.log(`🔌 WebSocket (подписки): ws://localhost:${config.PORT}/graphql`)
        console.log(`❤️ Health check: http://localhost:${config.PORT}/health`)
        console.log(`📋 Окружение: ${config.NODE_ENV}`)
        console.log('📖 API готов к работе!\n')
      })

    } catch (error) {
      console.error('💀 Критическая ошибка при запуске сервера:', error)
      process.exit(1)
    }
  }

  /**
   * Останавливает сервер
   */
  async stop(): Promise<void> {
    console.log('🛑 Остановка сервера...')
    
    if (this.httpServer) {
      this.httpServer.close()
    }
    
    if (this.apolloServer) {
      await this.apolloServer.stop()
    }
    
    await disconnectPrisma()
    console.log('✅ Сервер остановлен')
  }
}

/**
 * Создаем и запускаем сервер, если файл запущен напрямую
 */
async function bootstrap() {
  const server = new BuddyBotServer()
  await server.start()
}

// Запускаем сервер только если файл вызван напрямую (не через import)
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('💀 Фатальная ошибка при запуске:', error)
    process.exit(1)
  })
}

export { BuddyBotServer }