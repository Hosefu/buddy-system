import { AssignmentStatus, User as PrismaUser } from '@buddybot/database';
import { addDays, addBusinessDays, isAfter } from 'date-fns';
import { FlowSnapshot } from './Snapshot';

// Интерфейс для данных конструктора, чтобы избежать проблем с типами
interface FlowAssignmentConstructorData {
  id: string;
  userId: string;
  status: AssignmentStatus;
  deadline: Date;
  isOverdue: boolean;
  assignedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  buddies: PrismaUser[];
  pausedAt: Date | null;
  pausedById: string | null;
  pauseReason: string | null;
  timeSpent: number;
  lastActivity: Date | null;
  snapshot?: FlowSnapshot; // Ссылка на доменную сущность
}

export class FlowAssignment {
  public readonly id: string;
  public readonly userId: string;
  public status: AssignmentStatus;
  public deadline: Date;
  public isOverdue: boolean;
  public readonly assignedAt: Date;
  public startedAt: Date | null;
  public completedAt: Date | null;
  public buddies: PrismaUser[];
  public pausedAt: Date | null;
  public pausedById: string | null;
  public pauseReason: string | null;
  public timeSpent: number;
  public lastActivity: Date | null;
  public snapshot?: FlowSnapshot;

  constructor(data: FlowAssignmentConstructorData) {
    this.id = data.id;
    this.userId = data.userId;
    this.status = data.status;
    this.deadline = data.deadline;
    this.isOverdue = data.isOverdue;
    this.assignedAt = data.assignedAt;
    this.startedAt = data.startedAt;
    this.completedAt = data.completedAt;
    this.buddies = data.buddies;
    this.pausedAt = data.pausedAt;
    this.pausedById = data.pausedById;
    this.pauseReason = data.pauseReason;
    this.timeSpent = data.timeSpent;
    this.lastActivity = data.lastActivity;
    this.snapshot = data.snapshot;

    this.validateAssignment();
  }

  public pause(userId: string, reason: string): void {
    if (this.status !== 'IN_PROGRESS') {
      throw new Error('Можно поставить на паузу только поток в статусе "IN_PROGRESS"');
    }
    this.status = 'PAUSED';
    this.pausedAt = new Date();
    this.pausedById = userId;
    this.pauseReason = reason;
  }

  public resume(): void {
    if (this.status !== 'PAUSED') {
      throw new Error('Можно возобновить только поток на паузе');
    }
    this.status = 'IN_PROGRESS';
    this.pausedAt = null;
    this.pausedById = null;
    this.pauseReason = null;
  }

  public complete(): void {
    if (this.status === 'COMPLETED') {
      return;
    }
    this.status = 'COMPLETED';
    this.completedAt = new Date();
  }

  public addBuddy(buddy: PrismaUser): void {
    if (this.isBuddy(buddy.id)) {
      throw new Error('Этот наставник уже добавлен');
    }
    if (buddy.id === this.userId) {
      throw new Error('Пользователь не может быть наставником самому себе');
    }
    this.buddies.push(buddy);
  }

  public removeBuddy(buddyId: string): void {
    if (this.buddies.length <= 1) {
      throw new Error('Нельзя удалить последнего наставника');
    }
    const buddyIndex = this.buddies.findIndex(b => b.id === buddyId);
    if (buddyIndex === -1) {
      throw new Error('Наставник не найден');
    }
    this.buddies.splice(buddyIndex, 1);
  }

  public getPrimaryBuddyId(): string | null {
    return this.buddies.length > 0 ? this.buddies[0].id : null;
  }

  public isBuddy(userId: string): boolean {
    return this.buddies.some(b => b.id === userId);
  }

  public updateStatus(): void {
    if (this.status !== 'COMPLETED' && isAfter(new Date(), this.deadline)) {
      this.isOverdue = true;
    }
  }

  private validateAssignment(): void {
    if (!this.userId) {
      throw new Error('ID пользователя обязателен');
    }
    if (!this.snapshot) {
      throw new Error('Снапшот потока обязателен');
    }
    if (!this.buddies || this.buddies.length === 0) {
      throw new Error('Необходимо указать хотя бы одного наставника');
    }
    if (this.buddies.some(b => b.id === this.userId)) {
      throw new Error('Пользователь не может быть наставником самому себе');
    }
  }

  public static calculateDeadline(startDate: Date, days: number, useBusinessDays: boolean = true): Date {
    const fn = useBusinessDays ? addBusinessDays : addDays;
    return fn(startDate, days);
  }
  
  public toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      flowSnapshotId: this.snapshot?.id,
      status: this.status,
      deadline: this.deadline,
      isOverdue: this.isOverdue,
      assignedAt: this.assignedAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      buddyIds: this.buddies.map(buddy => buddy.id),
      pausedAt: this.pausedAt,
      pausedById: this.pausedById,
      pauseReason: this.pauseReason,
      timeSpent: this.timeSpent,
      lastActivity: this.lastActivity,
    };
  }
} 