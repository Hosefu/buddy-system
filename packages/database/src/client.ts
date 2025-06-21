/**
 * Клиент Prisma для работы с базой данных BuddyBot
 * 
 * Этот файл конфигурирует и экспортирует единственный экземпляр Prisma Client
 * с настройками для логирования, middleware и расширениями функциональности.
 */

import { PrismaClient } from './generated'
import type { Prisma } from './generated'

/**
 * Глобальная переменная для хранения клиента Prisma в development
 * Предотвращает создание множественных соединений при hot reload
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Создание и конфигурация Prisma Client
 */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event', 
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
  errorFormat: 'pretty',
})

/**
 * Middleware для логирования медленных запросов
 * Записывает в лог все запросы, которые выполняются дольше 100ms
 */
prisma.$use(async (params, next) => {
  const before = Date.now()
  const result = await next(params)
  const after = Date.now()
  
  const executionTime = after - before
  
  // Логируем медленные запросы
  if (executionTime > 100) {
    console.log(`🐌 Медленный запрос (${executionTime}ms):`, {
      model: params.model,
      action: params.action,
      executionTime: `${executionTime}ms`
    })
  }

  return result
})

/**
 * Middleware для автоматического обновления счетчиков
 * Например, обновляет stepsCount в Flow при добавлении/удалении FlowStep
 */
prisma.$use(async (params, next) => {
  // Обновляем счетчик этапов в потоке
  if (params.model === 'FlowStep' && ['create', 'delete'].includes(params.action)) {
    const result = await next(params)
    
    if (params.action === 'create' && params.args?.data?.flowId) {
      await prisma.flow.update({
        where: { id: params.args.data.flowId },
        data: {
          stepsCount: {
            increment: 1
          }
        }
      })
    }
    
    if (params.action === 'delete' && result?.flowId) {
      await prisma.flow.update({
        where: { id: result.flowId },
        data: {
          stepsCount: {
            decrement: 1
          }
        }
      })
    }
    
    return result
  }
  
  // Обновляем счетчик компонентов в этапе
  if (params.model === 'FlowComponent' && ['create', 'delete'].includes(params.action)) {
    const result = await next(params)
    
    if (params.action === 'create' && params.args?.data?.stepId) {
      await prisma.flowStep.update({
        where: { id: params.args.data.stepId },
        data: {
          componentsCount: {
            increment: 1
          }
        }
      })
    }
    
    if (params.action === 'delete' && result?.stepId) {
      await prisma.flowStep.update({
        where: { id: result.stepId },
        data: {
          componentsCount: {
            decrement: 1
          }
        }
      })
    }
    
    return result
  }
  
  return next(params)
})

/**
 * Middleware для мягкого удаления (soft delete)
 * В текущей схеме не используется, но может быть полезно для будущих расширений
 */
prisma.$use(async (params, next) => {
  // Исключаем модели, которые можно безопасно удалять
  const allowHardDelete = ['Notification', 'DeadlineAdjustment']
  
  if (params.action === 'delete' && !allowHardDelete.includes(params.model || '')) {
    // Для большинства моделей используем деактивацию вместо удаления
    if (params.model === 'User') {
      params.action = 'update'
      params.args.data = { isActive: false }
    } else if (params.model === 'Flow') {
      params.action = 'update'
      params.args.data = { isActive: false }
    }
  }
  
  return next(params)
})

/**
 * Подписка на события логирования Prisma
 */
prisma.$on('query', (e: any) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Query:', e.query)
    console.log('📝 Params:', e.params)
    console.log('⏱️ Duration:', `${e.duration}ms`)
  }
})

prisma.$on('error', (e: any) => {
  console.error('❌ Prisma Error:', e)
})

prisma.$on('warn', (e: any) => {
  console.warn('⚠️ Prisma Warning:', e)
})

/**
 * Сохраняем клиент в development для предотвращения множественных соединений
 */
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Типы для использования в других модулях
 */
export type PrismaClientType = typeof prisma
export type PrismaTransactionClient = Prisma.TransactionClient

/**
 * Функция для безопасного закрытия соединения с базой данных
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect()
}

/**
 * Функция для проверки соединения с базой данных
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return true
  } catch (error) {
    console.error('❌ Ошибка соединения с базой данных:', error)
    return false
  }
}

/**
 * Экспорт типов Prisma для использования в других модулях
 */
export * from './generated'
export { Prisma } from './generated'