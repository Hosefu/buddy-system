/**
 * GraphQL мутации для управления назначениями потоков
 * 
 * Реализует операции для назначения потоков пользователям,
 * управления жизненным циклом назначений и контроля прогресса.
 * 
 * Мутации:
 * - assignFlow: Назначение потока пользователю
 * - bulkAssignFlow: Массовое назначение потока
 * - startAssignment: Начало прохождения потока
 * - pauseAssignment: Постановка на паузу
 * - resumeAssignment: Возобновление после паузы
 * - extendDeadline: Продление дедлайна
 * - cancelAssignment: Отмена назначения
 */

import { builder } from '../index'
import { AssignFlowUseCase, SingleAssignmentInput, BulkAssignmentInput } from '../../core/usecases/flow/AssignFlowUseCase'
import { FlowAssignmentService, PauseAssignmentInput, ResumeAssignmentInput, ExtendDeadlineInput } from '../../core/services/assignment/FlowAssignmentService'
import { UserService } from '../../core/services/user/UserService'
import { FlowService } from '../../core/services/flow/FlowService'
import { UserRepository } from '../../core/repositories/UserRepository'
import { FlowRepository } from '../../core/repositories/FlowRepository'
import { FlowAssignmentRepository } from '../../core/repositories/FlowAssignmentRepository'
import { handleResolverError, requireAuth, requireBuddy } from '../index'
import { z } from 'zod'

/**
 * Валидационные схемы
 */
const AssignFlowInputSchema = z.object({
  userId: z.string().min(1, 'ID пользователя обязателен'),
  flowId: z.string().min(1, 'ID потока обязателен'),
  buddyIds: z.array(z.string()).min(1, 'Необходимо указать хотя бы одного наставника').max(5, 'Максимум 5 наставников'),
  customDeadlineDays: z.number().int().min(1).max(365).optional(),
  reason: z.string().optional(),
  autoStart: z.boolean().optional()
})

const BulkAssignInputSchema = z.object({
  flowId: z.string().min(1, 'ID потока обязателен'),
  userAssignments: z.array(z.object({
    userId: z.string().min(1),
    buddyIds: z.array(z.string()).min(1).max(5),
    customDeadlineDays: z.number().int().min(1).max(365).optional()
  })).min(1, 'Необходимо указать хотя бы одного пользователя').max(100, 'Максимум 100 пользователей за раз'),
  reason: z.string().optional(),
  sendNotifications: z.boolean().optional()
})

/**
 * Входные типы для назначений
 */
builder.inputType('AssignFlowInput', {
  description: 'Данные для назначения потока пользователю',
  fields: (t) => ({
    userId: t.id({ 
      description: 'ID пользователя, которому назначается поток'
    }),
    flowId: t.id({ 
      description: 'ID потока для назначения'
    }),
    buddyIds: t.idList({ 
      description: 'ID наставников (от 1 до 5)'
    }),
    customDeadlineDays: t.int({ 
      required: false,
      description: 'Кастомный дедлайн в днях (если отличается от дефолтного)'
    }),
    reason: t.string({ 
      required: false,
      description: 'Причина назначения'
    }),
    autoStart: t.boolean({ 
      required: false,
      description: 'Автоматически начать поток после назначения'
    }),
    sendNotifications: t.boolean({ 
      required: false,
      description: 'Отправлять ли уведомления'
    })
  })
})

builder.inputType('UserAssignmentInput', {
  description: 'Данные назначения для одного пользователя при массовом назначении',
  fields: (t) => ({
    userId: t.id(),
    buddyIds: t.idList(),
    customDeadlineDays: t.int({ required: false })
  })
})

builder.inputType('BulkAssignFlowInput', {
  description: 'Данные для массового назначения потока',
  fields: (t) => ({
    flowId: t.id({ 
      description: 'ID потока для назначения'
    }),
    userAssignments: t.field({
      type: ['UserAssignmentInput'],
      description: 'Список пользователей и их настроек'
    }),
    reason: t.string({ 
      required: false,
      description: 'Общая причина назначения'
    }),
    sendNotifications: t.boolean({ 
      required: false,
      description: 'Отправлять ли уведомления'
    })
  })
})

builder.inputType('PauseAssignmentInput', {
  description: 'Данные для постановки назначения на паузу',
  fields: (t) => ({
    assignmentId: t.id(),
    reason: t.string(),
    pauseNote: t.string({ required: false })
  })
})

builder.inputType('ExtendDeadlineInput', {
  description: 'Данные для продления дедлайна',
  fields: (t) => ({
    assignmentId: t.id(),
    newDeadline: t.field({ type: 'DateTime' }),
    reason: t.string()
  })
})

/**
 * Результаты операций с назначениями
 */
builder.objectType('AssignFlowResult', {
  description: 'Результат назначения потока',
  interfaces: ['MutationResult'],
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    message: t.exposeString('message', { nullable: true }),
    errors: t.field({
      type: ['MutationError'],
      nullable: true,
      resolve: (result) => result.errors || null
    }),
    assignment: t.field({
      type: 'FlowAssignment',
      nullable: true,
      description: 'Созданное назначение'
    }),
    isAutoStarted: t.boolean({
      description: 'Был ли поток автоматически начат'
    }),
    notifications: t.field({
      type: 'NotificationResult',
      nullable: true,
      description: 'Результат отправки уведомлений'
    })
  })
})

