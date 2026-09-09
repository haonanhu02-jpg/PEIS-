// 业务 API 路由（全部需求接口，多团队隔离）
import express from 'express';
import bcrypt from 'bcryptjs';
import { auth, requirePerm, signToken, orgScope, teamScope, getUserTeams } from './auth.js';
import { config } from './config.js';
import { findOne, find, all, insert, update, remove, nextId, now } from './db.js';
import { calcLight, refreshAllLights, computeRanking, computeScoreRanking, pushWarnings, pushCycleSummary, createOutcomeOrder, runDueReminders, pushKeyNodeUpdate, REMINDER_PHASES, buildPlanDetail, localDate, oneMonthBefore, addDays, matchPhaseByDaysLeft } from './engine.js';

const router = express.Router();
const PLAN_LEVELS = ['里程碑计划', '1级计划', '2级计划', '3级计划', '4级计划'];
// Forward rejected async handlers to Express 4's error middleware.
for (const method of ['get', 'post', 'put', 'delete']) {
  const register = router[method].bind(router);
  router[method] = (path, ...handlers) => register(path, ...handlers.map(handler =>
    (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)));
}

// ===== 通用工具 =====
function ok(res, data) {
  res.json({ ok: true, data });
}
function fail(res, msg, code = 400) {
  res.status(code).json({ ok: false, msg });
}
function body(req) {
  return req.body || {};
}
// 当前请求的团队上下文
function curTeam(req) {
  return req.teamId || null;
}

function visiblePlan(req, plan, scope) {
  return plan.teamId === req.teamId && (scope.includes(plan.orgUnitId) || plan.owner === req.user.id);
}

async function authorizePlanUpdate(req, res, plan) {
  const perms = req.permissions || [];
  const fullEdit = perms.includes('*') || perms.includes('plan.edit');
  if (fullEdit) {
    const scope = await orgScope(req.user, req.teamId);
    if (!visiblePlan(req, plan, scope)) { fail(res, '无权修改此计划', 403); return false; }
  } else {
    if (!perms.includes('plan.edit_self') || plan.owner !== req.user.id) {
      fail(res, '无权修改此计划', 403); return false;
    }
    const fields = req.path.endsWith('/progress')
      ? ['progress', 'status', 'note', 'keyProgress', 'varianceReason', 'solutionDecision', 'completedAt']
      : ['progress', 'status'];
    if (Object.keys(body(req)).some(key => !fields.includes(key))) {
      fail(res, '只能更新本人计划的进度和状态', 403); return false;
    }
  }
  return true;
}

async function validateTeamWrite(req, res, next) {
  const b = body(req);
  if (b.teamId !== undefined && b.teamId !== req.teamId) return fail(res, '不能跨团队写入', 403);
  if (b.id !== undefined && b.id !== req.params.id) return fail(res, '不能修改记录 ID', 400);
  const collection = req.path.split('/')[1];
  if (req.params.id) {
    const record = await findOne(collection, row => row.id === req.params.id);
    if (!record) return fail(res, '未找到', 404);
    if (record.teamId !== req.teamId) return fail(res, '无权访问该团队记录', 403);
  }
  for (const [field, table] of Object.entries({ orgUnitId: 'orgUnits', strategyId: 'strategies', campaignId: 'campaigns', planId: 'plans' })) {
    if (b[field] == null || b[field] === '') continue;
    const linked = await findOne(table, row => row.id === b[field]);
    if (!linked || linked.teamId !== req.teamId) return fail(res, `关联字段 ${field} 不属于当前团队`, 403);
  }
  next();
}

// ===== 认证 =====
// 账号密码登录
router.post('/auth/login', async (req, res) => {
  const { username, password } = body(req);
  const user = await findOne('users', (u) => u.username === username);
  if (!user) return fail(res, '账号不存在', 404);
  if (user.status === 'disabled') return fail(res, '账号已停用', 403);
  // 密码校验（种子用户已存明文，生产用 bcrypt；此处兼容明文与哈希）
  let valid = false;
  try {
    if (user.pwd && user.pwd.length >= 60 && user.pwd.startsWith('$2')) valid = bcrypt.compareSync(password, user.pwd);
    else valid = user.pwd === password;
  } catch (e) {
    valid = user.pwd === password;
  }
  if (!valid) return fail(res, '密码错误', 401);
  const token = signToken(user);
  ok(res, { token, user: safeUser(user), teams: await getUserTeams(user.id) });
});

