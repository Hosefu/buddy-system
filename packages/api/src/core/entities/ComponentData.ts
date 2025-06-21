/**
 * @namespace Core.Entities.ComponentData
 *
 * @description
 * Этот неймспейс содержит интерфейсы для типизации поля `data`
 * различных типов компонентов (ComponentSnapshot).
 */

/**
 * @interface IComponentData
 * @description
 * Базовый интерфейс для данных любого компонента.
 * Все специфичные типы компонентов должны его расширять.
 */
export interface IComponentData {
  // Общие поля для всех компонентов, если таковые имеются
}

/**
 * @interface IArticleComponentData
 * @extends IComponentData
 * @description
 * Интерфейс для данных компонента типа 'article'.
 */
export interface IArticleComponentData extends IComponentData {
  content: string;
  // Возможно, другие поля, специфичные для статьи, например, 'author', 'publishDate'
}

/**
 * @interface ITaskComponentData
 * @extends IComponentData
 * @description
 * Интерфейс для данных компонента типа 'task'.
 */
export interface ITaskComponentData extends IComponentData {
  description: string;
  expectedOutput?: string;
  // Возможно, другие поля, специфичные для задания, например, 'attachments'
}

/**
 * @interface IQuizComponentData
 * @extends IComponentData
 * @description
 * Интерфейс для данных компонента типа 'quiz'.
 */
export interface IQuizComponentData extends IComponentData {
  questions: Array<{ question: string; options: string[]; correctAnswer: string }>;
  // Возможно, другие поля, специфичные для теста, например, 'passingScore'
}

// Добавьте другие интерфейсы для типов компонентов по мере необходимости (видео, опрос и т.д.)

/**
 * @type ComponentDataType
 * @description
 * Объединение всех возможных типов данных компонентов.
 */
export type ComponentDataType = IArticleComponentData | ITaskComponentData | IQuizComponentData;
