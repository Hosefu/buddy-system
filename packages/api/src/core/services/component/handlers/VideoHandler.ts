/**
 * VideoHandler - обработчик компонентов-видео
 * 
 * Файл: packages/api/src/core/services/component/handlers/VideoHandler.ts
 * 
 * Обрабатывает взаимодействие с видеоматериалами:
 * - Отслеживание прогресса просмотра
 * - Проверка минимального времени просмотра
 * - Обработка пауз и перемоток
 * - Контроль обязательных сегментов
 */

import { BaseComponentHandler, ValidationResult } from './BaseComponentHandler'
import { ComponentAction } from '../../../usecases/component/InteractWithComponentUseCase'
import { ComponentHandlerResult } from '../ComponentFactory'
import { ComponentProgress } from '../../../entities/ComponentProgress'

// ===== ИНТЕРФЕЙСЫ =====

export interface VideoProgressData {
  /** Текущая позиция воспроизведения (в секундах) */
  currentTime?: number
  /** Общая длительность видео (в секундах) */
  duration?: number
  /** Скорость воспроизведения */
  playbackRate?: number
  /** Просмотренные сегменты */
  watchedSegments?: WatchedSegment[]
  /** Время просмотра в этой сессии (в секундах) */
  sessionTime?: number
  /** Было ли видео просмотрено полностью */
  fullyWatched?: boolean
  /** Событие воспроизведения */
  event?: 'play' | 'pause' | 'seek' | 'ended' | 'timeupdate'
}

export interface WatchedSegment {
  /** Начало сегмента (в секундах) */
  startTime: number
  /** Конец сегмента (в секундах) */
  endTime: number
  /** Скорость просмотра этого сегмента */
  playbackRate?: number
}

export interface VideoContent {
  /** URL видеофайла */
  videoUrl: string
  /** Длительность видео (в секундах) */
  duration?: number
  /** Миниатюра видео */
  thumbnail?: string
  /** Субтитры */
  subtitles?: VideoSubtitle[]
  /** Главы/разделы видео */
  chapters?: VideoChapter[]
  /** Настройки просмотра */
  settings?: {
    /** Требуется ли полный просмотр */
    requireFullWatch?: boolean
    /** Минимальный процент просмотра для завершения */
    minWatchPercentage?: number
    /** Максимальная скорость воспроизведения */
    maxPlaybackRate?: number
    /** Разрешить перемотку вперед */
    allowSeekForward?: boolean
    /** Обязательные сегменты для просмотра */
    requiredSegments?: TimeSegment[]
  }
  /** Описание видео */
  description?: string
}

export interface VideoSubtitle {
  /** Язык субтитров */
  language: string
  /** URL файла субтитров */
  url: string
  /** Название языка */
  label: string
}

export interface VideoChapter {
  /** Название главы */
  title: string
  /** Время начала (в секундах) */
  startTime: number
  /** Время окончания (в секундах) */
  endTime: number
  /** Описание главы */
  description?: string
}

export interface TimeSegment {
  /** Начало сегмента (в секундах) */
  start: number
  /** Конец сегмента (в секундах) */
  end: number
  /** Название сегмента */
  name?: string
}

export interface VideoWatchStats {
  /** Общее время просмотра */
  totalWatchTime: number
  /** Процент просмотренного видео */
  watchPercentage: number
  /** Количество пауз */
  pauseCount: number
  /** Количество перемоток */
  seekCount: number
  /** Средняя скорость воспроизведения */
  averagePlaybackRate: number
  /** Просмотренные сегменты */
  watchedSegments: WatchedSegment[]
  /** Процент обязательных сегментов */
  requiredSegmentsPercent: number
}

// ===== ОСНОВНОЙ ОБРАБОТЧИК =====

export class VideoHandler extends BaseComponentHandler {
  
  // ===== СТАТИЧЕСКИЕ МЕТОДЫ =====

  /**
   * Поддерживаемые действия для видео
   */
  static getSupportedActions(): string[] {
    return [
      'START_VIDEO',
      'UPDATE_VIDEO_PROGRESS',
      'FINISH_VIDEO',
      'MARK_COMPLETED'
    ]
  }

