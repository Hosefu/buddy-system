import dotenv from 'dotenv';

dotenv.config();

export const config = {
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-key',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
}; 