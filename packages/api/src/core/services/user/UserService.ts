/**
 * Сервис для работы с пользователями
 * 
 * Содержит бизнес-логику для:
 * - Регистрации и аутентификации пользователей
 * - Управления ролями и правами доступа
 * - Обновления профилей пользователей
 * - Поиска и фильтрации пользователей
 * - Валидации бизнес-правил
 * 
 * Этот сервис является посредником между GraphQL резолверами
 * и репозиториями, обеспечивая соблюдение бизнес-правил.
 */

import { Role } from '@buddybot/database'
import { UserRepository, UserFilter, UserStats } from '../../repositories/UserRepository'
import { User, CreateUserInput, UpdateUserInput } from '../../entities/User'
import { PaginationParams, RepositoryError, RepositoryErrorType } from '../../repositories/base/BaseRepository'

/**
 * Интерфейс для регистрации пользователя через Telegram
 */
export interface RegisterUserInput {
  telegramId: string
  name: string
  telegramUsername?: string
  avatarUrl?: string
  initialRoles?: Role[]
}

/**
 * Интерфейс для обновления ролей пользователя
 */
export interface UpdateUserRolesInput {
  userId: string
  roles: Role[]
  updatedBy: string // ID пользователя, который вносит изменения
}

/**
 * Результат поиска пользователей
 */
export interface UserSearchResult {
  users: User[]
  pagination: {
    total: number
    page: number
    limit: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}

/**
 * Параметры для поиска потенциальных наставников
 */
export interface FindBuddiesParams {
  excludeUserId?: string
  search?: string
  departmentId?: string
  minExperience?: number
  maxAssignments?: number
}

/**
 * Сервис для работы с пользователями
 * 
 * Реализует всю бизнес-логику связанную с пользователями.
 * Обеспечивает валидацию, проверку прав доступа и координацию
 * между различными компонентами системы.
 */
export class UserService {
  constructor(
    private userRepository: UserRepository
  ) {}

  /**
   * Регистрирует нового пользователя в системе
   * 
   * @param input - данные для регистрации
   * @returns созданный пользователь
   */
  async registerUser(input: RegisterUserInput): Promise<User> {
    // Проверяем, что пользователь с таким Telegram ID не существует
    const existingUser = await this.userRepository.findByTelegramId(input.telegramId)
    if (existingUser) {
      throw new RepositoryError(
        RepositoryErrorType.DUPLICATE,
        'Пользователь с таким Telegram ID уже зарегистрирован'
      )
    }

    // Проверяем уникальность Telegram username если он указан
    if (input.telegramUsername) {
      const existingUsername = await this.userRepository.findByTelegramUsername(input.telegramUsername)
      if (existingUsername) {
        throw new RepositoryError(
          RepositoryErrorType.DUPLICATE,
          'Пользователь с таким Telegram username уже существует'
        )
      }
    }

    // Создаем данные для создания пользователя
    const createUserData: CreateUserInput = {
      telegramId: input.telegramId,
      name: input.name,
      telegramUsername: input.telegramUsername,
      avatarUrl: input.avatarUrl,
      roles: input.initialRoles || [Role.USER]
    }

    // Валидируем роли (только ADMIN может назначать роли ADMIN)
    if (createUserData.roles.includes(Role.ADMIN)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Нельзя создать пользователя с ролью администратора при регистрации'
      )
    }

    // Создаем пользователя
    const user = await this.userRepository.create(createUserData)

    // Логируем регистрацию
    console.log(`✅ Зарегистрирован новый пользователь: ${user.name} (${user.telegramId})`)

    return user
  }

  /**
   * Находит пользователя по Telegram ID или создает нового
   * 
   * @param telegramId - Telegram ID пользователя
   * @param userData - данные пользователя для создания (если не найден)
   * @returns найденный или созданный пользователь
   */
  async findOrCreateUser(telegramId: string, userData?: RegisterUserInput): Promise<User> {
    // Сначала пытаемся найти существующего пользователя
    const existingUser = await this.userRepository.findByTelegramId(telegramId)
    if (existingUser) {
      // Обновляем время последнего входа
      await this.userRepository.updateLastLogin(existingUser.id)
      return existingUser
    }

    // Если пользователь не найден и переданы данные для создания
    if (userData) {
      return this.registerUser(userData)
    }

    throw new RepositoryError(
      RepositoryErrorType.NOT_FOUND,
      'Пользователь не найден и данные для создания не переданы'
    )
  }

  /**
   * Получает пользователя по ID
   * 
   * @param userId - ID пользователя
   * @returns пользователь или null
   */
  async getUserById(userId: string): Promise<User | null> {
    return this.userRepository.findById(userId)
  }

