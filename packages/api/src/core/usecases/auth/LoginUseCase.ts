import { JwtService, AuthTokens } from '../../middleware/auth.middleware';
import { TelegramValidator } from '../../utils/crypto/telegram.validator';
import { prisma, User, Role } from '@buddybot/database/client';

export interface TelegramAuthInput {
  telegramId: string;
  name: string;
  telegramUsername?: string;
  avatarUrl?: string;
  hash: string;
  auth_date: number;
}

export interface LoginResult {
  user: User;
  tokens: AuthTokens;
  isNewUser: boolean;
  permissions: string[];
}

/**
 * Use case для обработки логики входа пользователя.
 */
export class LoginUseCase {
  constructor(
    private readonly jwtService: JwtService,
    private readonly telegramValidator: TelegramValidator
  ) {}

  /**
   * Выполняет аутентификацию пользователя через Telegram.
   * @param input - Данные от Telegram.
   * @returns - Результат входа: пользователь, токены, флаг нового пользователя.
   */
  public async execute(input: TelegramAuthInput): Promise<LoginResult> {
    const { telegramId, name, telegramUsername, avatarUrl, hash, auth_date } = input;

    const isValid = this.telegramValidator.validateAuthData({
      id: parseInt(telegramId, 10),
      first_name: name,
      username: telegramUsername,
      photo_url: avatarUrl,
      auth_date,
      hash,
    });

    if (!isValid) {
      throw new Error('Invalid Telegram data. Hash validation failed.');
    }

    let user = await prisma.user.findUnique({ where: { telegramId }});
    let isNewUser = false;

    if (!user) {
      user = await prisma.user.create({
        data: { telegramId, name, telegramUsername, avatarUrl, role: 'USER' },
      });
      isNewUser = true;
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { name, telegramUsername, avatarUrl },
      });
    }

    const tokens = this.jwtService.generateTokens({ userId: user.id, role: user.role });
    const permissions = this.getPermissionsForRole(user.role);

    return { user, tokens, isNewUser, permissions };
  }

  /**
   * Обновляет токены, используя refresh token.
   * @param refreshToken - Refresh token.
   * @returns - Новая пара токенов.
   */
  public async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const decoded = this.jwtService.verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId }});

    if (!user) {
      throw new Error('User not found for the given refresh token.');
    }

    return this.jwtService.generateTokens({ userId: user.id, role: user.role });
  }

  private getPermissionsForRole(role: Role): string[] {
    const permissions = [role];
    if (role === 'ADMIN') permissions.push('BUDDY', 'USER');
    else if (role === 'BUDDY') permissions.push('USER');
    return [...new Set(permissions)];
  }
} 