// OA 单点登录（对接企业 OA，回调校验）
router.post('/auth/oa-sso', async (req, res) => {
  const { oaToken, oaId, username } = body(req);
  // 企业本地部署：校验 OA 回调 token（真实环境调用 config.OA_BASE_URL 校验）
  if (!config.OA_ENABLED) return fail(res, 'OA 单点登录未启用', 503);
  let user = null;
  if (oaId) user = await findOne('users', (u) => u.oaId === oaId);
  if (!user && username) user = await findOne('users', (u) => u.username === username);
  if (!user) return fail(res, 'OA 账号未关联系统', 404);
  // 模拟 OA token 校验（真实环境：请求 config.OA_BASE_URL + 用 config.OA_SECRET 验签）
  const valid = oaToken && oaToken.length > 0; // 生产应替换为真实验签
  if (!valid) return fail(res, 'OA 登录校验失败', 401);
  const token = signToken(user);
  ok(res, { token, user: safeUser(user), via: 'OA单点登录', teams: await getUserTeams(user.id) });
});

// 钉钉/致信推送打开（从钉钉/致信消息点击进入系统，免密进入）
router.post('/auth/push-open', async (req, res) => {
  const { channelId, dingtalkId, zixinId, pushToken } = body(req);
  if ((channelId !== 'dingtalk' && channelId !== 'zixin') ||
      (channelId === 'dingtalk' && !config.DINGTALK_ENABLED) ||
      (channelId === 'zixin' && !config.ZIXIN_ENABLED)) return fail(res, '企业消息免密登录未启用', 503);
  let user = null;
  if (dingtalkId) user = await findOne('users', (u) => u.dingtalkId === dingtalkId);
  if (!user && zixinId) user = await findOne('users', (u) => u.zixinId === zixinId);
  if (!user) return fail(res, '推送账号未关联系统', 404);
  // 生产应校验 pushToken（钉钉/致信回调签发的临时令牌）
  const token = signToken(user);
  ok(res, { token, user: safeUser(user), via: `从${channelId === 'dingtalk' ? '钉钉' : '致信'}消息打开`, teams: await getUserTeams(user.id) });
});

function safeUser(u) {
  return { id: u.id, username: u.username, name: u.name, role: u.role, orgUnitId: u.orgUnitId };
}

// ===== 当前用户 & 我的上下文 =====
router.get('/me', auth, (req, res) => {
  ok(res, { ...safeUser(req.user), permissions: req.permissions, teams: req.teams, activeTeamId: req.teamId });
});
router.get('/context', auth, async (req, res) => {
  const members = await find('teamMembers', member => member.teamId === req.teamId);
  ok(res, {
    orgUnits: await find('orgUnits', unit => unit.teamId === req.teamId),
    users: (await all('users')).filter(user => members.some(member => member.userId === user.id)).map(safeUser),
  });
});

// ===== 团队（多租户工作区） =====
router.get('/teams', auth, (req, res) => {
  ok(res, req.teams);
});
// 切换当前团队
router.post('/teams/switch', auth, (req, res) => {
  const { teamId } = body(req);
  if (!req.teams.some((t) => t.id === teamId)) return fail(res, '无权访问该团队', 403);
  ok(res, { activeTeamId: teamId });
});

// ===== 仪表盘（驾驶舱：完成率/红黄灯/排名） =====
router.get('/dashboard', auth, async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  const plans = (await all('plans')).filter((p) => visiblePlan(req, p, scope));
  await refreshAllLights(teamId);
  const lights = { green: 0, yellow: 0, red: 0 };
  let progressSum = 0, completed = 0;
  for (const p of plans) {
    lights[p._light] = (lights[p._light] || 0) + 1;
    progressSum += Number(p.progress) || 0;
    if (p.status === '已完成') completed += 1;
  }
  const total = plans.length || 1;
  const ranking = (await computeRanking('owner', teamId)).slice(0, 8);
  const scoreRanking = (await computeScoreRanking(teamId)).slice(0, 8);
  const warnings = (await all('warnings')).filter((w) => visiblePlan(req, w, scope)).slice(0, 20);
  ok(res, {
    total,
    completed,
    completionRate: Math.round((completed / total) * 100),
    avgProgress: Math.round(progressSum / total),
    lights,
    ranking,
    scoreRanking,
    warnings,
    teamId,
    teamName: (await all('teams')).find((t) => t.id === teamId)?.name || '',
  });
});

