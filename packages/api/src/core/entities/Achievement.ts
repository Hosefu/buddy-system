import {
  Achievement as PrismaAchievement,
  UserAchievement as PrismaUserAchievement,
  AchievementRarity,
} from '@buddybot/database';

/**
 * @class Achievement
 * @description
 * Представляет шаблон достижения (ачивки).
 */
export class Achievement {
  id: string;
  createdAt: Date;
  key: string;
  title: string;
  description: string;
  icon: string;
  rarity: AchievementRarity;
  criteria: unknown; // Json

  constructor(data: PrismaAchievement) {
    this.id = data.id;
    this.createdAt = data.createdAt;
    this.key = data.key;
    this.title = data.title;
    this.description = data.description;
    this.icon = data.icon;
    this.rarity = data.rarity;
    this.criteria = data.criteria;
  }
}

/**
 * @class UserAchievement
 * @description
 * Связывает пользователя с полученным достижением.
 */
export class UserAchievement {
  id: string;
  earnedAt: Date;
  context: unknown; // Json
  userId: string;
  achievementId: string;

  constructor(data: PrismaUserAchievement) {
    this.id = data.id;
    this.earnedAt = data.earnedAt;
    this.context = data.context;
    this.userId = data.userId;
    this.achievementId = data.achievementId;
  }
} 