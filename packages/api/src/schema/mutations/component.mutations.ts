/**
 * GraphQL мутации для взаимодействия с компонентами
 * 
 * Реализует операции для прохождения различных типов компонентов:
 * статей, заданий, квизов и других типов контента.
 * 
 * Мутации:
 * - interactWithComponent: Основное взаимодействие с компонентом
 * - submitAnswer: Отправка ответа на задание/квиз
 * - updateProgress: Обновление прогресса прохождения
 * - markComponentComplete: Принудительное завершение компонента
 * - resetComponent: Сброс прогресса компонента
 */

import { builder } from '../index'
import { InteractWithComponentUseCase, ComponentInteractionInput } from '../../core/usecases/component/InteractWithComponentUseCase'
import { ComponentService } from '../../core/services/component/ComponentService'
import { ProgressService } from '../../core/services/progress/ProgressService'
import { ComponentRepository } from '../../core/repositories/ComponentRepository'
import { ProgressRepository } from '../../core/repositories/ProgressRepository'
import { handleResolverError, requireAuth } from '../index'
import { z } from 'zod'

/**
 * Валидационные схемы для компонентов
 */
const InteractWithComponentInputSchema = z.object({
  assignmentId: z.string().min(1, 'ID назначения обязателен'),
  componentId: z.string().min(1, 'ID компонента обязателен'),
  interactionType: z.enum(['VIEW', 'START', 'SUBMIT', 'COMPLETE'], {
    errorMap: () => ({ message: 'Некорректный тип взаимодействия' })
  }),
  data: z.record(z.any()).optional() // Дополнительные данные для конкретного типа компонента
})

const SubmitAnswerInputSchema = z.object({
  assignmentId: z.string().min(1),
  componentId: z.string().min(1),
  answerData: z.object({
    // Для квизов
    selectedOptionIds: z.array(z.string()).optional(),
    // Для заданий с кодовым словом
    codeWord: z.string().optional(),
    // Для текстовых ответов
    textAnswer: z.string().optional(),
    // Время, потраченное на ответ
    timeSpent: z.number().min(0).optional(),
    // Дополнительные файлы или данные
    attachments: z.array(z.string()).optional()
  })
})

/**
 * Входные типы для взаимодействия с компонентами
 */
builder.inputType('InteractWithComponentInput', {
  description: 'Данные для взаимодействия с компонентом',
  fields: (t) => ({
    assignmentId: t.id({ 
      required: true,
      description: 'ID назначения потока' 
    }),
    componentId: t.id({ 
      required: true,
      description: 'ID компонента для взаимодействия' 
    }),
    interactionType: t.field({
      type: 'ComponentInteractionType',
      required: true,
      description: 'Тип взаимодействия с компонентом'
    }),
    data: t.field({
      type: 'JSON',
      required: false,
      description: 'Дополнительные данные для специфичного типа компонента'
    })
  })
})

builder.inputType('SubmitAnswerInput', {
  description: 'Данные для отправки ответа на компонент',
  fields: (t) => ({
    assignmentId: t.id({ required: true }),
    componentId: t.id({ required: true }),
    answerData: t.field({
      type: 'AnswerData',
      required: true,
      description: 'Данные ответа пользователя'
    })
  })
})

builder.inputType('AnswerData', {
  description: 'Структура данных ответа',
  fields: (t) => ({
    selectedOptionIds: t.idList({ 
      required: false,
      description: 'Выбранные опции (для квизов)'
    }),
    codeWord: t.string({ 
      required: false,
      description: 'Кодовое слово (для заданий)'
    }),
    textAnswer: t.string({ 
      required: false,
      description: 'Текстовый ответ'
    }),
    timeSpent: t.int({ 
      required: false,
      description: 'Время в секундах, потраченное на компонент'
    }),
    attachments: t.stringList({ 
      required: false,
      description: 'Файлы, прикрепленные к ответу'
    })
  })
})

/**
 * Перечисления для типов взаимодействия
 */