// ===== 一、目标制定 =====
// 战略规划（定方向：商业模式/核心能力/战略取舍）
router.get('/strategies', auth, requirePerm('strategy.view'), async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  ok(res, (await all('strategies')).filter((s) => (teamId ? s.teamId === teamId : true) && scope.includes(s.orgUnitId)));
});
router.post('/strategies', auth, validateTeamWrite, requirePerm('strategy.edit'), async (req, res) => {
  const b = body(req);
  const teamId = curTeam(req);
  const rec = {
    id: await nextId('s'),
    teamId: teamId || b.teamId || null,
    title: b.title || '未命名战略',
    commercialMode: b.commercialMode || '',
    coreAbility: b.coreAbility || '',
    strategicTradeoff: b.strategicTradeoff || '',
    status: b.status || '执行中',
    orgUnitId: b.orgUnitId || req.user.orgUnitId,
    owner: b.owner || req.user.id,
    progress: Number(b.progress) || 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await insert('strategies', rec);
  ok(res, rec);
});
router.put('/strategies/:id', auth, validateTeamWrite, requirePerm('strategy.edit'), async (req, res) => {
  const b = body(req);
  const rec = await update('strategies', req.params.id, b);
  if (!rec) return fail(res, '未找到', 404);
  ok(res, rec);
});

// 战略解码 / 战役（定策略：战役/班子/计划）
router.get('/campaigns', auth, requirePerm('strategy.view'), async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  ok(res, (await all('campaigns')).filter((c) => (teamId ? c.teamId === teamId : true) && scope.includes(c.orgUnitId)));
});
// 行动计划表单使用的最小战役选项，计划负责人也可读取。
router.get('/campaign-options', auth, async (req, res) => {
  const teamId = curTeam(req);
  ok(res, (await all('campaigns')).filter(c => !teamId || c.teamId === teamId)
    .map(c => ({ id: c.id, name: c.name, orgUnitId: c.orgUnitId, chiefName: c.chiefName })));
});
router.post('/campaigns', auth, validateTeamWrite, requirePerm('strategy.edit'), async (req, res) => {
  const b = body(req);
  const teamId = curTeam(req);
  const rec = {
    id: await nextId('cm'),
    teamId: teamId || b.teamId || null,
    name: b.name || '未命名战役',
    strategyId: b.strategyId || null,
    orgUnitId: b.orgUnitId || req.user.orgUnitId,
    chief: b.chief || req.user.id, // 主将
    commander: b.commander || req.user.id, // 战将/班子
    period: b.period || '',
    status: b.status || '进行中',
    desc: b.desc || '',
    progress: Number(b.progress) || 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await insert('campaigns', rec);
  ok(res, rec);
});
router.put('/campaigns/:id', auth, validateTeamWrite, requirePerm('strategy.edit'), async (req, res) => {
  const rec = await update('campaigns', req.params.id, body(req));
  if (!rec) return fail(res, '未找到', 404);
  ok(res, rec);
});

// 战役计划（分解策略/资源分级/组织保障 -> 输入PEIS系统）
router.get('/plans', auth, async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  let plans = (await all('plans')).filter((p) => visiblePlan(req, p, scope));
  // 过滤
  const { level, status, campaignId, light, mine } = req.query;
  if (level) plans = plans.filter((p) => p.level === level);
  if (status) plans = plans.filter((p) => p.status === status);
  if (campaignId) plans = plans.filter((p) => p.campaignId === campaignId);
  if (mine === '1') plans = plans.filter((p) => p.owner === req.user.id);
  // 红黄灯计算
  await refreshAllLights(teamId);
  ok(res, plans);
});
router.post('/plans', auth, validateTeamWrite, requirePerm('plan.edit'), async (req, res) => {
  const b = body(req);
  const teamId = curTeam(req);
  const level = b.level || '3级计划';
  if (!PLAN_LEVELS.includes(level)) return fail(res, '计划分级必须为里程碑计划、1级计划、2级计划、3级计划或4级计划', 400);
  const rec = {
    id: await nextId('p'),
    teamId: teamId || b.teamId || null,
    name: b.name || '未命名计划',
    subCampaign: b.subCampaign || '',
    campaignId: b.campaignId || null,
    campaignName: b.campaignName || '',
    orgUnitId: b.orgUnitId || req.user.orgUnitId,
    level,
    score: b.score ?? 2,
    owner: b.owner || req.user.id,
    ownerName: b.ownerName || '',
    collector: b.collector || b.ownerName || b.owner || req.user.id,
    subCampaignOwner: b.subCampaignOwner || b.ownerName || b.owner || req.user.id,
    metric: b.metric || '',
    milestone: b.milestone || '',
    participants: b.participants || [],
    progress: Number(b.progress) || 0,
    due: b.due || '',
    completedAt: b.completedAt || '',
    status: b.status || '执行中',
    category: b.category || '',
    createdAt: now(),
    updatedAt: now(),
  };
  await insert('plans', rec);
  await refreshAllLights(teamId);
  ok(res, rec);
});
router.put('/plans/:id', auth, validateTeamWrite, async (req, res) => {
  const b = body(req);
  if (b.level !== undefined && !PLAN_LEVELS.includes(b.level)) return fail(res, '计划分级无效', 400);
  if (b._light !== undefined && !['red', 'yellow', 'green'].includes(b._light)) return fail(res, '亮灯状态无效', 400);
  // 本人只能改自己的进度（plan.edit_self），有 plan.edit 可改全部
  const plan = await findOne('plans', (p) => p.id === req.params.id);
  if (!plan) return fail(res, '未找到', 404);
  if (!await authorizePlanUpdate(req, res, plan)) return;
  const rec = await update('plans', req.params.id, b);
  await refreshAllLights(plan.teamId);
  await pushKeyNodeUpdate(rec, b.keyProgress || b.note || '');
  // 自动预警推送（更新后红黄灯变化）
  const { light, reason } = calcLight(rec);
  if (light !== 'green') await pushWarnings([{ ...rec, color: light, reason, planName: rec.name }]);
  ok(res, rec);
});
router.delete('/plans/:id', auth, validateTeamWrite, requirePerm('plan.edit'), async (req, res) => {
  const plan = await findOne('plans', (p) => p.id === req.params.id);
  if (!plan) return fail(res, '未找到', 404);
  const scope = await orgScope(req.user, req.teamId);
  if (!visiblePlan(req, plan, scope)) return fail(res, '无权删除此计划', 403);
  await remove('plans', req.params.id);
  await refreshAllLights(plan.teamId);
  ok(res, { id: req.params.id });
});

