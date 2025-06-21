import { User as PrismaUser, Role } from '@buddybot/database';

/**
 * @class User
 * @description
 * Представляет пользователя системы в бизнес-логике.
 */
export class User {
  public readonly id: string;
  public readonly createdAt: Date;
  public updatedAt: Date;
  public readonly telegramId: string;
  public telegramUsername: string | null;
  public name: string;
  public avatarUrl: string | null;
  public isActive: boolean;
  public lastLoginAt: Date | null;
  public roles: Role[];

  constructor(data: PrismaUser) {
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
    this.telegramId = data.telegramId;
    this.telegramUsername = data.telegramUsername;
    this.name = data.name;
    this.avatarUrl = data.avatarUrl;
    this.isActive = data.isActive;
    this.lastLoginAt = data.lastLoginAt;
    this.roles = data.roles;
  }

  /**
   * Возвращает полное имя пользователя. В данном случае это просто поле name.
   */
  get fullName(): string {
    return this.name;
  }

  /**
   * Проверяет, является ли пользователь администратором.
   */
  public isAdmin(): boolean {
    return this.roles.includes(Role.ADMIN);
  }

  /**
   * Проверяет, является ли пользователь наставником (или администратором, который тоже может быть наставником).
   */
  public isBuddy(): boolean {
    return this.roles.includes(Role.BUDDY) || this.isAdmin();
  }

  /**
   * Деактивирует пользователя.
   */
  public deactivate(): void {
    this.isActive = false;
  }

  /**
   * Активирует пользователя.
   */
  public activate(): void {
    this.isActive = true;
  }
}

/**
 * Типы для операций с пользователями в репозитории.
 */
export type CreateUserInput = Omit<PrismaUser, 'id' | 'createdAt' | 'updatedAt' | 'isActive' | 'roles'> & { roles?: Role[] };
export type UpdateUserInput = Partial<Omit<CreateUserInput, 'telegramId'>>;