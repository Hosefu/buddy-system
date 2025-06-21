/**
 * Базовый репозиторий для всех репозиториев системы
 * 
 * Предоставляет общую функциональность для работы с базой данных:
 * - Стандартные CRUD операции
 * - Обработка ошибок базы данных
 * - Общие методы для поиска и фильтрации
 * - Типизированные результаты
 * 
 * Все конкретные репозитории наследуются от этого базового класса.
 */

import { PrismaClient, Prisma } from '@buddybot/database'
import { prisma } from '@buddybot/database/client'

/**
 * Интерфейс для пагинации
 */
export interface PaginationParams {
  page?: number
  limit?: number
  cursor?: string
}

/**
 * Результат с пагинацией
 */
export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  nextCursor?: string
  previousCursor?: string
}

/**
 * Параметры для сортировки
 */
export interface SortParams<T = any> {
  field: keyof T
  direction: 'asc' | 'desc'
}

/**
 * Параметры для поиска
 */
export interface SearchParams {
  query?: string
  fields?: string[]
}

/**
 * Опции для операций с базой данных
 */
export interface RepositoryOptions {
  include?: any
  select?: any
  transaction?: Prisma.TransactionClient
}

/**
 * Типы ошибок репозитория
 */
export enum RepositoryErrorType {
  NOT_FOUND = 'NOT_FOUND',
  DUPLICATE = 'DUPLICATE', 
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  DATABASE_ERROR = 'DATABASE_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR'
}

/**
 * Класс ошибки репозитория
 */
export class RepositoryError extends Error {
  constructor(
    public type: RepositoryErrorType,
    message: string,
    public originalError?: Error,
    public metadata?: Record<string, any>
  ) {
    super(message)
    this.name = 'RepositoryError'
  }
}

/**
 * Базовый абстрактный класс для всех репозиториев
 * 
 * Предоставляет общую функциональность и стандартизирует
 * работу с базой данных во всех репозиториях системы.
 */
export abstract class BaseRepository<TEntity, TCreateInput, TUpdateInput> {
  protected db: PrismaClient

  constructor(
    protected modelName: string,
    db?: PrismaClient
  ) {
    this.db = db || prisma
  }

  /**
   * Получает модель Prisma для текущего репозитория
   */
  protected getModel(transaction?: Prisma.TransactionClient) {
    const client = transaction || this.db
    return (client as any)[this.modelName]
  }