builder.enumType('ComponentInteractionType', {
  description: 'Типы взаимодействия с компонентом',
  values: {
    VIEW: { 
      value: 'VIEW',
      description: 'Просмотр компонента' 
    },
    START: { 
      value: 'START',
      description: 'Начало взаимодействия' 
    },
    SUBMIT: { 
      value: 'SUBMIT',
      description: 'Отправка ответа' 
    },
    COMPLETE: { 
      value: 'COMPLETE',
      description: 'Завершение компонента' 
    }
  }
})

/**
 * Результирующие типы
 */
builder.objectType('ComponentInteractionResult', {
  description: 'Результат взаимодействия с компонентом',
  fields: (t) => ({
    success: t.boolean({
      description: 'Успешность операции'
    }),
    componentProgress: t.field({
      type: 'ComponentProgress',
      description: 'Обновленный прогресс компонента'
    }),
    nextAction: t.field({
      type: 'NextActionSuggestion',
      nullable: true,
      description: 'Предложение следующего действия'
    }),
    errors: t.stringList({
      description: 'Список ошибок, если есть'
    })
  })
})

builder.objectType('SubmitAnswerResult', {
  description: 'Результат отправки ответа',
  fields: (t) => ({
    success: t.boolean({
      description: 'Правильность ответа'
    }),
    score: t.int({
      nullable: true,
      description: 'Набранные баллы (для квизов)'
    }),
    feedback: t.string({
      nullable: true,
      description: 'Обратная связь по ответу'
    }),
    isCompleted: t.boolean({
      description: 'Завершен ли компонент после этого ответа'
    }),
    attemptsLeft: t.int({
      nullable: true,
      description: 'Оставшееся количество попыток'
    }),
    componentProgress: t.field({
      type: 'ComponentProgress',
      description: 'Обновленный прогресс компонента'
    }),
    flowProgress: t.field({
      type: 'FlowProgress',
      nullable: true,
      description: 'Обновленный прогресс всего потока'
    })
  })
})

builder.objectType('NextActionSuggestion', {
  description: 'Предложение следующего действия пользователю',
  fields: (t) => ({
    type: t.field({
      type: 'NextActionType',
      description: 'Тип предлагаемого действия'
    }),
    message: t.string({
      description: 'Сообщение пользователю'
    }),
    targetComponentId: t.id({
      nullable: true,
      description: 'ID следующего компонента, если применимо'
    })
  })
})

builder.enumType('NextActionType', {
  description: 'Типы предлагаемых действий',
  values: {
    CONTINUE_TO_NEXT: { value: 'CONTINUE_TO_NEXT' },
    RETRY_COMPONENT: { value: 'RETRY_COMPONENT' },
    REVIEW_STEP: { value: 'REVIEW_STEP' },
    COMPLETE_FLOW: { value: 'COMPLETE_FLOW' },
    CONTACT_BUDDY: { value: 'CONTACT_BUDDY' }
  }
})

/**
 * Мутации для работы с компонентами
 */
