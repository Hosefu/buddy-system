/**
 * GraphQL queries для системы прогресса
 * 
 * Предоставляет запросы для получения данных о прогрессе пользователей:
 * - Прогресс по компонентам
 * - Сводка прогресса по назначению
 * - Аналитика прогресса
 * - Данные для дашборда
 * 
 * Все queries работают со снапшотами, не с оригинальными компонентами!
 */

import { builder } from '../index'
import { ProgressService } from '../../core/services/progress/ProgressService'
import { ComponentProgressRepository } from '../../core/repositories/ComponentProgressRepository'
import { FlowSnapshotRepository } from '../../core/repositories/FlowSnapshotRepository'

// ===== ОСНОВНЫЕ QUERIES =====

/**
 * Получение сводки прогресса пользователя по назначению
 */
builder.queryField('progressSummary', (t) =>
  t.field({
    type: 'ProgressSummary',
    description: 'Полная сводка прогресса пользователя по назначению потока',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения потока'
      }),
      userId: t.arg.id({
        required: false,
        description: 'ID пользователя (если не указан, используется текущий пользователь)'
      })
    },
    resolve: async (_, { assignmentId, userId }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          throw new Error('Необходима авторизация')
        }

        // Используем указанный userId или текущего пользователя
        const targetUserId = userId || currentUser.id

        // Проверяем права доступа
        if (targetUserId !== currentUser.id && !currentUser.permissions?.includes('VIEW_ALL_PROGRESS')) {
          throw new Error('Недостаточно прав для просмотра прогресса другого пользователя')
        }

        const progressService = context.services.progressService as ProgressService
        const summary = await progressService.getProgressSummary(targetUserId, assignmentId)

        return {
          ...summary,
          assignmentId,
          userId: targetUserId,
          lastActivity: new Date() // TODO: получить реальную дату последней активности
        }

      } catch (error) {
        console.error('Ошибка получения сводки прогресса:', error)
        throw new Error(`Не удалось получить прогресс: ${error.message}`)
      }
    }
  })
)

/**
 * Получение прогресса по конкретному компоненту
 */
builder.queryField('componentProgress', (t) =>
  t.field({
    type: 'ComponentProgress',
    nullable: true,
    description: 'Прогресс пользователя по конкретному компоненту',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения'
      }),
      componentSnapshotId: t.arg.id({
        required: true,
        description: 'ID снапшота компонента'
      }),
      userId: t.arg.id({
        required: false,
        description: 'ID пользователя (по умолчанию текущий)'
      })
    },
    resolve: async (_, { assignmentId, componentSnapshotId, userId }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          throw new Error('Необходима авторизация')
        }

        const targetUserId = userId || currentUser.id

        // Проверяем права доступа
        if (targetUserId !== currentUser.id && !currentUser.permissions?.includes('VIEW_ALL_PROGRESS')) {
          throw new Error('Недостаточно прав для просмотра прогресса другого пользователя')
        }

        const progressRepository = context.repositories.componentProgressRepository as ComponentProgressRepository
        const progress = await progressRepository.findByUserAndComponent(
          targetUserId,
          assignmentId,
          componentSnapshotId
        )

        return progress ? progress.toData() : null

      } catch (error) {
        console.error('Ошибка получения прогресса компонента:', error)
        throw new Error(`Не удалось получить прогресс компонента: ${error.message}`)
      }
    }
  })
)

/**
 * Получение аналитики прогресса пользователя
 */
builder.queryField('progressAnalytics', (t) =>
  t.field({
    type: 'ProgressAnalytics',
    description: 'Детальная аналитика прогресса пользователя',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения'
      }),
      userId: t.arg.id({
        required: false,
        description: 'ID пользователя (по умолчанию текущий)'
      })
    },
    resolve: async (_, { assignmentId, userId }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          throw new Error('Необходима авторизация')
        }

        const targetUserId = userId || currentUser.id

        // Проверяем права доступа
        if (targetUserId !== currentUser.id && !currentUser.permissions?.includes('VIEW_ALL_PROGRESS')) {
          throw new Error('Недостаточно прав для просмотра аналитики другого пользователя')
        }

        const progressService = context.services.progressService as ProgressService
        const analytics = await progressService.getProgressAnalytics(targetUserId, assignmentId)

        return {
          ...analytics,
          userId: targetUserId,
          assignmentId
        }

      } catch (error) {
        console.error('Ошибка получения аналитики прогресса:', error)
        throw new Error(`Не удалось получить аналитику: ${error.message}`)
      }
    }
  })
)

/**
 * Получение списка пользователей с прогрессом по назначению (для наставников/админов)
 */