// 进度更新（PEIS系统：人为定期更新进度 -> 自动计算排名/红黄灯/推送）
router.post('/plans/:id/progress', auth, validateTeamWrite, async (req, res) => {
  const b = body(req);
  const plan = await findOne('plans', (p) => p.id === req.params.id);
  if (!plan) return fail(res, '未找到', 404);
  if (!await authorizePlanUpdate(req, res, plan)) return;
  if (b.completedAt && !/^\d{4}-\d{2}-\d{2}$/.test(b.completedAt)) return fail(res, '完成时间格式无效', 400);
  const updated = await update('plans', req.params.id, {
    progress: Number(b.progress),
    completedAt: b.completedAt || plan.completedAt || '',
    status: b.status || (Number(b.progress) >= 100 ? '已完成' : plan.status),
  });
  // 记录进度日志
  await insert('progressLogs', {
    id: await nextId('plg'),
    teamId: plan.teamId,
    planId: plan.id,
    by: req.user.id,
    progress: Number(b.progress),
    note: b.note || '',
    keyProgress: b.keyProgress || '',
    varianceReason: b.varianceReason || '',
    solutionDecision: b.solutionDecision || '',
    completedAt: b.completedAt || '',
    at: now(),
  });
  await refreshAllLights(plan.teamId);
  await pushKeyNodeUpdate(updated, b.keyProgress || b.note || '');
  if (Number(b.progress) >= 100 || (plan.due && new Date(plan.due) <= new Date())) {
    await createOutcomeOrder(updated);
  }
  // 自动预警推送
  const { light, reason } = calcLight(updated);
  if (light !== 'green') await pushWarnings([{ ...updated, color: light, reason, planName: updated.name }]);
  ok(res, { plan: updated, light, ranking: (await computeRanking('owner', plan.teamId)).slice(0, 5) });
});

