import {
  FlowSnapshot as PrismaFlowSnapshot,
  FlowStepSnapshot as PrismaFlowStepSnapshot,
  ComponentSnapshot as PrismaComponentSnapshot,
} from '@buddybot/database';
import { ComponentDataType, IArticleComponentData, IQuizComponentData, ITaskComponentData } from './ComponentData';

/**
 * @class FlowSnapshot
 * @description
 * Представляет индивидуальную, неизменяемую копию (снапшот)
 * обучающего потока, созданную для конкретного пользователя
 * в момент назначения.
 */
export class FlowSnapshot {
  id: string;
  createdAt: Date;
  title: string;
  description: string;
  originalFlowId: string;
  originalFlowVersion: string;
  assignmentId: string;
  steps: FlowStepSnapshot[];

  constructor(data: PrismaFlowSnapshot & { steps: (PrismaFlowStepSnapshot & { components: PrismaComponentSnapshot[] })[] }) {
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.title = data.title;
    this.description = data.description;
    this.originalFlowId = data.originalFlowId;
    this.originalFlowVersion = data.originalFlowVersion;
    this.assignmentId = data.assignmentId;
    this.steps = data.steps.map(step => new FlowStepSnapshot(step));
  }
}

/**
 * @class FlowStepSnapshot
 * @description
 * Снапшот шага внутри `FlowSnapshot`.
 */
export class FlowStepSnapshot {
  id: string;
  order: number;
  title: string;
  description: string;
  snapshotId: string;
  components: ComponentSnapshot[];

  constructor(data: PrismaFlowStepSnapshot & { components: PrismaComponentSnapshot[] }) {
    this.id = data.id;
    this.order = data.order;
    this.title = data.title;
    this.description = data.description;
    this.snapshotId = data.snapshotId;
    this.components = data.components.map(comp => new ComponentSnapshot(comp));
  }
}

/**
 * @class ComponentSnapshot
 * @description
 * Снапшот компонента — атомарная единица контента, с которой
 * взаимодействует пользователь.
 */
export class ComponentSnapshot {
  id: string;
  order: number;
  isRequired: boolean;
  type: string;
  typeVersion: string;
  data: ComponentDataType; // Теперь data типизирована
  stepId: string;

  constructor(data: PrismaComponentSnapshot) {
    this.id = data.id;
    this.order = data.order;
    this.isRequired = data.isRequired;
    this.type = data.type;
    this.typeVersion = data.typeVersion;
    this.data = data.data as unknown as ComponentDataType; // Приведение типа через unknown
    this.stepId = data.stepId;
  }

  /**
   * Возвращает типизированные данные компонента на основе его типа.
   * @returns {ComponentDataType}
   */
  getTypedData(): ComponentDataType {
    switch (this.type) {
      case 'article':
        return this.data as IArticleComponentData;
      case 'task':
        return this.data as ITaskComponentData;
      case 'quiz':
        return this.data as IQuizComponentData;
      // Добавьте другие типы по мере их реализации
      default:
        return this.data; // Возвращаем как есть, если тип неизвестен
    }
  }
} 