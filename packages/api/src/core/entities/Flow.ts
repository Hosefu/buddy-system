import { Flow as PrismaFlow, FlowStep as PrismaFlowStep, User as PrismaUser, Prisma } from '@buddybot/database';

/**
 * @namespace Core.Entities
 *
 * @description
 * Этот неймспейс содержит доменные сущности, которые представляют
 * основные бизнес-объекты системы. Они не зависят от способа хранения
 * и определяют структуру и базовую логику бизнес-правил.
 */

/**
 * @class Flow
 * @description
 * Представляет шаблон обучающего потока.
 * Это "чертеж", который используется для создания индивидуальных
 * `FlowSnapshot` для пользователей.
 * Содержит в себе последовательность шагов (`FlowStep`).
 */
export class Flow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  version: string;
  title: string;
  description: string;
  isActive: boolean;
  defaultDeadlineDays?: number | null;
  creatorId: string;
  creator?: PrismaUser; // Опционально для избежания цикличных зависимостей
  steps: FlowStep[];

  constructor(data: PrismaFlow & { steps: (PrismaFlowStep & { components: Prisma.JsonValue[] })[] }) {
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.version = data.version;
    this.title = data.title;
    this.description = data.description;
    this.isActive = data.isActive;
    this.defaultDeadlineDays = data.defaultDeadlineDays;
    this.creatorId = data.creatorId;
    this.steps = data.steps.map(step => new FlowStep(step));
  }
}

/**
 * @class FlowStep
 * @description
 * Представляет шаблон шага внутри `Flow`.
 * Содержит в себе набор компонентов (`FlowComponent`).
 */
export class FlowStep {
  id: string;
  order: number;
  title: string;
  description: string;
  flowId: string;
  components: Prisma.JsonValue[];

  constructor(data: PrismaFlowStep & { components: Prisma.JsonValue[] }) {
    this.id = data.id;
    this.order = data.order;
    this.title = data.title;
    this.description = data.description;
    this.flowId = data.flowId;
    this.components = data.components;
  }
} 