// ===== 二、会议机制 =====
router.get('/meetings', auth, requirePerm('meeting.view'), async (req, res) => {
  const teamId = curTeam(req);
  ok(res, (await all('meetings')).filter((m) => !teamId || m.teamId === teamId));
});
router.post('/meetings', auth, validateTeamWrite, requirePerm('meeting.manage'), async (req, res) => {
  const b = body(req);
  const teamId = curTeam(req);
  const rec = {
    id: await nextId('m'),
    teamId: teamId || b.teamId || null,
    name: b.name || '会议',
    level: b.level || '战役层级',
    frequency: b.frequency || '周',
    cadence: b.cadence || 'weekly',
    desc: b.desc || '',
    owner: b.owner || req.user.id,
    createdAt: now(),
  };
  await insert('meetings', rec);
  ok(res, rec);
});

// ===== 三、周期 =====
router.get('/cycles', auth, async (req, res) => {
  ok(res, await all('cycles'));
});
// 触发周期推送（日/周/月/季/年）
router.post('/cycles/:cadence/run', auth, requirePerm('plan.edit'), async (req, res) => {
  if (req.params.cadence === 'reminders') {
    const phases = Array.isArray(req.body?.phases) ? req.body.phases.filter(p => REMINDER_PHASES.includes(p)) : null;
    await runDueReminders(new Date(), curTeam(req), phases && phases.length ? phases : null);
  } else await pushCycleSummary(req.params.cadence, curTeam(req));
  ok(res, { ran: req.params.cadence, at: now() });
});

// ===== 奖惩责任工单（站内闭环；外部 OA/HR 对接后可替换流转动作） =====
router.get('/responsibility-orders', auth, async (req, res) => {
  ok(res, await find('responsibilityOrders', order => order.teamId === req.teamId));
});
router.put('/responsibility-orders/:id', auth, async (req, res) => {
  const order = await findOne('responsibilityOrders', row => row.id === req.params.id);
  if (!order || order.teamId !== req.teamId) return fail(res, '未找到', 404);
  const b = body(req);
  const transitions = {
    '待填写': ['待审批'],
    '待审批': ['已批准', '已驳回'],
    '已批准': ['人力已执行'],
    '已驳回': ['待审批'],
  };
  const target = b.status || order.status;
  if (target !== order.status && !(transitions[order.status] || []).includes(target)) return fail(res, '不允许的流程状态变更', 400);
  if (target === '待审批') {
    const allocations = Array.isArray(b.allocations) ? b.allocations : order.allocations;
    const total = (allocations || []).reduce((sum, item) => sum + Number(item.ratio || 0), 0);
    if (!allocations?.length || Math.abs(total - 100) > 0.001) return fail(res, '奖金/责任分配比例合计必须为100%', 400);
    b.allocations = allocations;
    b.submittedBy = req.user.id; b.submittedAt = now();
  }
  if (['已批准', '已驳回'].includes(target)) {
    if (!(req.permissions || []).some(p => p === '*' || p === 'reward.manage')) return fail(res, '无审批权限', 403);
    b.approvedBy = req.user.id; b.approvedAt = now();
    if (target === '已批准') b.hrStatus = '待执行';
  }
  if (target === '人力已执行') {
    if (!(req.permissions || []).some(p => p === '*' || p === 'org.view')) return fail(res, '无人力执行权限', 403);
    b.hrStatus = '已执行'; b.hrHandledBy = req.user.id; b.hrHandledAt = now();
  }
  ok(res, await update('responsibilityOrders', order.id, b));
});

