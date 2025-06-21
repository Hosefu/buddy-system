import { Notification as PrismaNotification, NotificationPriority, NotificationStatus } from '@buddybot/database';

/**
 * @class Notification
 * @description
 * Представляет уведомление, отправляемое пользователю или системе.
 */
export class Notification {
  id: string;
  createdAt: Date;
  type: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  status: NotificationStatus;
  readAt: Date | null;
  scheduledFor: Date | null;
  expiresAt: Date | null;
  context: unknown; // Json
  actions: unknown; // Json
  recipientId: string;
  senderId: string | null;

  constructor(data: PrismaNotification) {
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.type = data.type;
    this.title = data.title;
    this.message = data.message;
    this.priority = data.priority;
    this.status = data.status;
    this.readAt = data.readAt;
    this.scheduledFor = data.scheduledFor;
    this.expiresAt = data.expiresAt;
    this.context = data.context;
    this.actions = data.actions;
    this.recipientId = data.recipientId;
    this.senderId = data.senderId;
  }
} 