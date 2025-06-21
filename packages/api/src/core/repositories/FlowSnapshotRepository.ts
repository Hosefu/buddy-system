import { PrismaClient } from '@buddybot/database/generated';
import { BaseRepository } from './base/BaseRepository';
import { FlowSnapshot, FlowStepSnapshot, ComponentSnapshot } from '../entities/Snapshot';
import { Flow } from '../entities/Flow';
import { FlowAssignment } from '../entities/FlowAssignment';

/**
 * Репозиторий для работы с сущностями FlowSnapshot, FlowStepSnapshot и ComponentSnapshot.
 */
export class FlowSnapshotRepository extends BaseRepository {
  constructor(db: PrismaClient) {
    super(db);
  }

  /**
   * Находит снапшот потока по его ID.
   * @param id ID снапшота потока.
   * @returns FlowSnapshot или null, если не найден.
   */
  public async findById(id: string): Promise<FlowSnapshot | null> {
    const snapshot = await this.prisma.flowSnapshot.findUnique({
      where: { id },
      include: {
        steps: {
          include: {
            components: true,
          },
        },
      },
    });

    if (!snapshot) {
      return null;
    }

    return new FlowSnapshot(snapshot);
  }

  /**
   * Создает новый снапшот потока на основе существующего Flow и FlowAssignment.
   * @param flow Сущность Flow, из которой создается снапшот.
   * @param assignment Сущность FlowAssignment, к которой привязывается снапшот.
   * @returns Созданный FlowSnapshot.
   */
  public async create(flow: Flow, assignment: FlowAssignment): Promise<FlowSnapshot> {
    // 1. Создаем FlowSnapshot без привязки к FlowAssignment
    const newSnapshotData = await this.prisma.flowSnapshot.create({
      data: {
        title: flow.title,
        description: flow.description,
        originalFlowId: flow.id,
        originalFlowVersion: flow.version,
        steps: {
          create: flow.steps.map(step => ({
            order: step.order,
            title: step.title,
            description: step.description,
            components: {
              create: step.components.map((comp: any) => ({
                order: comp.order,
                isRequired: comp.isRequired,
                type: comp.type,
                typeVersion: comp.typeVersion || '1.0',
                data: comp.data,
              })),
            },
          })),
        },
      },
      include: {
        steps: {
          include: {
            components: true,
          },
        },
      },
    });

    // 2. Обновляем FlowAssignment, привязывая его к созданному FlowSnapshot
    await this.prisma.flowAssignment.update({
      where: { id: assignment.id },
      data: {
        snapshot: {
          connect: { id: newSnapshotData.id },
        },
      },
    });

    return new FlowSnapshot(newSnapshotData);
  }
}