builder.queryField('assignmentProgressOverview', (t) =>
  t.field({
    type: ['UserProgressOverview'],
    description: 'Обзор прогресса всех пользователей по назначению (для наставников)',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения'
      }),
      limit: t.arg.int({
        required: false,
        defaultValue: 50,
        description: 'Количество пользователей для возврата'
      }),
      offset: t.arg.int({
        required: false,
        defaultValue: 0,
        description: 'Смещение для пагинации'
      })
    },
    resolve: async (_, { assignmentId, limit, offset }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          throw new Error('Необходима авторизация')
        }

        // Проверяем права на просмотр прогресса всех пользователей
        if (!currentUser.permissions?.includes('VIEW_ALL_PROGRESS')) {
          throw new Error('Недостаточно прав для просмотра прогресса всех пользователей')
        }

        const progressRepository = context.repositories.componentProgressRepository as ComponentProgressRepository
        const usersWithProgress = await progressRepository.findUsersWithProgress(assignmentId)

        // Применяем пагинацию
        const paginatedUsers = usersWithProgress.slice(offset, offset + limit)

        // Получаем детальную информацию для каждого пользователя
        const userOverviews = await Promise.all(
          paginatedUsers.map(async (userInfo) => {
            const userStats = await progressRepository.getUserProgressStats(
              userInfo.userId,
              assignmentId
            )

            // Получаем информацию о пользователе
            const user = await context.prisma.user.findUnique({
              where: { id: userInfo.userId },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true
              }
            })

            return {
              user,
              assignmentId,
              completedComponents: userInfo.completedComponents,
              totalTimeSpent: userInfo.totalTimeSpent,
              lastActivity: userInfo.lastActivity,
              progressPercentage: userStats.totalComponents > 0 
                ? Math.round((userStats.completedComponents / userStats.totalComponents) * 100)
                : 0,
              averageTimePerComponent: userStats.averageTimePerComponent,
              totalAttempts: userStats.totalAttempts,
              status: this.determineUserStatus(userStats, userInfo.lastActivity)
            }
          })
        )

        return userOverviews

      } catch (error) {
        console.error('Ошибка получения обзора прогресса:', error)
        throw new Error(`Не удалось получить обзор прогресса: ${error.message}`)
      }
    },

    // Вспомогательный метод для определения статуса пользователя
    determineUserStatus(stats: any, lastActivity: Date): string {
      const now = new Date()
      const daysSinceLastActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)

      if (stats.completedComponents === stats.totalComponents) {
        return 'COMPLETED'
      } else if (daysSinceLastActivity > 7) {
        return 'INACTIVE'
      } else if (stats.completedComponents > 0) {
        return 'ACTIVE'
      } else {
        return 'NOT_STARTED'
      }
    }
  })
)

/**
 * Получение проблемных пользователей (для наставников)
 */
builder.queryField('strugglingUsers', (t) =>
  t.field({
    type: ['StrugglingUserInfo'],
    description: 'Список пользователей, испытывающих затруднения в обучении',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения'
      })
    },
    resolve: async (_, { assignmentId }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          throw new Error('Необходима авторизация')
        }

        // Проверяем права на просмотр данных
        if (!currentUser.permissions?.includes('VIEW_ALL_PROGRESS')) {
          throw new Error('Недостаточно прав для просмотра данных пользователей')
        }

        const progressRepository = context.repositories.componentProgressRepository as ComponentProgressRepository
        const strugglingUsers = await progressRepository.findStrugglingUsers(assignmentId)

        // Получаем информацию о пользователях
        const userInfos = await Promise.all(
          strugglingUsers.map(async (userInfo) => {
            const user = await context.prisma.user.findUnique({
              where: { id: userInfo.userId },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            })

            return {
              user,
              assignmentId,
              strugglingComponents: userInfo.strugglingComponents,
              averageAttempts: userInfo.averageAttempts,
              totalTimeSpent: userInfo.totalTimeSpent,
              needsHelp: userInfo.strugglingComponents > 2 || userInfo.averageAttempts > 3,
              difficultyScore: Math.min(userInfo.strugglingComponents / 5, 1.0) // Нормализуем до 0-1
            }
          })
        )

        return userInfos

      } catch (error) {
        console.error('Ошибка получения проблемных пользователей:', error)
        throw new Error(`Не удалось получить данные: ${error.message}`)
      }
    }
  })
)

/**
 * Получение статистики прогресса по назначению
 */
