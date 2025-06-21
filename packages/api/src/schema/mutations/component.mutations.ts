/**
 * GraphQL мутации для взаимодействия с компонентами
 * 
 * Реализует операции для прохождения различных типов компонентов:
 * статей, заданий, квизов и других типов контента.
 * 
 * Ключевая особенность: все взаимодействия происходят со СНАПШОТАМИ компонентов,
 * а не с оригинальными компонентами!
 * 
 * Мутации:
 * - interactWithComponent: Универсальное взаимодействие с компонентом
 * - submitTaskAnswer: Отправка ответа на задание
 * - submitQuizAnswer: Отправка ответа на квиз
 * - updateReadingProgress: Обновление прогресса чтения статьи
 * - updateVideoProgress: Обновление прогресса просмотра видео
 * - resetComponentProgress: Сброс прогресса компонента
 */

import { builder } from '../index'
import { ProgressService } from '../../core/services/progress/ProgressService'
import { z } from 'zod'

// ===== ВАЛИДАЦИОННЫЕ СХЕМЫ =====

const InteractWithComponentInputSchema = z.object({
  assignmentId: z.string().min(1, 'ID назначения обязателен'),
  componentSnapshotId: z.string().min(1, 'ID снапшота компонента обязателен'),
  action: z.enum(['START_READING', 'FINISH_READING', 'SUBMIT_ANSWER', 'SUBMIT_QUIZ_ANSWER', 'START_VIDEO', 'UPDATE_VIDEO_PROGRESS', 'FINISH_VIDEO'], {
    errorMap: () => ({ message: 'Некорректное действие' })
  }),
  data: z.record(z.any()).optional()
})

// ===== ВХОДНЫЕ ТИПЫ =====

/**
 * Основной входной тип для взаимодействия с компонентом
 */
builder.inputType('InteractWithComponentInput', {
  description: 'Данные для взаимодействия с компонентом',
  fields: (t) => ({
    assignmentId: t.id({ 
      required: true,
      description: 'ID назначения потока' 
    }),
    componentSnapshotId: t.id({ 
      required: true,
      description: 'ID снапшота компонента (НЕ оригинального компонента!)' 
    }),
    action: t.field({
      type: 'ComponentAction',
      required: true,
      description: 'Тип действия с компонентом'
    }),
    
    // Типизированные данные для разных действий
    answerData: t.field({
      type: 'TaskAnswerInput',
      required: false,
      description: 'Данные ответа на задание'
    }),
    quizAnswerData: t.field({
      type: 'QuizAnswerInput',
      required: false,
      description: 'Данные ответа на квиз'
    }),
    readingData: t.field({
      type: 'ReadingProgressInput',
      required: false,
      description: 'Данные прогресса чтения'
    }),
    videoData: t.field({
      type: 'VideoProgressInput',
      required: false,
      description: 'Данные прогресса видео'
    }),
    
    // Метаданные
    timeSpent: t.int({
      required: false,
      description: 'Время, потраченное на действие (в секундах)'
    }),
    platform: t.string({
      required: false,
      description: 'Платформа (web, mobile, etc.)'
    })
  })
})

/**
 * Данные ответа на задание
 */
builder.inputType('TaskAnswerInput', {
  description: 'Данные для ответа на задание',
  fields: (t) => ({
    answer: t.string({
      required: true,
      description: 'Ответ пользователя'
    }),
    hintUsed: t.boolean({
      required: false,
      description: 'Использовалась ли подсказка'
    })
  })
})

/**
 * Данные ответа на квиз
 */
builder.inputType('QuizAnswerInput', {
  description: 'Данные для ответа на квиз',
  fields: (t) => ({
    questionId: t.id({
      required: true,
      description: 'ID вопроса'
    }),
    optionIds: t.idList({
      required: true,
      description: 'ID выбранных вариантов ответа'
    }),
    timeSpentOnQuestion: t.int({
      required: false,
      description: 'Время, потраченное на вопрос (в секундах)'
    })
  })
})

/**
 * Данные прогресса чтения
 */
builder.inputType('ReadingProgressInput', {
  description: 'Данные прогресса чтения статьи',
  fields: (t) => ({
    scrollProgress: t.float({
      required: true,
      description: 'Прогресс прокрутки (0.0-1.0)'
    }),
    timeSpent: t.int({
      required: true,
      description: 'Время чтения в данной сессии (в секундах)'
    }),
    reachedEnd: t.boolean({
      required: false,
      description: 'Достигнут ли конец статьи'
    })
  })
})

/**
 * Данные прогресса видео
 */
builder.inputType('VideoProgressInput', {
  description: 'Данные прогресса просмотра видео',
  fields: (t) => ({
    currentTime: t.int({
      required: true,
      description: 'Текущая позиция в видео (в секундах)'
    }),
    duration: t.int({
      required: true,
      description: 'Общая длительность видео (в секундах)'
    }),
    playbackSpeed: t.float({
      required: false,
      description: 'Скорость воспроизведения'
    }),
    watchedSegments: t.field({
      type: ['WatchedSegmentInput'],
      required: false,
      description: 'Просмотренные сегменты видео'
    })
  })
})

