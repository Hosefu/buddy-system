/**
 * Скалярные типы и общие енумы для GraphQL схемы
 * 
 * Файл: packages/api/src/schema/types/scalars.ts
 * 
 * Определяет кастомные скалярные типы (DateTime, JSON, Email и др.)
 * и общие перечисления, используемые во всей схеме.
 */

import { builder } from '../index'
import { GraphQLError } from 'graphql'
import { DateTimeResolver, JSONResolver, EmailAddressResolver } from 'graphql-scalars'

/**
 * Скалярный тип для дат и времени
 * Использует ISO 8601 формат (например: "2025-01-15T10:30:00Z")
 */
builder.addScalarType('DateTime', DateTimeResolver, {
  description: 'Дата и время в формате ISO 8601'
})

/**
 * Скалярный тип для JSON данных
 * Позволяет передавать произвольные JSON объекты
 */
builder.addScalarType('JSON', JSONResolver, {
  description: 'Произвольные JSON данные'
})

/**
 * Скалярный тип для email адресов
 * Включает валидацию формата email
 */
builder.addScalarType('EmailAddress', EmailAddressResolver, {
  description: 'Валидный email адрес'
})

/**
 * Кастомный скалярный тип для времени (HH:MM)
 */
builder.scalarType('Time', {
  description: 'Время в формате HH:MM (например: "14:30")',
  serialize: (value) => {
    if (typeof value === 'string') {
      // Проверяем формат HH:MM
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        throw new GraphQLError('Неверный формат времени. Ожидается HH:MM')
      }
      return value
    }
    throw new GraphQLError('Время должно быть строкой в формате HH:MM')
  },
  parseValue: (value) => {
    if (typeof value === 'string') {
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        throw new GraphQLError('Неверный формат времени. Ожидается HH:MM')
      }
      return value
    }
    throw new GraphQLError('Время должно быть строкой в формате HH:MM')
  },
  parseLiteral: (ast) => {
    if (ast.kind === 'StringValue') {
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(ast.value)) {
        throw new GraphQLError('Неверный формат времени. Ожидается HH:MM')
      }
      return ast.value
    }
    throw new GraphQLError('Время должно быть строкой в формате HH:MM')
  }
})

/**
 * Кастомный скалярный тип для даты (YYYY-MM-DD)
 */
builder.scalarType('Date', {
  description: 'Дата в формате YYYY-MM-DD (например: "2025-01-15")',
  serialize: (value) => {
    if (typeof value === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new GraphQLError('Неверный формат даты. Ожидается YYYY-MM-DD')
      }
      return value
    }
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]
    }
    throw new GraphQLError('Дата должна быть строкой в формате YYYY-MM-DD или объектом Date')
  },
  parseValue: (value) => {
    if (typeof value === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new GraphQLError('Неверный формат даты. Ожидается YYYY-MM-DD')
      }
      return value
    }
    throw new GraphQLError('Дата должна быть строкой в формате YYYY-MM-DD')
  },
  parseLiteral: (ast) => {
    if (ast.kind === 'StringValue') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ast.value)) {
        throw new GraphQLError('Неверный формат даты. Ожидается YYYY-MM-DD')
      }
      return ast.value
    }
    throw new GraphQLError('Дата должна быть строкой в формате YYYY-MM-DD')
  }
})

/**
 * Информация о пагинации (стандарт Relay)
 */
builder.objectType('PageInfo', {
  description: 'Информация о пагинации в стиле Relay',
  fields: (t) => ({
    hasNextPage: t.boolean({
      description: 'Есть ли следующая страница'
    }),
    hasPreviousPage: t.boolean({
      description: 'Есть ли предыдущая страница'
    }),
    startCursor: t.string({
      nullable: true,
      description: 'Курсор первого элемента на странице'
    }),
    endCursor: t.string({
      nullable: true,
      description: 'Курсор последнего элемента на странице'
    })
  })
})

/**
 * Общие енумы
 */

/**
 * Дни недели
 */
builder.enumType('DayOfWeek', {
  description: 'Дни недели',
  values: {
    MONDAY: { value: 'MONDAY', description: 'Понедельник' },
    TUESDAY: { value: 'TUESDAY', description: 'Вторник' },
    WEDNESDAY: { value: 'WEDNESDAY', description: 'Среда' },
    THURSDAY: { value: 'THURSDAY', description: 'Четверг' },
    FRIDAY: { value: 'FRIDAY', description: 'Пятница' },
    SATURDAY: { value: 'SATURDAY', description: 'Суббота' },
    SUNDAY: { value: 'SUNDAY', description: 'Воскресенье' }
  }
})