builder.objectType('BulkAssignFlowResult', {
  description: 'Результат массового назначения потока',
  interfaces: ['MutationResult'],
  fields: (t) => ({
    success: t.exposeBoolean('success'),
    message: t.exposeString('message', { nullable: true }),
    errors: t.field({
      type: ['MutationError'],
      nullable: true,
      resolve: (result) => result.errors || null
    }),
    successful: t.field({
      type: ['FlowAssignment'],
      description: 'Успешно созданные назначения'
    }),
    failed: t.field({
      type: ['BulkAssignmentFailure'],
      description: 'Неудачные назначения с причинами'
    }),
    summary: t.field({
      type: 'BulkAssignmentSummary',
      description: 'Сводка по результатам'
    })
  })
})

builder.objectType('BulkAssignmentFailure', {
  description: 'Информация о неудачном назначении',
  fields: (t) => ({
    userId: t.id(),
    reason: t.string(),
    error: t.string()
  })
})

builder.objectType('BulkAssignmentSummary', {
  description: 'Сводка по массовому назначению',
  fields: (t) => ({
    total: t.int(),
    successful: t.int(),
    failed: t.int()
  })
})

builder.objectType('NotificationResult', {
  description: 'Результат отправки уведомлений',
  fields: (t) => ({
    sent: t.boolean(),
    recipients: t.stringList(),
    errors: t.stringList()
  })
})

/**
 * Мутации для назначений
 */