/**
 * Просмотренный сегмент видео
 */
builder.inputType('WatchedSegmentInput', {
  description: 'Сегмент видео, который был просмотрен',
  fields: (t) => ({
    startTime: t.int({
      required: true,
      description: 'Начало сегмента (в секундах)'
    }),
    endTime: t.int({
      required: true,
      description: 'Конец сегмента (в секундах)'
    })
  })
})

/**
 * Данные для полного ответа на квиз
 */
builder.inputType('CompleteQuizInput', {
  description: 'Данные для завершения квиза',
  fields: (t) => ({
    assignmentId: t.id({
      required: true,
      description: 'ID назначения'
    }),
    componentSnapshotId: t.id({
      required: true,
      description: 'ID снапшота компонента-квиза'
    }),
    answers: t.field({
      type: 'JSON',
      required: true,
      description: 'Ответы на все вопросы (questionId -> optionIds[])'
    }),
    timeSpent: t.int({
      required: true,
      description: 'Время прохождения квиза (в секундах)'
    }),
    startedAt: t.field({
      type: 'DateTime',
      required: true,
      description: 'Время начала прохождения квиза'
    })
  })
})

// ===== ОСНОВНЫЕ МУТАЦИИ =====

/**
 * Универсальная мутация для взаимодействия с компонентом
 */
builder.mutationField('interactWithComponent', (t) =>
  t.field({
    type: 'ProgressUpdateResult',
    description: 'Взаимодействие с компонентом (статья, задание, квиз, видео)',
    args: {
      input: t.arg({ 
        type: 'InteractWithComponentInput', 
        required: true,
        description: 'Данные взаимодействия с компонентом'
      })
    },
    resolve: async (_, { input }, context) => {
      try {
        // Проверяем авторизацию
        const currentUser = context.user
        if (!currentUser) {
          return {
            success: false,
            message: 'Необходима авторизация',
            errors: ['Пользователь не авторизован']
          }
        }

        // Валидируем входные данные
        const validatedInput = InteractWithComponentInputSchema.parse({
          assignmentId: input.assignmentId,
          componentSnapshotId: input.componentSnapshotId,
          action: input.action,
          data: {
            answerData: input.answerData,
            quizAnswerData: input.quizAnswerData,
            readingData: input.readingData,
            videoData: input.videoData,
            timeSpent: input.timeSpent,
            platform: input.platform
          }
        })

        // Получаем сервис прогресса
        const progressService = context.services.progressService as ProgressService

        // Формируем данные для обновления прогресса
        const updateData = {
          action: this.mapActionToProgressAction(input.action),
          data: this.prepareActionData(input),
          metadata: {
            platform: input.platform,
            ipAddress: context.req?.ip
          }
        }

        // Обновляем прогресс
        const result = await progressService.updateComponentProgress(
          currentUser.id,
          input.assignmentId,
          input.componentSnapshotId,
          updateData
        )

        // Формируем ответ
        return {
          success: true,
          message: this.getSuccessMessage(input.action, result.progress.status),
          componentProgress: result.progress,
          unlockResult: result.unlockResult,
          nextActions: this.generateNextActions(result.progress, result.unlockResult),
          errors: []
        }

      } catch (error) {
        console.error('Ошибка взаимодействия с компонентом:', error)
        
        return {
          success: false,
          message: 'Произошла ошибка при обработке действия',
          componentProgress: null,
          unlockResult: null,
          nextActions: [],
          errors: [error.message || 'Неизвестная ошибка']
        }
      }
    },
    
    // Вспомогательные методы
    mapActionToProgressAction(action: string): string {
      const actionMap = {
        'START_READING': 'START',
        'FINISH_READING': 'COMPLETE',
        'SUBMIT_ANSWER': 'SUBMIT_ANSWER',
        'SUBMIT_QUIZ_ANSWER': 'SUBMIT_ANSWER',
        'START_VIDEO': 'START',
        'UPDATE_VIDEO_PROGRESS': 'UPDATE_PROGRESS',
        'FINISH_VIDEO': 'COMPLETE'
      }
      return actionMap[action] || 'UPDATE_PROGRESS'
    },
    
    prepareActionData(input: any): Record<string, any> {
      const data: Record<string, any> = {}
      
      if (input.answerData) {
        data.answer = input.answerData.answer
        data.hintUsed = input.answerData.hintUsed
      }
      
      if (input.quizAnswerData) {
        data.answers = {
          [input.quizAnswerData.questionId]: input.quizAnswerData.optionIds
        }
        data.timeSpent = input.quizAnswerData.timeSpentOnQuestion
      }
      
      if (input.readingData) {
        data.scrollProgress = input.readingData.scrollProgress
        data.timeSpent = input.readingData.timeSpent
        data.reachedEnd = input.readingData.reachedEnd
      }
      
      if (input.videoData) {
        data.currentTime = input.videoData.currentTime
        data.duration = input.videoData.duration
        data.playbackSpeed = input.videoData.playbackSpeed
        data.watchedSegments = input.videoData.watchedSegments
      }
      
      if (input.timeSpent) {
        data.timeSpent = input.timeSpent
      }
      
      return data
    },
    
    getSuccessMessage(action: string, status: string): string {
      switch (action) {
        case 'START_READING':
          return 'Чтение статьи начато'
        case 'FINISH_READING':
          return 'Статья прочитана! Отлично!'
        case 'SUBMIT_ANSWER':
          return status === 'COMPLETED' ? 'Правильно! Задание выполнено!' : 'Ответ принят. Попробуйте еще раз.'
        case 'SUBMIT_QUIZ_ANSWER':
          return 'Ответ на вопрос сохранен'
        case 'START_VIDEO':
          return 'Просмотр видео начат'
        case 'UPDATE_VIDEO_PROGRESS':
          return 'Прогресс видео обновлен'
        case 'FINISH_VIDEO':
          return 'Видео просмотрено полностью!'
        default:
          return 'Прогресс обновлен'
      }
    },
    
    generateNextActions(progress: any, unlockResult: any): string[] {
      const actions: string[] = []
      
      if (progress.status === 'COMPLETED') {
        actions.push('COMPONENT_COMPLETED')
        
        if (unlockResult.hasNewUnlocks) {
          actions.push('NEW_CONTENT_UNLOCKED')
        }
      } else if (progress.status === 'IN_PROGRESS') {
        actions.push('CONTINUE_COMPONENT')
      }
      
      return actions
    }
  })
)