/**
 * Направления сортировки
 */
builder.enumType('SortOrder', {
  description: 'Направления сортировки',
  values: {
    ASC: { value: 'ASC', description: 'По возрастанию' },
    DESC: { value: 'DESC', description: 'По убыванию' }
  }
})

/**
 * Языки интерфейса
 */
builder.enumType('Language', {
  description: 'Поддерживаемые языки интерфейса',
  values: {
    RU: { value: 'RU', description: 'Русский' },
    EN: { value: 'EN', description: 'English' },
    ES: { value: 'ES', description: 'Español' },
    DE: { value: 'DE', description: 'Deutsch' },
    FR: { value: 'FR', description: 'Français' }
  }
})

/**
 * Часовые пояса (основные)
 */
builder.enumType('Timezone', {
  description: 'Основные часовые пояса',
  values: {
    UTC: { value: 'UTC', description: 'UTC' },
    EUROPE_MOSCOW: { value: 'Europe/Moscow', description: 'Москва (UTC+3)' },
    EUROPE_LONDON: { value: 'Europe/London', description: 'Лондон (UTC+0/+1)' },
    AMERICA_NEW_YORK: { value: 'America/New_York', description: 'Нью-Йорк (UTC-5/-4)' },
    AMERICA_LOS_ANGELES: { value: 'America/Los_Angeles', description: 'Лос-Анджелес (UTC-8/-7)' },
    ASIA_TOKYO: { value: 'Asia/Tokyo', description: 'Токио (UTC+9)' },
    ASIA_SHANGHAI: { value: 'Asia/Shanghai', description: 'Шанхай (UTC+8)' },
    AUSTRALIA_SYDNEY: { value: 'Australia/Sydney', description: 'Сидней (UTC+10/+11)' }
  }
})

/**
 * Уровни логирования
 */
builder.enumType('LogLevel', {
  description: 'Уровни логирования',
  values: {
    DEBUG: { value: 'DEBUG', description: 'Отладочная информация' },
    INFO: { value: 'INFO', description: 'Информационные сообщения' },
    WARN: { value: 'WARN', description: 'Предупреждения' },
    ERROR: { value: 'ERROR', description: 'Ошибки' },
    FATAL: { value: 'FATAL', description: 'Критические ошибки' }
  }
})

/**
 * Типы событий в системе
 */
builder.enumType('EventType', {
  description: 'Типы событий в системе',
  values: {
    // Пользователи
    USER_REGISTERED: { value: 'USER_REGISTERED', description: 'Пользователь зарегистрирован' },
    USER_UPDATED: { value: 'USER_UPDATED', description: 'Профиль пользователя обновлен' },
    USER_DEACTIVATED: { value: 'USER_DEACTIVATED', description: 'Пользователь деактивирован' },
    
    // Потоки
    FLOW_CREATED: { value: 'FLOW_CREATED', description: 'Поток создан' },
    FLOW_UPDATED: { value: 'FLOW_UPDATED', description: 'Поток обновлен' },
    FLOW_PUBLISHED: { value: 'FLOW_PUBLISHED', description: 'Поток опубликован' },
    FLOW_ARCHIVED: { value: 'FLOW_ARCHIVED', description: 'Поток архивирован' },
    
    // Назначения
    ASSIGNMENT_CREATED: { value: 'ASSIGNMENT_CREATED', description: 'Назначение создано' },
    ASSIGNMENT_STARTED: { value: 'ASSIGNMENT_STARTED', description: 'Назначение начато' },
    ASSIGNMENT_COMPLETED: { value: 'ASSIGNMENT_COMPLETED', description: 'Назначение завершено' },
    ASSIGNMENT_OVERDUE: { value: 'ASSIGNMENT_OVERDUE', description: 'Назначение просрочено' },
    ASSIGNMENT_CANCELLED: { value: 'ASSIGNMENT_CANCELLED', description: 'Назначение отменено' },
    
    // Компоненты
    COMPONENT_STARTED: { value: 'COMPONENT_STARTED', description: 'Компонент начат' },
    COMPONENT_COMPLETED: { value: 'COMPONENT_COMPLETED', description: 'Компонент завершен' },
    COMPONENT_FAILED: { value: 'COMPONENT_FAILED', description: 'Компонент не пройден' },
    
    // Достижения
    ACHIEVEMENT_EARNED: { value: 'ACHIEVEMENT_EARNED', description: 'Достижение получено' },
    
    // Уведомления
    NOTIFICATION_SENT: { value: 'NOTIFICATION_SENT', description: 'Уведомление отправлено' },
    NOTIFICATION_DELIVERED: { value: 'NOTIFICATION_DELIVERED', description: 'Уведомление доставлено' },
    NOTIFICATION_READ: { value: 'NOTIFICATION_READ', description: 'Уведомление прочитано' }
  }
})

