/**
 * Типы ошибок сервисного слоя
 */
export enum ServiceErrorType {
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  CONFLICT = 'CONFLICT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Кастомный класс ошибки для сервисного слоя
 */
export class ServiceError extends Error {
  constructor(public type: ServiceErrorType, message: string) {
    super(message);
    this.name = 'ServiceError';
  }
} 