/**
 * Завершение квиза с полными ответами
 */
builder.mutationField('completeQuiz', (t) =>
  t.field({
    type: 'ProgressUpdateResult',
    description: 'Завершение прохождения квиза с полными ответами',
    args: {
      input: t.arg({ 
        type: 'CompleteQuizInput', 
        required: true 
      })
    },
    resolve: async (_, { input }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          return {
            success: false,
            message: 'Необходима авторизация',
            errors: ['Пользователь не авторизован']
          }
        }

        const progressService = context.services.progressService as ProgressService

        const updateData = {
          action: 'SUBMIT_ANSWER',
          data: {
            answers: input.answers,
            timeSpent: input.timeSpent,
            startedAt: input.startedAt
          },
          metadata: {
            platform: 'web',
            ipAddress: context.req?.ip
          }
        }

        const result = await progressService.updateComponentProgress(
          currentUser.id,
          input.assignmentId,
          input.componentSnapshotId,
          updateData
        )

        const quizData = result.progress.progressData as any
        const passed = quizData?.passed || false
        const score = quizData?.currentScore || 0

        return {
          success: true,
          message: passed 
            ? `Отлично! Вы прошли квиз с результатом ${score}%`
            : `Квиз завершен. Результат: ${score}%. Попробуйте еще раз для улучшения результата.`,
          componentProgress: result.progress,
          unlockResult: result.unlockResult,
          nextActions: passed ? ['QUIZ_PASSED', 'CONTINUE_LEARNING'] : ['QUIZ_FAILED', 'RETRY_QUIZ'],
          errors: []
        }

      } catch (error) {
        console.error('Ошибка завершения квиза:', error)
        
        return {
          success: false,
          message: 'Произошла ошибка при обработке результатов квиза',
          componentProgress: null,
          unlockResult: null,
          nextActions: [],
          errors: [error.message || 'Неизвестная ошибка']
        }
      }
    }
  })
)

/**
 * Сброс прогресса компонента
 */
builder.mutationField('resetComponentProgress', (t) =>
  t.field({
    type: 'ProgressUpdateResult',
    description: 'Сброс прогресса компонента для повторного прохождения',
    args: {
      assignmentId: t.arg.id({ 
        required: true,
        description: 'ID назначения'
      }),
      componentSnapshotId: t.arg.id({ 
        required: true,
        description: 'ID снапшота компонента'
      })
    },
    resolve: async (_, { assignmentId, componentSnapshotId }, context) => {
      try {
        const currentUser = context.user
        if (!currentUser) {
          return {
            success: false,
            message: 'Необходима авторизация',
            errors: ['Пользователь не авторизован']
          }
        }

        const progressService = context.services.progressService as ProgressService

        const resetProgress = await progressService.resetComponentProgress(
          currentUser.id,
          assignmentId,
          componentSnapshotId
        )

        return {
          success: true,
          message: 'Прогресс компонента сброшен. Вы можете начать заново.',
          componentProgress: resetProgress,
          unlockResult: {
            hasNewUnlocks: false,
            newUnlockedStepIds: [],
            newUnlockedComponentIds: [],
            messages: []
          },
          nextActions: ['RESTART_COMPONENT'],
          errors: []
        }

      } catch (error) {
        console.error('Ошибка сброса прогресса:', error)
        
        return {
          success: false,
          message: 'Не удалось сбросить прогресс компонента',
          componentProgress: null,
          unlockResult: null,
          nextActions: [],
          errors: [error.message || 'Неизвестная ошибка']
        }
      }
    }
  })
)