  /**
   * Получает пользователя по ID или выбрасывает ошибку
   * 
   * @param userId - ID пользователя
   * @returns пользователь
   */
  async getUserByIdOrThrow(userId: string): Promise<User> {
    return this.userRepository.findByIdOrThrow(userId)
  }

  /**
   * Получает пользователя по Telegram ID
   * 
   * @param telegramId - Telegram ID пользователя
   * @returns пользователь или null
   */
  async getUserByTelegramId(telegramId: string): Promise<User | null> {
    return this.userRepository.findByTelegramId(telegramId)
  }

  /**
   * Обновляет профиль пользователя
   * 
   * @param userId - ID пользователя
   * @param updateData - данные для обновления
   * @param updatedBy - ID пользователя, который вносит изменения
   * @returns обновленный пользователь
   */
  async updateUserProfile(
    userId: string,
    updateData: UpdateUserInput,
    updatedBy: string
  ): Promise<User> {
    // Проверяем права на обновление профиля
    await this.validateUpdatePermissions(userId, updatedBy)

    // Проверяем уникальность Telegram username если он изменяется
    if (updateData.telegramUsername) {
      const existingUser = await this.userRepository.findByTelegramUsername(updateData.telegramUsername)
      if (existingUser && existingUser.id !== userId) {
        throw new RepositoryError(
          RepositoryErrorType.DUPLICATE,
          'Пользователь с таким Telegram username уже существует'
        )
      }
    }

    const updatedUser = await this.userRepository.update(userId, updateData)

    console.log(`📝 Обновлен профиль пользователя: ${updatedUser.name} (изменено пользователем ${updatedBy})`)

    return updatedUser
  }

  /**
   * Обновляет роли пользователя
   * 
   * @param input - данные для обновления ролей
   * @returns пользователь с обновленными ролями
   */
  async updateUserRoles(input: UpdateUserRolesInput): Promise<User> {
    // Проверяем права на изменение ролей
    const updater = await this.getUserByIdOrThrow(input.updatedBy)
    if (!updater.hasRole(Role.ADMIN)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Только администраторы могут изменять роли пользователей'
      )
    }

    // Получаем текущего пользователя
    const targetUser = await this.getUserByIdOrThrow(input.userId)

