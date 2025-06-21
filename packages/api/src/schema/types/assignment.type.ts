import { builder } from '../index';
import { AssignmentStatus } from '../../../../database/src/client';

/**
 * GraphQL тип для модели FlowAssignment (Назначение потока).
 */
builder.prismaObject('FlowAssignment', {
  fields: (t) => ({
    id: t.exposeID('id'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    deadline: t.expose('deadline', { type: 'DateTime' }),
    startedAt: t.expose('startedAt', { type: 'DateTime', nullable: true }),
    completedAt: t.expose('completedAt', { type: 'DateTime', nullable: true }),
    status: t.expose('status', { type: AssignmentStatus }),
    
    // Связи
    user: t.relation('user'),
    flow: t.relation('flow'),
    buddies: t.relation('buddies'),
  }),
});

/**
 * Регистрируем Prisma Enum `AssignmentStatus` в GraphQL схеме.
 */
builder.enumType(AssignmentStatus, {
  name: 'AssignmentStatus',
});

 