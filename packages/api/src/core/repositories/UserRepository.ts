import { prisma, PrismaClient, Role } from '@buddybot/database';
import { BaseRepository } from './base/BaseRepository';
import { CreateUserInput, UpdateUserInput, User } from '../entities/User';

/**
 * Репозиторий для работы с сущностью User.
 * Предоставляет методы для доступа к данным пользователей в базе данных.
 */
export class UserRepository extends BaseRepository {
  constructor(db: PrismaClient = prisma) {
    super(db);
  }

  /**
   * Находит пользователя по его ID.
   * @param id - ID пользователя.
   * @returns - Сущность пользователя или null, если не найден.
   */
  public async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    return user ? new User(user) : null;
  }

  /**
   * Находит пользователя по его Telegram ID.
   * @param telegramId - Telegram ID пользователя.
   * @returns - Сущность пользователя или null, если не найден.
   */
  public async findByTelegramId(telegramId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { telegramId } });
    return user ? new User(user) : null;
  }

  /**
   * Создает нового пользователя.
   * @param data - Данные для создания пользователя.
   * @returns - Созданная сущность пользователя.
   */
  public async create(data: CreateUserInput): Promise<User> {
    const newUser = await this.prisma.user.create({
      data: {
        ...data,
        roles: data.roles || [Role.USER], // Роль по умолчанию
      },
    });
    return new User(newUser);
  }

  /**
   * Обновляет данные пользователя.
   * @param id - ID пользователя для обновления.
   * @param data - Данные для обновления.
   * @returns - Обновленная сущность пользователя.
   */
  public async update(id: string, data: UpdateUserInput): Promise<User> {
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
    });
    return new User(updatedUser);
  }

  /**
   * Возвращает список всех пользователей.
   * @returns Массив сущностей пользователей.
   */
  public async listAll(): Promise<User[]> {
    const users = await this.prisma.user.findMany();
    return users.map(user => new User(user));
  }
}
