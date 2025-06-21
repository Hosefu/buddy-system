import { PrismaClient } from '@buddybot/database/generated';

/**
 * Параметры для пагинации
 */
export interface PaginationParams {
  page: number;
  limit: number;
}

/**
 * Типы ошибок репозитория
 */
export enum RepositoryErrorType {
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE = 'DUPLICATE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Кастомный класс ошибки для репозиториев
 */
export class RepositoryError extends Error {
  constructor(public type: RepositoryErrorType, message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * Базовый класс для всех репозиториев
 */
export abstract class BaseRepository {
  protected readonly prisma: PrismaClient;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }
}