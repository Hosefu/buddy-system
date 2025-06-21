import { builder } from '../index';

/**
 * GraphQL тип для модели Flow (Поток обучения).
 * 
 * Основан на Prisma-модели `Flow`.
 */
builder.prismaObject('Flow', {
  fields: (t) => ({
    id: t.exposeID('id'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
    title: t.exposeString('title'),
    description: t.exposeString('description', { nullable: true }),
    defaultDeadline: t.int({
      nullable: true,
      resolve: (flow) => flow.defaultDeadline,
      description: 'Срок выполнения по умолчанию в днях',
    }),
    
    // Связь с создателем потока
    creator: t.relation('creator'),

    // TODO: Добавить поля для content, assignments, components, когда их типы будут определены.
    // content: t.expose('content', { type: 'Json' })
    // assignments: t.relation('assignments')
    // components: t.relation('components')
  }),
}); 