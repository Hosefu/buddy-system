import { GraphQLContext } from '../types';
import { GraphQLError } from 'graphql';

/**
 * Хелпер для проверки аутентификации в резолверах.
 * 
 * Проверяет, есть ли пользователь в контексте. Если нет, выбрасывает
 * ошибку GraphQL `UNAUTHENTICATED`.
 * 
 * @param context - GraphQL контекст.
 * @returns - Текущего пользователя, если он аутентифицирован.
 * @throws {GraphQLError} - Если пользователь не аутентифицирован.
 */
export function requireAuth(context: GraphQLContext) {
  if (!context.currentUser) {
    throw new GraphQLError('Вы должны быть аутентифицированы для выполнения этого действия.', {
      extensions: {
        code: 'UNAUTHENTICATED',
        http: { status: 401 },
      },
    });
  }
  return context.currentUser;
}

/**
 * Хелпер для проверки роли пользователя.
 * 
 * Проверяет, входит ли роль текущего пользователя в список разрешенных ролей.
 * Если нет, выбрасывает ошибку GraphQL `FORBIDDEN`.
 * 
 * @param context - GraphQL контекст.
 * @param allowedRoles - Массив разрешенных ролей.
 */
export function requireRole(context: GraphQLContext, allowedRoles: string[]) {
  const currentUser = requireAuth(context);

  if (!allowedRoles.includes(currentUser.role)) {
    throw new GraphQLError('У вас недостаточно прав для выполнения этого действия.', {
      extensions: {
        code: 'FORBIDDEN',
        http: { status: 403 },
      },
    });
  }
} 