    // Проверяем, что пользователь не убирает себе роль ADMIN, если он последний админ
    if (input.updatedBy === input.userId && 
        targetUser.hasRole(Role.ADMIN) && 
        !input.roles.includes(Role.ADMIN)) {
      
      const adminCount = await this.getAdminCount()
      if (adminCount <= 1) {
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          'Нельзя удалить роль администратора у последнего администратора в системе'
        )
      }
    }

    const updatedUser = await this.userRepository.updateRoles(input.userId, input.roles)

    console.log(`🔐 Изменены роли пользователя: ${updatedUser.name} -> ${input.roles.join(', ')} (изменено ${updater.name})`)

    return updatedUser
  }

  /**
   * Деактивирует пользователя
   * 
   * @param userId - ID пользователя
   * @param deactivatedBy - ID пользователя, который деактивирует
   * @returns деактивированный пользователь
   */
  async deactivateUser(userId: string, deactivatedBy: string): Promise<User> {
    // Проверяем права на деактивацию
    const deactivator = await this.getUserByIdOrThrow(deactivatedBy)
    if (!deactivator.hasRole(Role.ADMIN)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Только администраторы могут деактивировать пользователей'
      )
    }

    // Нельзя деактивировать самого себя
    if (userId === deactivatedBy) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Нельзя деактивировать самого себя'
      )
    }

    // Получаем пользователя для деактивации
    const targetUser = await this.getUserByIdOrThrow(userId)

    // Проверяем, что это не последний админ
    if (targetUser.hasRole(Role.ADMIN)) {
      const adminCount = await this.getAdminCount()
      if (adminCount <= 1) {
        throw new RepositoryError(
          RepositoryErrorType.VALIDATION_ERROR,
          'Нельзя деактивировать последнего администратора в системе'
        )
      }
    }

    const deactivatedUser = await this.userRepository.deactivate(userId)

    console.log(`❌ Деактивирован пользователь: ${deactivatedUser.name} (деактивировано ${deactivator.name})`)

    return deactivatedUser
  }

  /**
   * Активирует пользователя
   * 
   * @param userId - ID пользователя
   * @param activatedBy - ID пользователя, который активирует
   * @returns активированный пользователь
   */
  async activateUser(userId: string, activatedBy: string): Promise<User> {
    // Проверяем права на активацию
    const activator = await this.getUserByIdOrThrow(activatedBy)
    if (!activator.hasRole(Role.ADMIN)) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Только администраторы могут активировать пользователей'
      )
    }

    const activatedUser = await this.userRepository.activate(userId)

    console.log(`✅ Активирован пользователь: ${activatedUser.name} (активировано ${activator.name})`)

    return activatedUser
  }

  /**
   * Ищет пользователей по различным критериям
   * 
   * @param searchQuery - поисковый запрос
   * @param filter - фильтры для поиска
   * @param pagination - параметры пагинации
   * @returns результаты поиска
   */
  async searchUsers(
    searchQuery?: string,
    filter?: UserFilter,
    pagination?: PaginationParams
  ): Promise<UserSearchResult> {
    const searchFilter: UserFilter = {
      ...filter,
      ...(searchQuery && {
        search: {
          query: searchQuery,
          fields: ['name', 'telegramUsername']
        }
      })
    }

    const result = await this.userRepository.search(
      searchQuery || '',
      searchFilter,
      pagination
    )

    return {
      users: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Находит потенциальных наставников
   * 
   * @param params - параметры поиска наставников
   * @param pagination - параметры пагинации
   * @returns список потенциальных наставников
   */
  async findPotentialBuddies(
    params: FindBuddiesParams = {},
    pagination?: PaginationParams
  ): Promise<UserSearchResult> {
    const result = await this.userRepository.findPotentialBuddies(
      params.excludeUserId,
      params.search,
      pagination
    )

    return {
      users: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает подопечных конкретного наставника
   * 
   * @param buddyId - ID наставника
   * @param filter - дополнительные фильтры
   * @param pagination - параметры пагинации
   * @returns список подопечных
   */
  async getBuddyAssignees(
    buddyId: string,
    filter?: UserFilter,
    pagination?: PaginationParams
  ): Promise<UserSearchResult> {
    // Проверяем, что пользователь может быть наставником
    const buddy = await this.getUserByIdOrThrow(buddyId)
    if (!buddy.canBeBuddy()) {
      throw new RepositoryError(
        RepositoryErrorType.VALIDATION_ERROR,
        'Пользователь не может быть наставником'
      )
    }

    const result = await this.userRepository.findBuddyAssignees(
      buddyId,
      filter,
      pagination
    )

    return {
      users: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает пользователей по ролям
   * 
   * @param roles - роли для поиска
   * @param filter - дополнительные фильтры
   * @param pagination - параметры пагинации
   * @returns пользователи с указанными ролями
   */
  async getUsersByRoles(
    roles: Role[],
    filter?: Omit<UserFilter, 'hasRole'>,
    pagination?: PaginationParams
  ): Promise<UserSearchResult> {
    const result = await this.userRepository.findByRoles(roles, filter, pagination)

    return {
      users: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Получает статистику пользователей
   * 
   * @returns статистика пользователей
   */
  async getUserStats(): Promise<UserStats> {
    return this.userRepository.getStats()
  }

  /**
   * Находит неактивных пользователей
   * 
   * @param daysSinceLastLogin - количество дней с последнего входа
   * @param pagination - параметры пагинации
   * @returns неактивные пользователи
   */
  async findInactiveUsers(
    daysSinceLastLogin: number = 30,
    pagination?: PaginationParams
  ): Promise<UserSearchResult> {
    const result = await this.userRepository.findInactiveUsers(daysSinceLastLogin, pagination)

    return {
      users: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage
      }
    }
  }

  /**
   * Проверяет, может ли один пользователь редактировать другого
   * 
   * @param targetUserId - ID пользователя для редактирования
   * @param editorId - ID пользователя, который хочет редактировать
   */
  private async validateUpdatePermissions(targetUserId: string, editorId: string): Promise<void> {
    // Пользователь может редактировать свой собственный профиль
    if (targetUserId === editorId) {
      return
    }

    // Администраторы могут редактировать любые профили
    const editor = await this.getUserByIdOrThrow(editorId)
    if (editor.hasRole(Role.ADMIN)) {
      return
    }

    throw new RepositoryError(
      RepositoryErrorType.VALIDATION_ERROR,
      'Недостаточно прав для редактирования профиля этого пользователя'
    )
  }

  /**
   * Получает количество администраторов в системе
   * 
   * @returns количество администраторов
   */
  private async getAdminCount(): Promise<number> {
    const result = await this.userRepository.findByRoles([Role.ADMIN], { isActive: true })
    return result.total
  }
}