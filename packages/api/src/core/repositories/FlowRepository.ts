import { prisma, PrismaClient } from '@buddybot/database';
import { BaseRepository } from './base/BaseRepository';
import { Flow } from '../entities/Flow';

/**
 * Репозиторий для работы с сущностью Flow (шаблоны потоков).
 */
export class FlowRepository extends BaseRepository {
  constructor(db: PrismaClient = prisma) {
    super(db);
  }

  /**
   * Находит поток по его ID.
   */
  public async findById(id: string): Promise<Flow | null> {
    const flow = await this.prisma.flow.findUnique({
      where: { id },
      include: {
        steps: {
          include: {
            components: true,
          },
        },
      },
    });
    return flow ? new Flow(flow) : null;
  }

  /**
   * Возвращает список всех потоков.
   */
  public async listAll(): Promise<Flow[]> {
    const flows = await this.prisma.flow.findMany({
      include: {
        steps: {
          include: {
            components: true,
          },
        },
      },
    });
    return flows.map(flow => new Flow(flow));
  }
} 