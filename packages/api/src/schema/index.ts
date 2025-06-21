import SchemaBuilder from '@pothos/core';
import PrismaPlugin from '@pothos/plugin-prisma';
import ScopeAuthPlugin from '@pothos/plugin-scope-auth';
import { prisma, Prisma } from '@buddybot/database';
import type PrismaTypes from '@buddybot/database/generated/pothos-types';
import { GraphQLContext } from '../types';

export const builder = new SchemaBuilder<{
  PrismaTypes: PrismaTypes;
  Context: GraphQLContext;
  Scalars: {
    DateTime: {
      Input: Date;
      Output: Date;
    };
  };
  AuthScopes: {
    public: boolean;
    user: boolean;
    admin: boolean;
    buddy: boolean;
  };
}>({
  plugins: [ScopeAuthPlugin, PrismaPlugin],
  prisma: {
    client: prisma,
    // экспозиция всех моделей Crud
    exposeDescriptions: true,
    // фильтрация по связанным моделям
    filterConnectionTotalCount: true,
    onUnusedQuery: process.env.NODE_ENV === 'production' ? null : 'warn',
  },
  authScopes: async (context) => ({
    public: true,
    user: !!context.currentUser,
    admin: context.currentUser?.roles.includes('ADMIN') ?? false,
    buddy: context.currentUser?.roles.includes('BUDDY') ?? false,
  }),
});

// Инициализация корневых типов Query и Mutation
builder.queryType({});
builder.mutationType({}); 