builder.mutationFields((t) => ({
  /**
   * Назначение потока одному пользователю
   */
  assignFlow: t.field({
    type: 'AssignFlowResult',
    description: 'Назначает поток обучения пользователю',
    authScopes: { buddy: true },
    args: {
      input: t.arg({ type: 'AssignFlowInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireBuddy(context)

        // Валидируем входные данные
        const validatedInput = AssignFlowInputSchema.parse(input)

        // Создаем сервисы
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        
        const userService = new UserService(userRepository)
        const flowService = new FlowService(flowRepository, userRepository)
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Создаем Use Case
        const assignFlowUseCase = new AssignFlowUseCase(
          userService,
          flowService,
          assignmentService
          // TODO: Добавить NotificationService
        )

        // Подготавливаем данные
        const assignmentInput: SingleAssignmentInput = {
          userId: validatedInput.userId,
          flowId: validatedInput.flowId,
          buddyIds: validatedInput.buddyIds,
          assignedBy: currentUser.id,
          customDeadlineDays: validatedInput.customDeadlineDays,
          reason: validatedInput.reason,
          autoStart: validatedInput.autoStart || false,
          sendNotifications: input.sendNotifications !== false
        }

        // Выполняем назначение
        const result = await assignFlowUseCase.assignToUser(assignmentInput)

        return {
          success: true,
          message: `Поток "${result.flow.title}" назначен пользователю ${result.user.name}`,
          errors: null,
          assignment: result.assignment,
          isAutoStarted: result.isAutoStarted,
          notifications: {
            sent: result.notifications.sent,
            recipients: result.notifications.recipients,
            errors: result.notifications.errors
          }
        }

      } catch (error) {
        console.error('❌ Ошибка назначения потока:', error)
        return {
          success: false,
          message: error.message || 'Ошибка назначения потока',
          errors: [{
            message: error.message || 'Неизвестная ошибка',
            code: 'ASSIGN_FLOW_ERROR'
          }],
          assignment: null,
          isAutoStarted: false,
          notifications: null
        }
      }
    }
  }),

  /**
   * Массовое назначение потока
   */
  bulkAssignFlow: t.field({
    type: 'BulkAssignFlowResult',
    description: 'Массовое назначение потока нескольким пользователям',
    authScopes: { buddy: true },
    args: {
      input: t.arg({ type: 'BulkAssignFlowInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireBuddy(context)

        // Валидируем входные данные
        const validatedInput = BulkAssignInputSchema.parse(input)

        // Создаем сервисы
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        
        const userService = new UserService(userRepository)
        const flowService = new FlowService(flowRepository, userRepository)
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Создаем Use Case
        const assignFlowUseCase = new AssignFlowUseCase(
          userService,
          flowService,
          assignmentService
        )

        // Подготавливаем данные
        const bulkInput: BulkAssignmentInput = {
          flowId: validatedInput.flowId,
          assignedBy: currentUser.id,
          userAssignments: validatedInput.userAssignments,
          reason: validatedInput.reason,
          sendNotifications: validatedInput.sendNotifications !== false
        }

        // Выполняем массовое назначение
        const result = await assignFlowUseCase.assignToMultipleUsers(bulkInput)

        return {
          success: result.summary.successful > 0,
          message: `Массовое назначение завершено: ${result.summary.successful}/${result.summary.total} успешно`,
          errors: result.failed.length > 0 ? result.failed.map(f => ({
            message: f.error,
            code: 'BULK_ASSIGN_PARTIAL_FAILURE',
            field: f.userId
          })) : null,
          successful: result.successful.map(s => s.assignment),
          failed: result.failed,
          summary: result.summary
        }

      } catch (error) {
        console.error('❌ Ошибка массового назначения:', error)
        return {
          success: false,
          message: error.message || 'Ошибка массового назначения',
          errors: [{
            message: error.message || 'Неизвестная ошибка',
            code: 'BULK_ASSIGN_ERROR'
          }],
          successful: [],
          failed: [],
          summary: { total: 0, successful: 0, failed: 0 }
        }
      }
    }
  }),

  /**
   * Начало прохождения потока
   */
  startAssignment: t.field({
    type: 'MutationResult',
    description: 'Начинает прохождение назначенного потока',
    authScopes: { authenticated: true },
    args: {
      assignmentId: t.arg.id({ required: true })
    },
    resolve: async (_, { assignmentId }, context) => {
      try {
        const currentUser = requireAuth(context)

        // Создаем сервис
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Начинаем назначение
        await assignmentService.startAssignment(assignmentId, currentUser.id)

        return {
          success: true,
          message: 'Поток успешно начат',
          errors: null
        }

      } catch (error) {
        handleResolverError(error)
      }
    }
  }),

  /**
   * Постановка назначения на паузу
   */
  pauseAssignment: t.field({
    type: 'MutationResult',
    description: 'Ставит назначение на паузу',
    authScopes: { authenticated: true },
    args: {
      input: t.arg({ type: 'PauseAssignmentInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireAuth(context)

        // Создаем сервис
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Ставим на паузу
        const pauseInput: PauseAssignmentInput = {
          assignmentId: input.assignmentId,
          reason: input.reason,
          pausedBy: currentUser.id,
          pauseNote: input.pauseNote
        }

        await assignmentService.pauseAssignment(pauseInput)

        return {
          success: true,
          message: 'Назначение поставлено на паузу',
          errors: null
        }

      } catch (error) {
        handleResolverError(error)
      }
    }
  }),

  /**
   * Возобновление назначения
   */
  resumeAssignment: t.field({
    type: 'MutationResult',
    description: 'Возобновляет назначение после паузы',
    authScopes: { authenticated: true },
    args: {
      assignmentId: t.arg.id({ required: true }),
      adjustDeadline: t.arg.boolean({ required: false })
    },
    resolve: async (_, { assignmentId, adjustDeadline }, context) => {
      try {
        const currentUser = requireAuth(context)

        // Создаем сервис
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Возобновляем
        const resumeInput: ResumeAssignmentInput = {
          assignmentId,
          resumedBy: currentUser.id,
          adjustDeadline: adjustDeadline || false
        }

        await assignmentService.resumeAssignment(resumeInput)

        return {
          success: true,
          message: 'Назначение возобновлено',
          errors: null
        }

      } catch (error) {
        handleResolverError(error)
      }
    }
  }),

  /**
   * Продление дедлайна
   */
  extendDeadline: t.field({
    type: 'MutationResult',
    description: 'Продлевает дедлайн назначения',
    authScopes: { buddy: true },
    args: {
      input: t.arg({ type: 'ExtendDeadlineInput', required: true })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireBuddy(context)

        // Создаем сервис
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Продлеваем дедлайн
        const extendInput: ExtendDeadlineInput = {
          assignmentId: input.assignmentId,
          newDeadline: input.newDeadline,
          reason: input.reason,
          extendedBy: currentUser.id
        }

        await assignmentService.extendDeadline(extendInput)

        return {
          success: true,
          message: 'Дедлайн успешно продлен',
          errors: null
        }

      } catch (error) {
        handleResolverError(error)
      }
    }
  }),

  /**
   * Отмена назначения
   */
  cancelAssignment: t.field({
    type: 'MutationResult',
    description: 'Отменяет назначение потока',
    authScopes: { buddy: true },
    args: {
      assignmentId: t.arg.id({ required: true }),
      reason: t.arg.string({ required: true })
    },
    resolve: async (_, { assignmentId, reason }, context) => {
      try {
        const currentUser = requireBuddy(context)

        // Создаем сервисы
        const userRepository = new UserRepository()
        const flowRepository = new FlowRepository()
        const assignmentRepository = new FlowAssignmentRepository()
        
        const userService = new UserService(userRepository)
        const flowService = new FlowService(flowRepository, userRepository)
        const assignmentService = new FlowAssignmentService(assignmentRepository, userRepository, flowRepository)

        // Создаем Use Case
        const assignFlowUseCase = new AssignFlowUseCase(
          userService,
          flowService,
          assignmentService
        )

        // Отменяем назначение
        await assignFlowUseCase.cancelAssignment(assignmentId, reason, currentUser.id)

        return {
          success: true,
          message: 'Назначение отменено',
          errors: null
        }

      } catch (error) {
        handleResolverError(error)
      }
    }
  })
}))

export {}