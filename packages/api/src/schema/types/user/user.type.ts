/**
 * GraphQL типы для работы с пользователями
 * 
 * Определяет структуру данных для пользователей, их профилей,
 * статистики, активности и связанных сущностей.
 * 
 * Типы:
 * - User: Основной тип пользователя
 * - UserProfile: Профиль пользователя
 * - UserStats: Статистика пользователя
 * - UserActivity: Активность пользователя
 * - UserConnection: Пагинация пользователей
 */

import { builder } from '../index'

/**
 * Основные енумы для пользователей
 */
builder.enumType('UserRole', {
  description: 'Роли пользователей в системе',
  values: {
    USER: {
      value: 'USER',
      description: 'Обычный пользователь, проходящий обучение'
    },
    BUDDY: {
      value: 'BUDDY',
      description: 'Наставник, курирующий обучение других пользователей'
    },
    ADMIN: {
      value: 'ADMIN',
      description: 'Администратор компании'
    },
    SUPER_ADMIN: {
      value: 'SUPER_ADMIN',
      description: 'Суперадминистратор системы'
    }
  }
})

builder.enumType('UserStatus', {
  description: 'Статусы пользователей',
  values: {
    ACTIVE: {
      value: 'ACTIVE',
      description: 'Активный пользователь'
    },
    INACTIVE: {
      value: 'INACTIVE',
      description: 'Неактивный пользователь'
    },
    SUSPENDED: {
      value: 'SUSPENDED',
      description: 'Заблокированный пользователь'
    }
  }
})

/**
 * Основной тип пользователя
 */
builder.objectType('User', {
  description: 'Пользователь системы BuddyBot',
  fields: (t) => ({
    id: t.id({
      description: 'Уникальный идентификатор пользователя'
    }),
    
    // Основная информация
    name: t.string({
      description: 'Полное имя пользователя'
    }),
    telegramId: t.string({
      description: 'ID пользователя в Telegram'
    }),
    telegramUsername: t.string({
      nullable: true,
      description: 'Username в Telegram (без @)'
    }),
    avatarUrl: t.string({
      nullable: true,
      description: 'URL аватара пользователя'
    }),
    
    // Статус и роль
    role: t.field({
      type: 'UserRole',
      description: 'Роль пользователя в системе'
    }),
    status: t.field({
      type: 'UserStatus',
      description: 'Текущий статус пользователя'
    }),
    
    // Профиль и дополнительная информация
    profile: t.field({
      type: 'UserProfile',
      nullable: true,
      description: 'Дополнительная информация профиля',
      resolve: async (user, _, context) => {
        // Получаем профиль пользователя из базы данных
        const profile = await context.prisma.userProfile.findUnique({
          where: { userId: user.id }
        })
        return profile
      }
    }),
    
    // Временные метки
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата регистрации пользователя'
    }),
    updatedAt: t.field({
      type: 'DateTime',
      description: 'Дата последнего обновления профиля'
    }),
    lastActivity: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Время последней активности'
    }),
    
    // Связанные данные
    assignedFlows: t.field({
      type: ['FlowAssignment'],
      description: 'Назначенные пользователю потоки',
      resolve: async (user, _, context) => {
        const assignments = await context.prisma.flowAssignment.findMany({
          where: {
            userId: user.id,
            isDeleted: false
          },
          orderBy: { assignedAt: 'desc' }
        })
        return assignments
      }
    }),
    
    // Статистика (только для того же пользователя или админов/buddy)
    stats: t.field({
      type: 'UserStats',
      nullable: true,
      description: 'Статистика пользователя',
      resolve: async (user, _, context) => {
        // Проверяем права доступа
        const currentUser = context.user
        if (!currentUser || 
            (currentUser.id !== user.id && 
             !currentUser.isAdmin && 
             !currentUser.isBuddy)) {
          return null
        }
        
        // Здесь будет логика получения статистики
        // Пока возвращаем базовую структуру
        return {
          totalAssignments: 0,
          completedAssignments: 0,
          inProgressAssignments: 0,
          totalTimeSpent: 0,
          averageCompletionTime: null,
          lastActivityDate: user.lastActivity
        }
      }
    }),
    
    // Флаги для удобства
    isAdmin: t.boolean({
      description: 'Является ли пользователь админом',
      resolve: (user) => user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    }),
    isBuddy: t.boolean({
      description: 'Является ли пользователь наставником',
      resolve: (user) => user.role === 'BUDDY' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN'
    }),
    isActive: t.boolean({
      description: 'Активен ли пользователь',
      resolve: (user) => user.status === 'ACTIVE'
    })
  })
})