  /**
   * Валидация схемы данных видео
   */
  static validateSchema(componentData: any): ValidationResult {
    const errors: string[] = []

    if (!componentData.content) {
      errors.push('Отсутствует содержимое видео')
    }

    const content = componentData.content
    if (!content.videoUrl) {
      errors.push('Отсутствует URL видео')
    }

    if (content.duration !== undefined && (typeof content.duration !== 'number' || content.duration <= 0)) {
      errors.push('Длительность видео должна быть положительным числом')
    }

    // Валидация настроек
    const settings = content.settings
    if (settings) {
      if (settings.minWatchPercentage !== undefined) {
        if (typeof settings.minWatchPercentage !== 'number' || settings.minWatchPercentage < 0 || settings.minWatchPercentage > 1) {
          errors.push('Минимальный процент просмотра должен быть от 0 до 1')
        }
      }

      if (settings.maxPlaybackRate !== undefined) {
        if (typeof settings.maxPlaybackRate !== 'number' || settings.maxPlaybackRate <= 0) {
          errors.push('Максимальная скорость воспроизведения должна быть положительным числом')
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  // ===== ОСНОВНЫЕ МЕТОДЫ =====

  /**
   * Обрабатывает действие с видео
   */
  protected async processAction(
    action: ComponentAction,
    data: VideoProgressData
  ): Promise<ComponentHandlerResult> {
    switch (action) {
      case 'START_VIDEO':
        return this.handleStartVideo(data)
        
      case 'UPDATE_VIDEO_PROGRESS':
        return this.handleUpdateProgress(data)
        
      case 'FINISH_VIDEO':
        return this.handleFinishVideo(data)
        
      case 'MARK_COMPLETED':
        return this.handleMarkCompleted(data)
        
      default:
        return this.createErrorResult(`Неподдерживаемое действие: ${action}`)
    }
  }

  /**
   * Валидация данных прогресса видео
   */
  protected validateActionData(action: ComponentAction, data: VideoProgressData): ValidationResult {
    const errors: string[] = []

    switch (action) {
      case 'UPDATE_VIDEO_PROGRESS':
        if (data.currentTime !== undefined && (typeof data.currentTime !== 'number' || data.currentTime < 0)) {
          errors.push('Текущее время должно быть неотрицательным числом')
        }
        
        if (data.duration !== undefined && (typeof data.duration !== 'number' || data.duration <= 0)) {
          errors.push('Длительность должна быть положительным числом')
        }

        if (data.playbackRate !== undefined && (typeof data.playbackRate !== 'number' || data.playbackRate <= 0)) {
          errors.push('Скорость воспроизведения должна быть положительным числом')
        }
        break

      case 'FINISH_VIDEO':
        if (!data.sessionTime || data.sessionTime <= 0) {
          errors.push('Время просмотра должно быть положительным числом')
        }
        break
    }

    // Валидация просмотренных сегментов
    if (data.watchedSegments) {
      data.watchedSegments.forEach((segment, index) => {
        if (segment.startTime >= segment.endTime) {
          errors.push(`Сегмент ${index + 1}: время начала должно быть меньше времени окончания`)
        }
        if (segment.startTime < 0 || segment.endTime < 0) {
          errors.push(`Сегмент ${index + 1}: время не может быть отрицательным`)
        }
      })
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Проверка завершенности видео
   */
  protected isCompleted(
    action: ComponentAction,
    data: VideoProgressData,
    currentProgress?: ComponentProgress
  ): boolean {
    if (action === 'MARK_COMPLETED' || action === 'FINISH_VIDEO') {
      return true
    }

    const content = this.getVideoContent()
    if (!content) return false

    const settings = content.settings || {}
    const stats = this.calculateWatchStats(data, currentProgress)

    // Проверяем требование полного просмотра
    if (settings.requireFullWatch) {
      return stats.watchPercentage >= 95 // 95% считается полным просмотром
    }

    // Проверяем минимальный процент просмотра
    const minPercentage = settings.minWatchPercentage || 0.8 // По умолчанию 80%
    if (stats.watchPercentage < minPercentage * 100) {
      return false
    }

    // Проверяем обязательные сегменты
    if (settings.requiredSegments?.length) {
      return stats.requiredSegmentsPercent >= 90 // 90% обязательных сегментов
    }

    return stats.watchPercentage >= minPercentage * 100
  }

  /**
   * Вычисление прогресса в процентах
   */
  protected calculateProgress(
    action: ComponentAction,
    data: VideoProgressData,
    currentProgress?: ComponentProgress
  ): number {
    if (this.isCompleted(action, data, currentProgress)) {
      return 100
    }

    const stats = this.calculateWatchStats(data, currentProgress)
    return Math.min(stats.watchPercentage, 99) // Максимум 99% без полного завершения
  }

  // ===== ОБРАБОТЧИКИ ДЕЙСТВИЙ =====

  /**
   * Обработка начала просмотра
   */
  private async handleStartVideo(data: VideoProgressData): Promise<ComponentHandlerResult> {
    this.logUserAction('START_VIDEO', {
      videoUrl: this.getVideoContent()?.videoUrl,
      startTime: Date.now()
    })

    // Инициализируем метрики просмотра
    this.metrics.customMetrics = {
      ...this.metrics.customMetrics,
      videoStarted: true,
      startTimestamp: Date.now(),
      pauseCount: 0,
      seekCount: 0
    }

    const content = this.getVideoContent()
    
    return this.createSuccessResult('Просмотр видео начат', {
      action: 'video_started',
      progress: 0,
      duration: content?.duration,
      chapters: content?.chapters,
      allowSeekForward: content?.settings?.allowSeekForward !== false
    })
  }

  /**
   * Обработка обновления прогресса
   */
  private async handleUpdateProgress(data: VideoProgressData): Promise<ComponentHandlerResult> {
    const stats = this.calculateWatchStats(data, this.context.currentProgress)
    
    // Отслеживаем события
    if (data.event) {
      this.trackVideoEvent(data.event, data)
    }

    // Проверяем ограничения скорости воспроизведения
    const speedViolation = this.checkPlaybackSpeedViolation(data)
    if (speedViolation) {
      return this.createErrorResult(speedViolation)
    }

    this.logUserAction('UPDATE_VIDEO_PROGRESS', {
      currentTime: data.currentTime,
      watchPercentage: stats.watchPercentage,
      event: data.event
    })

    const milestones = this.checkProgressMilestones(stats.watchPercentage)

    return this.createSuccessResult('Прогресс просмотра обновлен', {
      action: 'progress_updated',
      progress: stats.watchPercentage,
      currentTime: data.currentTime,
      watchedTime: stats.totalWatchTime,
      milestones,
      requiredSegmentsProgress: stats.requiredSegmentsPercent
    })
  }

  /**
   * Обработка завершения просмотра
   */
  private async handleFinishVideo(data: VideoProgressData): Promise<ComponentHandlerResult> {
    const stats = this.calculateWatchStats(data, this.context.currentProgress)
    
    this.logUserAction('FINISH_VIDEO', {
      totalWatchTime: stats.totalWatchTime,
      watchPercentage: stats.watchPercentage,
      completed: this.isCompleted('FINISH_VIDEO', data, this.context.currentProgress)
    })

    return this.createSuccessResult('Просмотр видео завершен', {
      action: 'video_finished',
      progress: 100,
      completed: true,
      watchStats: stats
    })
  }

  /**
   * Обработка ручного завершения
   */
  private async handleMarkCompleted(data: VideoProgressData): Promise<ComponentHandlerResult> {
    this.logUserAction('MARK_COMPLETED')

    return this.createSuccessResult('Видео отмечено как просмотренное', {
      action: 'manually_completed',
      progress: 100,
      completed: true
    })
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  /**
   * Получение содержимого видео
   */
  private getVideoContent(): VideoContent | null {
    return this.context.componentSnapshot?.content || null
  }

  /**
   * Вычисление статистики просмотра
   */
  private calculateWatchStats(data: VideoProgressData, currentProgress?: ComponentProgress): VideoWatchStats {
    const content = this.getVideoContent()
    const duration = content?.duration || data.duration || 0
    
    // Получаем существующие данные прогресса
    const existingData = currentProgress?.progressData as any || {}
    const existingSegments: WatchedSegment[] = existingData.watchedSegments || []
    
    // Объединяем просмотренные сегменты
    const allSegments = [...existingSegments, ...(data.watchedSegments || [])]
    const mergedSegments = this.mergeWatchedSegments(allSegments)
    
    // Вычисляем общее время просмотра
    const totalWatchTime = mergedSegments.reduce((sum, segment) => {
      return sum + (segment.endTime - segment.startTime)
    }, 0)

    // Вычисляем процент просмотра
    const watchPercentage = duration > 0 ? Math.min((totalWatchTime / duration) * 100, 100) : 0

    // Вычисляем прогресс по обязательным сегментам
    const requiredSegmentsPercent = this.calculateRequiredSegmentsProgress(mergedSegments)

    return {
      totalWatchTime,
      watchPercentage,
      pauseCount: existingData.pauseCount || 0,
      seekCount: existingData.seekCount || 0,
      averagePlaybackRate: this.calculateAveragePlaybackRate(mergedSegments),
      watchedSegments: mergedSegments,
      requiredSegmentsPercent
    }
  }

  /**
   * Объединение перекрывающихся сегментов просмотра
   */
  private mergeWatchedSegments(segments: WatchedSegment[]): WatchedSegment[] {
    if (segments.length === 0) return []

    // Сортируем по времени начала
    const sorted = segments.sort((a, b) => a.startTime - b.startTime)
    const merged: WatchedSegment[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]

      if (current.startTime <= last.endTime) {
        // Сегменты пересекаются, объединяем их
        last.endTime = Math.max(last.endTime, current.endTime)
      } else {
        // Новый непересекающийся сегмент
        merged.push(current)
      }
    }

    return merged
  }

  /**
   * Вычисление прогресса по обязательным сегментам
   */
  private calculateRequiredSegmentsProgress(watchedSegments: WatchedSegment[]): number {
    const content = this.getVideoContent()
    const requiredSegments = content?.settings?.requiredSegments || []
    
    if (requiredSegments.length === 0) return 100

    let totalRequiredTime = 0
    let watchedRequiredTime = 0

    requiredSegments.forEach(required => {
      const segmentDuration = required.end - required.start
      totalRequiredTime += segmentDuration

      // Проверяем, сколько из этого сегмента было просмотрено
      watchedSegments.forEach(watched => {
        const overlapStart = Math.max(required.start, watched.startTime)
        const overlapEnd = Math.min(required.end, watched.endTime)
        
        if (overlapStart < overlapEnd) {
          watchedRequiredTime += overlapEnd - overlapStart
        }
      })
    })

    return totalRequiredTime > 0 ? (watchedRequiredTime / totalRequiredTime) * 100 : 100
  }

  /**
   * Вычисление средней скорости воспроизведения
   */
  private calculateAveragePlaybackRate(segments: WatchedSegment[]): number {
    if (segments.length === 0) return 1

    let totalTime = 0
    let weightedSum = 0

    segments.forEach(segment => {
      const duration = segment.endTime - segment.startTime
      const rate = segment.playbackRate || 1
      
      totalTime += duration
      weightedSum += duration * rate
    })

    return totalTime > 0 ? weightedSum / totalTime : 1
  }

  /**
   * Отслеживание событий видео
   */
  private trackVideoEvent(event: string, data: VideoProgressData): void {
    const metrics = this.metrics.customMetrics || {}

    switch (event) {
      case 'pause':
        metrics.pauseCount = (metrics.pauseCount || 0) + 1
        break
      case 'seek':
        metrics.seekCount = (metrics.seekCount || 0) + 1
        break
    }

    this.metrics.customMetrics = metrics
  }

  /**
   * Проверка нарушения скорости воспроизведения
   */
  private checkPlaybackSpeedViolation(data: VideoProgressData): string | null {
    const content = this.getVideoContent()
    const maxRate = content?.settings?.maxPlaybackRate || 3.0

    if (data.playbackRate && data.playbackRate > maxRate) {
      return `Скорость воспроизведения не может превышать ${maxRate}x`
    }

    return null
  }

  /**
   * Проверка важных этапов прогресса
   */
  private checkProgressMilestones(watchPercentage: number): string[] {
    const milestones: string[] = []

    if (watchPercentage >= 25 && watchPercentage < 50) {
      milestones.push('quarter_watched')
    } else if (watchPercentage >= 50 && watchPercentage < 75) {
      milestones.push('half_watched')
    } else if (watchPercentage >= 75 && watchPercentage < 100) {
      milestones.push('three_quarters_watched')
    } else if (watchPercentage >= 100) {
      milestones.push('fully_watched')
    }

    return milestones
  }

  /**
   * Дополнительная валидация бизнес-правил
   */
  protected async validateBusinessRules(action: ComponentAction, data: VideoProgressData): Promise<void> {
    const content = this.getVideoContent()
    
    if (action === 'UPDATE_VIDEO_PROGRESS' && content?.settings?.allowSeekForward === false) {
      // Проверяем, что пользователь не перематывает вперед
      const currentProgress = this.context.currentProgress?.progressData as any
      const lastPosition = currentProgress?.lastPosition || 0
      
      if (data.currentTime && data.currentTime > lastPosition + 5) { // Допускаем небольшую погрешность
        throw new Error('Перемотка вперед не разрешена для этого видео')
      }
    }

    // Проверяем ограничения времени просмотра
    if (data.sessionTime && data.sessionTime > 86400) { // Больше суток
      throw new Error('Время просмотра не может превышать 24 часа')
    }
  }

  /**
   * Отслеживание аналитики видео
   */
  protected async trackAnalytics(
    action: ComponentAction,
    result: ComponentHandlerResult
  ): Promise<void> {
    if (action === 'FINISH_VIDEO' && result.data?.watchStats) {
      const stats = result.data.watchStats as VideoWatchStats

      this.metrics.customMetrics = {
        ...this.metrics.customMetrics,
        finalWatchPercentage: stats.watchPercentage,
        totalWatchTime: stats.totalWatchTime,
        averagePlaybackRate: stats.averagePlaybackRate,
        pauseCount: stats.pauseCount,
        seekCount: stats.seekCount,
        completedRequiredSegments: stats.requiredSegmentsPercent >= 90
      }
    }
  }
}

/**
 * Экспорт типов
 */
export type { 
  VideoProgressData, 
  VideoContent, 
  WatchedSegment, 
  VideoWatchStats,
  VideoSubtitle,
  VideoChapter,
  TimeSegment
}