/**
 * Типы уведомлений
 */
builder.enumType('NotificationType', {
  description: 'Типы уведомлений',
  values: {
    ASSIGNMENT_REMINDER: { value: 'ASSIGNMENT_REMINDER', description: 'Напоминание о назначении' },
    DEADLINE_WARNING: { value: 'DEADLINE_WARNING', description: 'Предупреждение о дедлайне' },
    ASSIGNMENT_OVERDUE: { value: 'ASSIGNMENT_OVERDUE', description: 'Назначение просрочено' },
    ASSIGNMENT_COMPLETED: { value: 'ASSIGNMENT_COMPLETED', description: 'Назначение завершено' },
    ACHIEVEMENT_EARNED: { value: 'ACHIEVEMENT_EARNED', description: 'Получено достижение' },
    BUDDY_MESSAGE: { value: 'BUDDY_MESSAGE', description: 'Сообщение от наставника' },
    SYSTEM_ANNOUNCEMENT: { value: 'SYSTEM_ANNOUNCEMENT', description: 'Системное объявление' }
  }
})

/**
 * Приоритеты уведомлений
 */
builder.enumType('NotificationPriority', {
  description: 'Приоритеты уведомлений',
  values: {
    LOW: { value: 'LOW', description: 'Низкий приоритет' },
    NORMAL: { value: 'NORMAL', description: 'Обычный приоритет' },
    HIGH: { value: 'HIGH', description: 'Высокий приоритет' },
    URGENT: { value: 'URGENT', description: 'Срочно' }
  }
})

/**
 * Каналы доставки уведомлений
 */
builder.enumType('NotificationChannel', {
  description: 'Каналы доставки уведомлений',
  values: {
    TELEGRAM: { value: 'TELEGRAM', description: 'Telegram бот' },
    EMAIL: { value: 'EMAIL', description: 'Email' },
    PUSH: { value: 'PUSH', description: 'Push уведомления' },
    IN_APP: { value: 'IN_APP', description: 'Внутри приложения' }
  }
})

/**
 * Статусы уведомлений
 */
builder.enumType('NotificationStatus', {
  description: 'Статусы уведомлений',
  values: {
    PENDING: { value: 'PENDING', description: 'Ожидает отправки' },
    SENT: { value: 'SENT', description: 'Отправлено' },
    DELIVERED: { value: 'DELIVERED', description: 'Доставлено' },
    READ: { value: 'READ', description: 'Прочитано' },
    FAILED: { value: 'FAILED', description: 'Ошибка отправки' }
  }
})

/**
 * Результат операции (общий тип для мутаций)
 */
builder.objectType('OperationResult', {
  description: 'Общий результат выполнения операции',
  fields: (t) => ({
    success: t.boolean({
      description: 'Успешность выполнения операции'
    }),
    message: t.string({
      nullable: true,
      description: 'Сообщение о результате'
    }),
    errors: t.stringList({
      description: 'Список ошибок, если есть'
    }),
    code: t.string({
      nullable: true,
      description: 'Код результата'
    })
  })
})

/**
 * Базовый тип для ошибок
 */
builder.objectType('GraphQLError', {
  description: 'Структурированная ошибка GraphQL',
  fields: (t) => ({
    message: t.string({
      description: 'Сообщение об ошибке'
    }),
    code: t.string({
      nullable: true,
      description: 'Код ошибки'
    }),
    path: t.stringList({
      nullable: true,
      description: 'Путь к полю, где произошла ошибка'
    }),
    extensions: t.field({
      type: 'JSON',
      nullable: true,
      description: 'Дополнительная информация об ошибке'
    })
  })
})

/**
 * Статистика API
 */
builder.objectType('APIStats', {
  description: 'Статистика использования API',
  fields: (t) => ({
    totalRequests: t.int({
      description: 'Общее количество запросов'
    }),
    successfulRequests: t.int({
      description: 'Количество успешных запросов'
    }),
    errorRequests: t.int({
      description: 'Количество запросов с ошибками'
    }),
    averageResponseTime: t.float({
      description: 'Среднее время ответа (в миллисекундах)'
    }),
    uptime: t.float({
      description: 'Время работы без сбоев (в процентах)'
    })
  })
})

export {}