/**
 * Профиль пользователя
 */
builder.objectType('UserProfile', {
  description: 'Дополнительная информация профиля пользователя',
  fields: (t) => ({
    userId: t.id({
      description: 'ID пользователя'
    }),
    
    // Рабочая информация
    department: t.string({
      nullable: true,
      description: 'Отдел/департамент'
    }),
    position: t.string({
      nullable: true,
      description: 'Должность'
    }),
    manager: t.field({
      type: 'User',
      nullable: true,
      description: 'Руководитель',
      resolve: async (profile, _, context) => {
        if (!profile.managerId) return null
        
        const manager = await context.prisma.user.findUnique({
          where: { id: profile.managerId }
        })
        return manager
      }
    }),
    
    // Контактная информация
    email: t.string({
      nullable: true,
      description: 'Рабочий email'
    }),
    phoneNumber: t.string({
      nullable: true,
      description: 'Номер телефона'
    }),
    
    // Настройки
    timezone: t.string({
      nullable: true,
      description: 'Часовой пояс пользователя'
    }),
    language: t.string({
      nullable: true,
      description: 'Предпочитаемый язык'
    }),
    
    // Настройки уведомлений
    notificationSettings: t.field({
      type: 'NotificationSettings',
      nullable: true,
      description: 'Настройки уведомлений',
      resolve: (profile) => profile.notificationSettings as any
    }),
    
    // Временные метки
    createdAt: t.field({
      type: 'DateTime',
      description: 'Дата создания профиля'
    }),
    updatedAt: t.field({
      type: 'DateTime',
      description: 'Дата последнего обновления'
    })
  })
})

/**
 * Статистика пользователя
 */
builder.objectType('UserStats', {
  description: 'Статистика активности пользователя',
  fields: (t) => ({
    // Общие метрики
    totalAssignments: t.int({
      description: 'Общее количество назначений'
    }),
    completedAssignments: t.int({
      description: 'Количество завершенных назначений'
    }),
    inProgressAssignments: t.int({
      description: 'Количество назначений в процессе'
    }),
    overdueAssignments: t.int({
      description: 'Количество просроченных назначений'
    }),
    
    // Временные метрики
    totalTimeSpent: t.int({
      description: 'Общее время, потраченное на обучение (в минутах)'
    }),
    averageCompletionTime: t.int({
      nullable: true,
      description: 'Среднее время завершения потока (в днях)'
    }),
    
    // Успеваемость
    averageScore: t.float({
      nullable: true,
      description: 'Средний балл по всем квизам'
    }),
    completionRate: t.float({
      description: 'Процент завершения назначений'
    }),
    
    // Активность
    lastActivityDate: t.field({
      type: 'DateTime',
      nullable: true,
      description: 'Дата последней активности'
    }),
    streakDays: t.int({
      description: 'Количество дней подряд с активностью'
    }),
    
    // Достижения
    achievementsCount: t.int({
      description: 'Количество полученных достижений'
    }),
    
    // Периодная статистика
    thisWeekActivity: t.field({
      type: 'PeriodStats',
      description: 'Активность за текущую неделю'
    }),
    thisMonthActivity: t.field({
      type: 'PeriodStats',
      description: 'Активность за текущий месяц'
    })
  })
})

/**
 * Статистика за период
 */
builder.objectType('PeriodStats', {
  description: 'Статистика за определенный период',
  fields: (t) => ({
    timeSpent: t.int({
      description: 'Время, потраченное на обучение (в минутах)'
    }),
    assignmentsCompleted: t.int({
      description: 'Количество завершенных назначений'
    }),
    componentsCompleted: t.int({
      description: 'Количество завершенных компонентов'
    }),
    activeDays: t.int({
      description: 'Количество активных дней'
    })
  })
})

/**
 * Активность пользователя
 */
builder.objectType('UserActivity', {
  description: 'Запись активности пользователя',
  fields: (t) => ({
    id: t.id({
      description: 'ID записи активности'
    }),
    
    // Основная информация
    type: t.field({
      type: 'ActivityType',
      description: 'Тип активности'
    }),
    description: t.string({
      description: 'Описание активности'
    }),
    
    // Связанные объекты
    assignmentId: t.id({
      nullable: true,
      description: 'ID связанного назначения'
    }),
    componentId: t.id({
      nullable: true,
      description: 'ID связанного компонента'
    }),
    
    // Дополнительные данные
    metadata: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Дополнительные данные активности'
    }),
    
    // Временная метка
    createdAt: t.field({
      type: 'DateTime',
      description: 'Время активности'
    })
  })
})