  /**
   * Создает новую запись
   */
  async create(data: TCreateInput, options?: RepositoryOptions): Promise<TEntity> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.create({
        data,
        include: options?.include,
        select: options?.select
      })
      return this.mapToEntity(result)
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Создает несколько записей за одну операцию
   */
  async createMany(data: TCreateInput[], options?: RepositoryOptions): Promise<TEntity[]> {
    try {
      const model = this.getModel(options?.transaction)
      
      // Prisma createMany не поддерживает include/select, поэтому создаем по одной
      const results: TEntity[] = []
      for (const item of data) {
        const result = await model.create({
          data: item,
          include: options?.include,
          select: options?.select
        })
        results.push(this.mapToEntity(result))
      }
      
      return results
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Находит запись по ID
   */
  async findById(id: string, options?: RepositoryOptions): Promise<TEntity | null> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.findUnique({
        where: { id },
        include: options?.include,
        select: options?.select
      })
      
      return result ? this.mapToEntity(result) : null
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Находит запись по ID или выбрасывает ошибку
   */
  async findByIdOrThrow(id: string, options?: RepositoryOptions): Promise<TEntity> {
    const entity = await this.findById(id, options)
    if (!entity) {
      throw new RepositoryError(
        RepositoryErrorType.NOT_FOUND,
        `${this.modelName} с ID ${id} не найден`
      )
    }
    return entity
  }

  /**
   * Находит первую запись по условию
   */
  async findFirst(where: any, options?: RepositoryOptions): Promise<TEntity | null> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.findFirst({
        where,
        include: options?.include,
        select: options?.select
      })
      
      return result ? this.mapToEntity(result) : null
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Находит все записи по условию
   */
  async findMany(
    where?: any,
    options?: RepositoryOptions & {
      orderBy?: any
      take?: number
      skip?: number
    }
  ): Promise<TEntity[]> {
    try {
      const model = this.getModel(options?.transaction)
      const results = await model.findMany({
        where,
        include: options?.include,
        select: options?.select,
        orderBy: options?.orderBy,
        take: options?.take,
        skip: options?.skip
      })
      
      return results.map((result: any) => this.mapToEntity(result))
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Находит записи с пагинацией
   */
  async findManyPaginated(
    where: any = {},
    pagination: PaginationParams = {},
    options?: RepositoryOptions & { orderBy?: any }
  ): Promise<PaginatedResult<TEntity>> {
    try {
      const page = pagination.page || 1
      const limit = Math.min(pagination.limit || 20, 100) // Максимум 100 записей за раз
      const skip = (page - 1) * limit

      const model = this.getModel(options?.transaction)
      
      const [results, total] = await Promise.all([
        model.findMany({
          where,
          include: options?.include,
          select: options?.select,
          orderBy: options?.orderBy || { createdAt: 'desc' },
          take: limit + 1, // Берем на одну больше для проверки hasNextPage
          skip
        }),
        model.count({ where })
      ])

      const hasNextPage = results.length > limit
      const data = hasNextPage ? results.slice(0, -1) : results
      const entities = data.map((result: any) => this.mapToEntity(result))

      return {
        data: entities,
        total,
        page,
        limit,
        hasNextPage,
        hasPreviousPage: page > 1,
        // Cursor-based пагинация для GraphQL
        nextCursor: hasNextPage ? data[data.length - 1].id : undefined,
        previousCursor: page > 1 ? data[0]?.id : undefined
      }
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Обновляет запись по ID
   */
  async update(id: string, data: TUpdateInput, options?: RepositoryOptions): Promise<TEntity> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.update({
        where: { id },
        data,
        include: options?.include,
        select: options?.select
      })
      return this.mapToEntity(result)
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Обновляет несколько записей по условию
   */
  async updateMany(where: any, data: TUpdateInput, options?: RepositoryOptions): Promise<number> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.updateMany({
        where,
        data
      })
      return result.count
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Удаляет запись по ID
   */
  async delete(id: string, options?: RepositoryOptions): Promise<void> {
    try {
      const model = this.getModel(options?.transaction)
      await model.delete({
        where: { id }
      })
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Удаляет несколько записей по условию
   */
  async deleteMany(where: any, options?: RepositoryOptions): Promise<number> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.deleteMany({
        where
      })
      return result.count
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Проверяет существование записи
   */
  async exists(where: any, options?: RepositoryOptions): Promise<boolean> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.findFirst({
        where,
        select: { id: true }
      })
      return result !== null
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Подсчитывает количество записей
   */
  async count(where?: any, options?: RepositoryOptions): Promise<number> {
    try {
      const model = this.getModel(options?.transaction)
      return await model.count({ where })
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Upsert операция (создает если не существует, иначе обновляет)
   */
  async upsert(
    where: any,
    create: TCreateInput,
    update: TUpdateInput,
    options?: RepositoryOptions
  ): Promise<TEntity> {
    try {
      const model = this.getModel(options?.transaction)
      const result = await model.upsert({
        where,
        create,
        update,
        include: options?.include,
        select: options?.select
      })
      return this.mapToEntity(result)
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Выполняет операцию в транзакции
   */
  async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    try {
      return await this.db.$transaction(operation)
    } catch (error) {
      throw this.handleDatabaseError(error)
    }
  }

  /**
   * Абстрактный метод для преобразования данных БД в доменную сущность
   * Должен быть реализован в каждом конкретном репозитории
   */
  protected abstract mapToEntity(dbRecord: any): TEntity

  /**
   * Обрабатывает ошибки базы данных и преобразует их в доменные ошибки
   */
  protected handleDatabaseError(error: any): RepositoryError {
    // Prisma ошибки
    if (error.code) {
      switch (error.code) {
        case 'P2002': // Unique constraint violation
          return new RepositoryError(
            RepositoryErrorType.DUPLICATE,
            'Запись с такими данными уже существует',
            error,
            { fields: error.meta?.target }
          )
        
        case 'P2025': // Record not found
          return new RepositoryError(
            RepositoryErrorType.NOT_FOUND,
            'Запись не найдена',
            error
          )
        
        case 'P2003': // Foreign key constraint violation
          return new RepositoryError(
            RepositoryErrorType.CONSTRAINT_VIOLATION,
            'Нарушение ограничения внешнего ключа',
            error,
            { field: error.meta?.field_name }
          )
        
        case 'P2014': // Invalid ID
          return new RepositoryError(
            RepositoryErrorType.VALIDATION_ERROR,
            'Некорректный идентификатор',
            error
          )
        
        default:
          return new RepositoryError(
            RepositoryErrorType.DATABASE_ERROR,
            `Ошибка базы данных: ${error.message}`,
            error,
            { code: error.code }
          )
      }
    }

    // Доменные ошибки (пробрасываем как есть)
    if (error instanceof RepositoryError) {
      return error
    }

    // Прочие ошибки
    return new RepositoryError(
      RepositoryErrorType.DATABASE_ERROR,
      `Неизвестная ошибка базы данных: ${error.message}`,
      error
    )
  }

  /**
   * Вспомогательный метод для построения where условий для поиска
   */
  protected buildSearchWhere(searchParams: SearchParams, searchableFields: string[] = []): any {
    if (!searchParams.query || searchableFields.length === 0) {
      return {}
    }

    const fieldsToSearch = searchParams.fields || searchableFields
    
    return {
      OR: fieldsToSearch.map(field => ({
        [field]: {
          contains: searchParams.query,
          mode: 'insensitive' // Поиск без учета регистра (для PostgreSQL)
        }
      }))
    }
  }

  /**
   * Вспомогательный метод для построения orderBy из параметров сортировки
   */
  protected buildOrderBy(sortParams?: SortParams): any {
    if (!sortParams) {
      return { createdAt: 'desc' }
    }

    return {
      [sortParams.field as string]: sortParams.direction
    }
  }
}