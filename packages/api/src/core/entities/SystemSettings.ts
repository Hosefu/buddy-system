import {
  SystemSettings as PrismaSystemSettings,
  Holiday as PrismaHoliday,
  DayOfWeek,
} from '@buddybot/database';

/**
 * @class SystemSettings
 * @description
 * Глобальные настройки системы, влияющие на расчеты дедлайнов и уведомлений.
 */
export class SystemSettings {
  id: string;
  updatedAt: Date;
  workingDays: DayOfWeek[];
  workingHoursStart: string;
  workingHoursEnd: string;
  timezone: string;
  updatedById: string;

  constructor(data: PrismaSystemSettings) {
    this.id = data.id;
    this.updatedAt = data.updatedAt;
    this.workingDays = data.workingDays;
    this.workingHoursStart = data.workingHoursStart;
    this.workingHoursEnd = data.workingHoursEnd;
    this.timezone = data.timezone;
    this.updatedById = data.updatedById;
  }
}

/**
 * @class Holiday
 * @description
 * Представляет праздничный или нерабочий день.
 */
export class Holiday {
  id: string;
  name: string;
  date: Date;
  isRecurring: boolean;

  constructor(data: PrismaHoliday) {
    this.id = data.id;
    this.name = data.name;
    this.date = data.date;
    this.isRecurring = data.isRecurring;
  }
} 