/**
 * Типы активности
 */
builder.enumType('ActivityType', {
  description: 'Типы активности пользователя',
  values: {
    ASSIGNMENT_STARTED: { value: 'ASSIGNMENT_STARTED', description: 'Начал выполнение назначения' },
    ASSIGNMENT_COMPLETED: { value: 'ASSIGNMENT_COMPLETED', description: 'Завершил назначение' },
    COMPONENT_VIEWED: { value: 'COMPONENT_VIEWED', description: 'Просмотрел компонент' },
    COMPONENT_COMPLETED: { value: 'COMPONENT_COMPLETED', description: 'Завершил компонент' },
    QUIZ_ATTEMPTED: { value: 'QUIZ_ATTEMPTED', description: 'Попытка прохождения квиза' },
    QUIZ_PASSED: { value: 'QUIZ_PASSED', description: 'Успешно прошел квиз' },
    TASK_SUBMITTED: { value: 'TASK_SUBMITTED', description: 'Отправил выполнение задания' },
    LOGIN: { value: 'LOGIN', description: 'Вход в систему' },
    PROFILE_UPDATED: { value: 'PROFILE_UPDATED', description: 'Обновил профиль' }
  }
})

/**
 * Настройки уведомлений
 */
builder.objectType('NotificationSettings', {
  description: 'Настройки уведомлений пользователя',
  fields: (t) => ({
    // Основные настройки
    enableTelegramNotifications: t.boolean({
      description: 'Включены ли уведомления в Telegram'
    }),
    enableEmailNotifications: t.boolean({
      description: 'Включены ли email уведомления'
    }),
    
    // Типы уведомлений
    assignmentReminders: t.boolean({
      description: 'Напоминания о назначениях'
    }),
    deadlineAlerts: t.boolean({
      description: 'Уведомления о приближающихся дедлайнах'
    }),
    progressUpdates: t.boolean({
      description: 'Обновления о прогрессе'
    }),
    achievementNotifications: t.boolean({
      description: 'Уведомления о достижениях'
    }),
    
    // Время уведомлений
    quietHoursStart: t.string({
      nullable: true,
      description: 'Начало тихих часов (HH:MM)'
    }),
    quietHoursEnd: t.string({
      nullable: true,
      description: 'Конец тихих часов (HH:MM)'
    }),
    
    // Частота
    reminderFrequency: t.field({
      type: 'ReminderFrequency',
      description: 'Частота напоминаний'
    })
  })
})

/**
 * Частота напоминаний
 */
builder.enumType('ReminderFrequency', {
  description: 'Частота отправки напоминаний',
  values: {
    NEVER: { value: 'NEVER', description: 'Никогда' },
    DAILY: { value: 'DAILY', description: 'Ежедневно' },
    WEEKLY: { value: 'WEEKLY', description: 'Еженедельно' },
    ON_DEADLINE: { value: 'ON_DEADLINE', description: 'Только при приближении дедлайна' }
  }
})

/**
 * Пагинация пользователей
 */
builder.objectType('UserConnection', {
  description: 'Пагинированный список пользователей',
  fields: (t) => ({
    edges: t.field({
      type: ['UserEdge'],
      description: 'Грани подключения'
    }),
    pageInfo: t.field({
      type: 'PageInfo',
      description: 'Информация о пагинации'
    }),
    totalCount: t.int({
      description: 'Общее количество пользователей'
    })
  })
})

builder.objectType('UserEdge', {
  description: 'Грань пользователя в пагинации',
  fields: (t) => ({
    node: t.field({
      type: 'User',
      description: 'Пользователь'
    }),
    cursor: t.string({
      description: 'Курсор для пагинации'
    })
  })
})

/**
 * Пагинация активности пользователей
 */
builder.objectType('UserActivityConnection', {
  description: 'Пагинированный список активности пользователя',
  fields: (t) => ({
    edges: t.field({
      type: ['UserActivityEdge'],
      description: 'Грани подключения'
    }),
    pageInfo: t.field({
      type: 'PageInfo',
      description: 'Информация о пагинации'
    }),
    totalCount: t.int({
      description: 'Общее количество записей активности'
    })
  })
})

builder.objectType('UserActivityEdge', {
  description: 'Грань активности в пагинации',
  fields: (t) => ({
    node: t.field({
      type: 'UserActivity',
      description: 'Запись активности'
    }),
    cursor: t.string({
      description: 'Курсор для пагинации'
    })
  })
})

export {}