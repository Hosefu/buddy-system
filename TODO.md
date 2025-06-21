# TODO.md - План разработки BuddyBot Backend

## 🎯 Общий прогресс: 65% завершено

### ✅ Завершено

- [x] Структура monorepo и базовая конфигурация
- [x] Prisma схема с основными сущностями
- [x] Доменные entities (User, Flow, FlowAssignment)
- [x] Базовые репозитории (BaseRepository, UserRepository, FlowRepository)
- [x] Основные сервисы (UserService, FlowService, FlowAssignmentService)
- [x] Use Cases (AssignFlowUseCase, InteractWithComponentUseCase)
- [x] Конфигурация и middleware (auth, error handling)
- [x] Начальная GraphQL схема (типы пользователей, потоков)
- [x] Базовые GraphQL мутации и queries

### 🔥 КРИТИЧЕСКИЕ НЕДОРАБОТКИ (требуют немедленного внимания)

#### 1. СНАПШОТЫ - КЛЮЧЕВАЯ АРХИТЕКТУРНАЯ ОСОБЕННОСТЬ
> **ПРОБЛЕМА**: Система снапшотов практически не реализована, хотя это основа всей архитектуры!

**Что нужно создать СРОЧНО:**

- [ ] **SnapshotService** - создание снапшотов при назначении потока
  - `packages/api/src/core/services/snapshot/SnapshotService.ts`
  - Создание FlowSnapshot, FlowStepSnapshot, ComponentSnapshot
  - Глубокое копирование всего контента со связями
  - Версионирование снапшотов

- [ ] **SnapshotEntities** - доменные модели для снапшотов
  - `packages/api/src/core/entities/FlowSnapshot.ts`
  - `packages/api/src/core/entities/FlowStepSnapshot.ts` 
  - `packages/api/src/core/entities/ComponentSnapshot.ts`

- [ ] **SnapshotRepositories** - доступ к данным снапшотов
  - `packages/api/src/core/repositories/FlowSnapshotRepository.ts`
  - `packages/api/src/core/repositories/ComponentSnapshotRepository.ts`

#### 2. КОМПОНЕНТНАЯ СИСТЕМА
> **ПРОБЛЕМА**: Разные типы компонентов (статьи, квизы, задания) не реализованы

**Что нужно создать:**

- [ ] **ComponentFactory** - фабрика для создания компонентов разных типов
  - `packages/api/src/core/services/component/ComponentFactory.ts`

- [ ] **Component Handlers** - обработчики для каждого типа компонента
  - `packages/api/src/core/services/component/handlers/ArticleHandler.ts`
  - `packages/api/src/core/services/component/handlers/TaskHandler.ts`
  - `packages/api/src/core/services/component/handlers/QuizHandler.ts`
  - `packages/api/src/core/services/component/handlers/BaseComponentHandler.ts`

- [ ] **ComponentProgress System** - система отслеживания прогресса
  - `packages/api/src/core/entities/ComponentProgress.ts`
  - `packages/api/src/core/services/progress/ProgressService.ts`
  - `packages/api/src/core/repositories/ComponentProgressRepository.ts`

#### 3. GRAPHQL СХЕМА - ДОРАБОТКА
> **ПРОБЛЕМА**: Неполная GraphQL схема, отсутствуют ключевые типы и резолверы

**Что нужно доделать:**

- [ ] **Типы снапшотов в GraphQL**
  - `packages/api/src/schema/types/snapshot/snapshot.type.ts`

- [ ] **Компонентные типы** (уже начато, нужно завершить)
  - Доработать `packages/api/src/schema/types/component/component.type.ts`
  - Добавить специфичные типы для Article, Task, Quiz, Video

- [ ] **Progress типы**
  - `packages/api/src/schema/types/progress/progress.type.ts`

- [ ] **Subscriptions для real-time**
  - `packages/api/src/schema/subscriptions/progress.subscriptions.ts`
  - `packages/api/src/schema/subscriptions/notification.subscriptions.ts`

### 📋 Средний приоритет