builder.mutationFields((t) => ({
  /**
   * Основное взаимодействие с компонентом
   */
  interactWithComponent: t.field({
    type: 'ComponentInteractionResult',
    description: 'Взаимодействие с компонентом (просмотр, начало, завершение)',
    args: {
      input: t.arg({ 
        type: 'InteractWithComponentInput', 
        required: true 
      })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Валидация входных данных
        const validatedInput = InteractWithComponentInputSchema.parse(input)
        
        // Создаем экземпляры сервисов
        const componentRepository = new ComponentRepository(context.prisma)
        const progressRepository = new ProgressRepository(context.prisma)
        const componentService = new ComponentService(componentRepository, progressRepository)
        
        // Создаем use case
        const interactWithComponentUseCase = new InteractWithComponentUseCase(
          componentService,
          progressRepository
        )
        
        // Выполняем взаимодействие
        const result = await interactWithComponentUseCase.execute({
          userId: currentUser.id,
          assignmentId: validatedInput.assignmentId,
          componentId: validatedInput.componentId,
          interactionType: validatedInput.interactionType,
          data: validatedInput.data
        })
        
        return {
          success: true,
          componentProgress: result.componentProgress,
          nextAction: result.nextAction,
          errors: []
        }
        
      } catch (error) {
        console.error('❌ Ошибка взаимодействия с компонентом:', error)
        return handleResolverError(error, 'Не удалось выполнить взаимодействие с компонентом')
      }
    }
  }),

  /**
   * Отправка ответа на компонент
   */
  submitAnswer: t.field({
    type: 'SubmitAnswerResult',
    description: 'Отправка ответа на задание или квиз',
    args: {
      input: t.arg({ 
        type: 'SubmitAnswerInput', 
        required: true 
      })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Валидация входных данных
        const validatedInput = SubmitAnswerInputSchema.parse(input)
        
        // Создаем экземпляры сервисов
        const componentRepository = new ComponentRepository(context.prisma)
        const progressRepository = new ProgressRepository(context.prisma)
        const componentService = new ComponentService(componentRepository, progressRepository)
        const progressService = new ProgressService(progressRepository, context.eventBus)
        
        // Обрабатываем отправку ответа
        const result = await componentService.submitAnswer({
          userId: currentUser.id,
          assignmentId: validatedInput.assignmentId,
          componentId: validatedInput.componentId,
          answerData: validatedInput.answerData
        })
        
        // Обновляем общий прогресс потока
        const flowProgress = await progressService.updateFlowProgress(
          validatedInput.assignmentId,
          currentUser.id
        )
        
        return {
          success: result.isCorrect,
          score: result.score,
          feedback: result.feedback,
          isCompleted: result.isCompleted,
          attemptsLeft: result.attemptsLeft,
          componentProgress: result.componentProgress,
          flowProgress: flowProgress
        }
        
      } catch (error) {
        console.error('❌ Ошибка отправки ответа:', error)
        return handleResolverError(error, 'Не удалось отправить ответ')
      }
    }
  }),

  /**
   * Принудительное завершение компонента (для админов/buddy)
   */
  markComponentComplete: t.field({
    type: 'ComponentInteractionResult',
    description: 'Принудительное завершение компонента (только для buddy/админов)',
    authScopes: { buddyOrAdmin: true },
    args: {
      assignmentId: t.arg.id({ required: true }),
      componentId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
      reason: t.arg.string({ required: false })
    },
    resolve: async (_, { assignmentId, componentId, userId, reason }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Создаем экземпляры сервисов
        const componentRepository = new ComponentRepository(context.prisma)
        const progressRepository = new ProgressRepository(context.prisma)
        const componentService = new ComponentService(componentRepository, progressRepository)
        
        // Принудительно завершаем компонент
        const result = await componentService.forceCompleteComponent({
          userId,
          assignmentId,
          componentId,
          completedBy: currentUser.id,
          reason
        })
        
        return {
          success: true,
          componentProgress: result.componentProgress,
          nextAction: result.nextAction,
          errors: []
        }
        
      } catch (error) {
        console.error('❌ Ошибка принудительного завершения:', error)
        return handleResolverError(error, 'Не удалось завершить компонент')
      }
    }
  }),

  /**
   * Сброс прогресса компонента
   */
  resetComponent: t.field({
    type: 'ComponentInteractionResult',
    description: 'Сброс прогресса компонента для повторного прохождения',
    authScopes: { buddyOrAdmin: true },
    args: {
      assignmentId: t.arg.id({ required: true }),
      componentId: t.arg.id({ required: true }),
      userId: t.arg.id({ required: true }),
      reason: t.arg.string({ required: false })
    },
    resolve: async (_, { assignmentId, componentId, userId, reason }, context) => {
      try {
        const currentUser = requireAuth(context)
        
        // Создаем экземпляры сервисов
        const componentRepository = new ComponentRepository(context.prisma)
        const progressRepository = new ProgressRepository(context.prisma)
        const componentService = new ComponentService(componentRepository, progressRepository)
        
        // Сбрасываем прогресс компонента
        const result = await componentService.resetComponent({
          userId,
          assignmentId,
          componentId,
          resetBy: currentUser.id,
          reason
        })
        
        return {
          success: true,
          componentProgress: result.componentProgress,
          nextAction: {
            type: 'RETRY_COMPONENT',
            message: 'Компонент сброшен, можно начать заново',
            targetComponentId: componentId
          },
          errors: []
        }
        
      } catch (error) {
        console.error('❌ Ошибка сброса компонента:', error)
        return handleResolverError(error, 'Не удалось сбросить компонент')
      }
    }
  })
}))

export {}