// 环境变量加载（极简，无需 dotenv 依赖）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}
loadEnv();

export const config = {
  PORT: Number(process.env.PORT || 9280),
  HOST: process.env.HOST || '0.0.0.0',
  JWT_SECRET: process.env.JWT_SECRET || 'peis_secret_change_me_2026',
  OA_ENABLED: process.env.OA_ENABLED === 'true',
  OA_SECRET: process.env.OA_SECRET || 'oa_demo_secret',
  DINGTALK_ENABLED: process.env.DINGTALK_ENABLED === 'true',
  ZIXIN_ENABLED: process.env.ZIXIN_ENABLED === 'true',
  // ===== MySQL 连接配置（生产服务器部署） =====
  DB_HOST: process.env.DB_HOST || '127.0.0.1',
  DB_PORT: Number(process.env.DB_PORT || 3306),
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'peis',
  DB_POOL_SIZE: Number(process.env.DB_POOL_SIZE || 10),
  // OA / 钉钉 / 致信 对接地址（企业本地部署时替换为真实内网地址；默认模拟）
  OA_BASE_URL: process.env.OA_BASE_URL || '',
  DINGTALK_BASE_URL: process.env.DINGTALK_BASE_URL || 'https://oapi.dingtalk.com',
  DINGTALK_APP_KEY: process.env.DINGTALK_APP_KEY || '',
  DINGTALK_APP_SECRET: process.env.DINGTALK_APP_SECRET || '',
  ZIXIN_BASE_URL: process.env.ZIXIN_BASE_URL || '',
};
