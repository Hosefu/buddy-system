import { PrismaClient } from '@buddybot/database';
import { Request, Response } from 'express';

/**
 * Определяет структуру контекста, доступного во всех GraphQL резолверах.
 * 
 * @property prisma - Экземпляр PrismaClient для доступа к базе данных.
 * @property currentUser - Данные аутентифицированного пользователя (если он есть).
 * @property req - Объект запроса Express (может быть полезен для доступа к заголовкам).
 */
export interface GraphQLContext {
  req?: Request;
  res?: Response;
  prisma: PrismaClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentUser?: any;
} 