// ===== 四、奖惩 =====
router.get('/rewards', auth, requirePerm('reward.view'), async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  const plans = (await all('plans')).filter((p) => visiblePlan(req, p, scope));
  const planIds = new Set(plans.map((p) => p.id));
  ok(res, (await all('rewards')).filter((r) => planIds.has(r.planId)));
});
router.post('/rewards', auth, validateTeamWrite, requirePerm('reward.manage'), async (req, res) => {
  const b = body(req);
  const teamId = curTeam(req);
  const rec = {
    id: await nextId('rw'),
    teamId: teamId || b.teamId || null,
    planId: b.planId || null,
    level: b.level || '',
    score: b.score ?? 0,
    amount: Number(b.amount) || 0,
    type: b.type || '激励', // 激励 / 处罚
    by: req.user.id,
    note: b.note || '',
    ratio: b.ratio ?? 1.0, // 责任工单分比例
    at: now(),
  };
  await insert('rewards', rec);
  ok(res, rec);
});
// 奖惩标准（分级分值与金额区间）
router.get('/reward-standards', auth, async (req, res) => {
  ok(res, { levels: await all('planLevels'), responsibility: await all('responsibilityRules') });
});

// ===== 五、组织权限 =====
router.get('/org', auth, requirePerm('org.view'), async (req, res) => {
  const teamId = curTeam(req);
  ok(res, { orgUnits: (await all('orgUnits')).filter((u) => !teamId || u.teamId === teamId), roles: await all('roles') });
});
// OA 组织架构对接 + 推送钉钉/致信
router.get('/oa-sync', auth, requirePerm('org.view'), async (req, res) => {
  // 企业本地部署：对接内部 OA 组织架构，并推送到钉钉/致信
  const members = await find('teamMembers', member => member.teamId === req.teamId);
  const users = (await all('users')).filter(user => members.some(member => member.userId === user.id));
  ok(res, {
    source: 'OA',
    pushedTo: config.DINGTALK_ENABLED ? ['钉钉'] : [],
    extra: config.ZIXIN_ENABLED ? ['致信'] : [],
    count: users.length,
    users: users.map((u) => ({ id: u.id, name: u.name, role: u.role, dingtalkId: u.dingtalkId, zixinId: u.zixinId, oaId: u.oaId })),
    at: now(),
  });
});

// ===== 预警 & 推送 =====
router.get('/warnings', auth, async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  await refreshAllLights(teamId);
  ok(res, (await all('warnings')).filter((w) => visiblePlan(req, w, scope)));
});
router.get('/push-logs', auth, async (req, res) => {
  const teamId = curTeam(req);
  ok(res, (await all('pushLogs')).filter((p) => !teamId || p.teamId === teamId).slice(-30).reverse());
});

// 推送详情：当前团队内所有亮灯为红灯/黄灯的计划，含完整 12 字段 + 命中阶段。
// 不依赖历史推送记录，是"实时红黄灯快照"，方便"推送详情"页直接渲染。
router.get('/push-details', auth, async (req, res) => {
  const teamId = curTeam(req);
  const plans = (await all('plans')).filter((p) => (!teamId || p.teamId === teamId) && p.due && p.status !== '已取消');
  const campaigns = await all('campaigns');
  const items = [];
  for (const plan of plans) {
    const { light, reason: lightReason } = calcLight(plan, new Date());
    if (light !== 'red' && light !== 'yellow') continue;
    const campaign = campaigns.find((c) => c.id === plan.campaignId);
    // 命中阶段：与 runDueReminders 保持一致的"剩余天数窗口"语义
    const today = localDate(new Date());
    const phase = matchPhaseByDaysLeft(plan.due, today);
    items.push(buildPlanDetail(plan, campaign, light, lightReason, phase || '-'));
  }
  ok(res, items);
});

// ===== 看板/时间轴视图数据 =====
router.get('/board', auth, async (req, res) => {
  const teamId = curTeam(req);
  const scope = await orgScope(req.user, teamId);
  await refreshAllLights(teamId);
  const plans = (await all('plans')).filter((p) => visiblePlan(req, p, scope));
  ok(res, {
    plans,
    campaigns: (await all('campaigns')).filter((c) => (teamId ? c.teamId === teamId : true) && scope.includes(c.orgUnitId)),
    levels: await all('planLevels'),
  });
});

export default router;