#### 4. СИСТЕМА УВЕДОМЛЕНИЙ
- [ ] **NotificationService**
  - `packages/api/src/core/services/notification/NotificationService.ts`
  - `packages/api/src/infrastructure/external/telegram/TelegramNotificationService.ts`

#### 5. TELEGRAM INTEGRATION
- [ ] **Telegram Bot Package**
  - `packages/telegram/src/bot/BuddyBot.ts`
  - `packages/telegram/src/bot/handlers/CommandHandlers.ts`
  - `packages/telegram/src/bot/keyboards/InlineKeyboards.ts`

#### 6. СИСТЕМА ДОСТИЖЕНИЙ
- [ ] **AchievementService**
  - `packages/api/src/core/services/achievement/AchievementService.ts`
  - `packages/api/src/core/entities/Achievement.ts`

#### 7. АНАЛИТИКА
- [ ] **AnalyticsService**
  - `packages/api/src/core/services/analytics/AnalyticsService.ts`
  - Трекинг прогресса, время прохождения, статистика

#### 8. ADMIN ФУНКЦИОНАЛ
- [ ] **Admin API**
  - `packages/api/src/schema/mutations/admin.mutations.ts`
  - `packages/api/src/schema/queries/admin.queries.ts`
  - CRUD для потоков, управление пользователями

### 🔧 Низкий приоритет

#### 9. ТЕСТИРОВАНИЕ
- [ ] Unit тесты для всех сервисов
- [ ] Integration тесты для основных сценариев
- [ ] E2E тесты для критических путей

#### 10. ИНФРАСТРУКТУРА
- [ ] Docker конфигурация
- [ ] CI/CD пайплайны
- [ ] Мониторинг и логирование

#### 11. ПРОИЗВОДИТЕЛЬНОСТЬ
- [ ] Redis кеширование
- [ ] DataLoader для GraphQL
- [ ] Пагинация и оптимизация запросов

---

## 🚀 План следующих действий (по приоритету)

### Этап 1: СНАПШОТЫ (критично!) 
1. Создать доменные entities для снапшотов
2. Реализовать SnapshotService с полным копированием
3. Обновить AssignFlowUseCase для создания снапшотов
4. Добавить GraphQL типы для снапшотов

### Этап 2: КОМПОНЕНТНАЯ СИСТЕМА
1. Реализовать ComponentFactory и handlers
2. Создать систему ComponentProgress
3. Завершить GraphQL типы компонентов
4. Реализовать взаимодействие с компонентами

### Этап 3: ИНТЕГРАЦИЯ И ТЕСТИРОВАНИЕ
1. Собрать все части вместе
2. Протестировать основные сценарии
3. Добавить недостающие GraphQL операции

---

## 📊 Детальная разбивка по файлам

### СРОЧНО НУЖНО СОЗДАТЬ:

**Снапшоты:**
- `packages/api/src/core/entities/FlowSnapshot.ts`
- `packages/api/src/core/entities/FlowStepSnapshot.ts`
- `packages/api/src/core/entities/ComponentSnapshot.ts`
- `packages/api/src/core/services/snapshot/SnapshotService.ts`
- `packages/api/src/core/repositories/FlowSnapshotRepository.ts`

**Компоненты:**
- `packages/api/src/core/entities/ComponentProgress.ts`
- `packages/api/src/core/services/component/ComponentFactory.ts`
- `packages/api/src/core/services/component/handlers/` (все handlers)
- `packages/api/src/core/services/progress/ProgressService.ts`

**GraphQL:**
- `packages/api/src/schema/types/snapshot/snapshot.type.ts`
- `packages/api/src/schema/types/progress/progress.type.ts`
- Доработать `packages/api/src/schema/types/component/component.type.ts`

### ДОРАБОТАТЬ СУЩЕСТВУЮЩИЕ:

- `packages/api/src/core/usecases/flow/AssignFlowUseCase.ts` - добавить создание снапшотов
- `packages/api/src/schema/mutations/component.mutations.ts` - завершить реализацию
- `packages/api/src/server.ts` - добавить subscriptions
- `packages/database/prisma/schema.prisma` - проверить модели снапшотов

---

**Следующие действия:** Начинаем с реализации системы снапшотов как самой критичной части архитектуры!