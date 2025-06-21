import {
  UserProgress as PrismaUserProgress,
  FlowProgress as PrismaFlowProgress,
  StepProgress as PrismaStepProgress,
  ComponentProgress as PrismaComponentProgress,
  FlowStatus,
  StepStatus,
  ComponentStatus,
} from '@buddybot/database';

/**
 * @class UserProgress
 * @description
 * Агрегированный прогресс по всем потокам для одного пользователя.
 */
export class UserProgress {
  id: string;
  userId: string;
  totalTimeSpent: number;
  streakDays: number;

  constructor(data: PrismaUserProgress) {
    this.id = data.id;
    this.userId = data.userId;
    this.totalTimeSpent = data.totalTimeSpent;
    this.streakDays = data.streakDays;
  }
}

/**
 * @class FlowProgress
 * @description
 * Прогресс пользователя по конкретному назначенному потоку.
 */
export class FlowProgress {
  id: string;
  assignmentId: string;
  status: FlowStatus;
  percentage: number;
  lastActivity: Date | null;
  stepsProgress: StepProgress[];

  constructor(data: PrismaFlowProgress & { stepsProgress: (PrismaStepProgress & { componentProgress: PrismaComponentProgress[] })[] }) {
    this.id = data.id;
    this.assignmentId = data.assignmentId;
    this.status = data.status;
    this.percentage = data.percentage;
    this.lastActivity = data.lastActivity;
    this.stepsProgress = data.stepsProgress.map(p => new StepProgress(p));
  }
}

/**
 * @class StepProgress
 * @description
 * Прогресс пользователя по конкретному шагу снапшота.
 */
export class StepProgress {
  id: string;
  stepSnapshotId: string;
  status: StepStatus;
  percentage: number;
  startedAt: Date | null;
  completedAt: Date | null;
  timeSpent: number;
  flowProgressId: string;
  componentProgress: ComponentProgress[];

  constructor(data: PrismaStepProgress & { componentProgress: PrismaComponentProgress[] }) {
    this.id = data.id;
    this.stepSnapshotId = data.stepSnapshotId;
    this.status = data.status;
    this.percentage = data.percentage;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.timeSpent = data.timeSpent;
    this.flowProgressId = data.flowProgressId;
    this.componentProgress = data.componentProgress.map(p => new ComponentProgress(p));
  }
}

/**
 * @class ComponentProgress
 * @description
 * Прогресс пользователя по конкретному компоненту снапшота.
 */
export class ComponentProgress {
  id: string;
  componentSnapshotId: string;
  status: ComponentStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  timeSpent: number;
  progressData: unknown; // Json
  stepProgressId: string;

  constructor(data: PrismaComponentProgress) {
    this.id = data.id;
    this.componentSnapshotId = data.componentSnapshotId;
    this.status = data.status;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.timeSpent = data.timeSpent;
    this.progressData = data.progressData;
    this.stepProgressId = data.stepProgressId;
  }
} 