builder.queryField('assignmentProgressStats', (t) =>
  t.field({
    type: 'AssignmentProgressStats',
    description: 'Общая статистика прогресса по назначению',
    args: {
      assignmentId: t.arg.id({
        required: true,
        description: 'ID назначения'
      })
    },
    resolve: async (_, { assignmentId }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          throw new Error('Необходима авторизация')
        }

        // Проверяем права на просмотр статистики
        if (!currentUser.permissions?.includes('VIEW_STATISTICS')) {
          throw new Error('Недостаточно прав для просмотра статистики')
        }

        const progressRepository = context.repositories.componentProgressRepository as ComponentProgressRepository
        const snapshotRepository = context.repositories.flowSnapshotRepository as FlowSnapshotRepository

        // Получаем базовую статистику
        const [progressStats, snapshotStats, usersWithProgress] = await Promise.all([
          progressRepository.getProgressStats(assignmentId),
          snapshotRepository.getSnapshotStats(assignmentId),
          progressRepository.findUsersWithProgress(assignmentId)
        ])

        // Вычисляем дополнительные метрики
        const activeUsers = usersWithProgress.filter(user => {
          const daysSinceLastActivity = (new Date().getTime() - user.lastActivity.getTime()) / (1000 * 60 * 60 * 24)
          return daysSinceLastActivity <= 7
        }).length

        const completedUsers = usersWithProgress.filter(user => {
          return user.completedComponents === snapshotStats.totalComponents
        }).length

        return {
          assignmentId,
          totalUsers: progressStats.totalUsers,
          activeUsers,
          completedUsers,
          totalComponents: snapshotStats.totalComponents,
          totalSteps: snapshotStats.totalSteps,
          completedComponents: progressStats.completedComponents,
          averageCompletionTime: progressStats.averageCompletionTime,
          averageAttempts: progressStats.averageAttempts,
          completionRate: progressStats.totalUsers > 0 
            ? Math.round((completedUsers / progressStats.totalUsers) * 100)
            : 0,
          engagementScore: this.calculateEngagementScore(usersWithProgress, snapshotStats),
          createdAt: snapshotStats.createdAt
        }

      } catch (error) {
        console.error('Ошибка получения статистики назначения:', error)
        throw new Error(`Не удалось получить статистику: ${error.message}`)
      }
    },

    // Вспомогательный метод для расчета вовлеченности
    calculateEngagementScore(users: any[], snapshotStats: any): number {
      if (users.length === 0) return 0

      const totalPossibleTime = users.length * snapshotStats.totalComponents * 300 // 5 минут на компонент
      const actualTime = users.reduce((sum, user) => sum + user.totalTimeSpent, 0)
      
      return Math.min(Math.round((actualTime / totalPossibleTime) * 100), 100)
    }
  })
)

// ===== ДОПОЛНИТЕЛЬНЫЕ ТИПЫ =====

/**
 * Обзор прогресса пользователя
 */
builder.objectType('UserProgressOverview', {
  description: 'Краткий обзор прогресса пользователя',
  fields: (t) => ({
    user: t.field({
      type: 'User',
      description: 'Информация о пользователе'
    }),
    assignmentId: t.id({
      description: 'ID назначения'
    }),
    completedComponents: t.int({
      description: 'Количество завершенных компонентов'
    }),
    totalTimeSpent: t.int({
      description: 'Общее время обучения (в секундах)'
    }),
    lastActivity: t.field({
      type: 'DateTime',
      description: 'Время последней активности'
    }),
    progressPercentage: t.int({
      description: 'Процент завершения (0-100)'
    }),
    averageTimePerComponent: t.int({
      description: 'Среднее время на компонент (в секундах)'
    }),
    totalAttempts: t.int({
      description: 'Общее количество попыток'
    }),
    status: t.string({
      description: 'Статус: NOT_STARTED, ACTIVE, INACTIVE, COMPLETED'
    })
  })
})

/**
 * Информация о проблемном пользователе
 */
builder.objectType('StrugglingUserInfo', {
  description: 'Информация о пользователе, испытывающем затруднения',
  fields: (t) => ({
    user: t.field({
      type: 'User',
      description: 'Информация о пользователе'
    }),
    assignmentId: t.id({
      description: 'ID назначения'
    }),
    strugglingComponents: t.int({
      description: 'Количество проблемных компонентов'
    }),
    averageAttempts: t.int({
      description: 'Среднее количество попыток'
    }),
    totalTimeSpent: t.int({
      description: 'Общее время обучения (в секундах)'
    }),
    needsHelp: t.boolean({
      description: 'Требуется ли помощь пользователю'
    }),
    difficultyScore: t.float({
      description: 'Оценка сложности для пользователя (0.0-1.0)'
    })
  })
})

/**
 * Статистика назначения
 */
builder.objectType('AssignmentProgressStats', {
  description: 'Общая статистика прогресса по назначению',
  fields: (t) => ({
    assignmentId: t.id({
      description: 'ID назначения'
    }),
    totalUsers: t.int({
      description: 'Общее количество пользователей'
    }),
    activeUsers: t.int({
      description: 'Количество активных пользователей (активность за неделю)'
    }),
    completedUsers: t.int({
      description: 'Количество пользователей, завершивших поток'
    }),
    totalComponents: t.int({
      description: 'Общее количество компонентов в потоке'
    }),
    totalSteps: t.int({
      description: 'Общее количество шагов в потоке'
    }),
    completedComponents: t.int({
      description: 'Общее количество завершений компонентов всеми пользователями'
    }),
    averageCompletionTime: t.int({
      description: 'Среднее время завершения компонента (в секундах)'
    }),
    averageAttempts: t.int({
      description: 'Среднее количество попыток'
    }),
    completionRate: t.int({
      description: 'Процент пользователей, завершивших поток (0-100)'
    }),
    engagementScore: t.int({
      description: 'Оценка вовлеченности пользователей (0-100)'
    }),
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата создания назначения'
    })
  })
})

export {}