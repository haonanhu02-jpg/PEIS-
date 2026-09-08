// PEIS 项目管理系统 - 主入口（企业本地部署，监听 0.0.0.0:9280）
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { init } from './db.js';
import { seedIfEmpty, migrateScreenshotContent } from './seed.js';
import { refreshAllLights, pushCycleSummary, runDueReminders } from './engine.js';
import { all } from './db.js';
import apiRouter from './api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.get('/api/health', async (req, res) => {
  try {
    await all('teams');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// API
app.use('/api', apiRouter);

// 静态前端（Teambition 风格 UI，hash 路由）
const webDir = path.join(__dirname, '..', 'web');
app.use(express.static(webDir));
// hash 路由兜底：任意非 /api 路径返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(webDir, 'index.html'));
});

// 全局错误处理（捕获异步路由抛出的异常）
app.use((err, req, res, next) => {
  console.error('[err]', err.message);
  res.status(500).json({ ok: false, msg: '服务器内部错误' });
});

// 异步路由异常的兜底（Express 4 需手动捕获 async handler 的 reject）
// 已通过各 handler 内 await 处理，此处为保险。

// ===== 周期调度（日/周/月，模拟真实 cron） =====
function schedule() {
  let lastDaily = '';
  let lastWeekly = '';
  let lastBiweekly = '';
  setInterval(async () => {
    const now = new Date();
    const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    if (now.getHours() >= 9 && key !== lastDaily) {
      lastDaily = key;
      await refreshAllLights();
      // 遍历所有团队分别推送（团队隔离）
      for (const team of await all('teams')) {
        await pushCycleSummary('daily', team.id);
        await runDueReminders(now, team.id);
        if (now.getDay() === 1 && key !== lastWeekly) await pushCycleSummary('weekly', team.id);
        const epochWeek = Math.floor((now.getTime() / 86400000 + 4) / 7);
        if (now.getDay() === 1 && epochWeek % 2 === 0 && key !== lastBiweekly) await pushCycleSummary('biweekly', team.id);
      }
      if (now.getDay() === 1) lastWeekly = key;
      if (now.getDay() === 1) lastBiweekly = key;
    }
  }, 60 * 1000);
  console.log('[调度] 每日 09:00 节点提醒、每周一汇总、隔周周一汇总已启用');
}

// ===== 启动 =====
async function start() {
  // 1. 建表 + 初始化种子数据（MySQL）
  await init();
  await seedIfEmpty();
  await migrateScreenshotContent();
  // 2. 启动时刷新一次红黄灯
  await refreshAllLights();
  // 3. 开启周期调度
  schedule();
  // 4. 监听端口
  app.listen(config.PORT, config.HOST, () => {
    console.log(`\n  PEIS 项目管理系统 已启动（企业本地部署 / MySQL）`);
    console.log(`  本机访问: http://127.0.0.1:${config.PORT}/#/`);
    console.log(`  监听: ${config.HOST}:${config.PORT}`);
    console.log(`  数据库: MySQL ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`);
    console.log(`  OA单点登录: ${config.OA_ENABLED ? '已启用' : '未启用'} | 钉钉推送: ${config.DINGTALK_ENABLED ? '已启用' : '未启用'} | 致信推送: ${config.ZIXIN_ENABLED ? '已启用' : '未启用'}\n`);
  });
}

start().catch((e) => {
  console.error('[启动失败]', e.message);
  console.error('请检查 MySQL 连接配置（.env 中 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME）');
  process.exit(1);
});
