import * as crypto from 'crypto';

/**
 * Данные для аутентификации из Telegram Widget
 */
export interface TelegramAuthData {
  id: number;
  first_name: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Класс для валидации данных, полученных от Telegram
 */
export class TelegramValidator {
  private readonly botToken: string;

  constructor(botToken: string) {
    if (!botToken) {
      throw new Error('Telegram bot token is required for validation.');
    }
    this.botToken = botToken;
  }

  /**
   * Проверяет подлинность данных от Telegram.
   * @param authData - Данные для проверки.
   * @returns true, если данные подлинные, иначе false.
   */
  public validateAuthData(authData: Partial<TelegramAuthData>): boolean {
    if (!authData.hash) {
      return false;
    }

    const secretKey = crypto.createHash('sha256').update(this.botToken).digest();

    const dataCheckString = Object.keys(authData)
      .filter((key) => key !== 'hash')
      .sort()
      .map((key) => `${key}=${authData[key as keyof typeof authData]}`)
      .join('\n');

    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    return hmac === authData.hash;
  }
} 