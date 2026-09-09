// PEIS 业务核心：红黄灯预警、自动排名、推送（钉钉/致信）—— 多团队隔离
import { config } from './config.js';
import { findOne, find, all, insert, update, updateCollection, nextId, now } from './db.js';

const DAY = 86400000;

// 判断单个计划的红黄灯状态（若已手动选灯，优先使用手动值）
export function calcLight(plan, today = new Date()) {
  if (plan._lightManual) return { light: plan._light || 'green', reason: plan._lightReason || '手动设置' };
  if (plan.status === '已完成') return { light: 'green', reason: '已完成' };
  if (plan.status === '已取消') return { light: 'green', reason: '已取消' };
  const due = plan.due ? new Date(plan.due) : null;
  const progress = Number(plan.progress) || 0;
  const daysLeft = due ? (due - today) / DAY : Infinity;

  // 红灯：已逾期 或 完成率<50%
  if (due && today > due) return { light: 'red', reason: '已逾期' };
  if (progress < 50) return { light: 'red', reason: '完成率<50%' };
  // 黄灯：完成率<80% 且 距截止<=7天
  if (progress < 80 && daysLeft <= 7) return { light: 'yellow', reason: '进度滞后(<=7天)' };
  // 黄灯：已到期但未完成（进度<100% 且今天>截止）已在上处理；这里处理临界
  if (due && today > due && progress < 100) return { light: 'red', reason: '逾期未完成' };
  return { light: 'green', reason: '进度正常' };
}

// 为全部计划刷新红黄灯，并写入 warnings 集合（去重：仅保留当前态）
// 支持按 teamId 过滤（团队隔离）
export async function refreshAllLights(teamId) {
  const plans = (await all('plans')).filter((p) => !teamId || p.teamId === teamId);
  const warnings = [];
  for (const p of plans) {
    const { light, reason } = calcLight(p);
    await update('plans', p.id, { _light: light, _lightReason: reason });
    if (light !== 'green') {
      warnings.push({
        id: `w_${p.id}`,
        teamId: p.teamId,
        planId: p.id,
        planName: p.name,
        owner: p.owner,
        orgUnitId: p.orgUnitId,
        level: p.level,
        color: light,
        reason,
        progress: p.progress,
        due: p.due,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  // 回写 warnings 集合（按团队清空后重建，保持团队隔离）
  if (teamId) {
    // 只更新该团队的 warnings，保留其他团队
    const others = (await all('warnings')).filter((w) => w.teamId !== teamId);
    await updateCollection('warnings', [...others, ...warnings]);
  } else {
    await updateCollection('warnings', warnings);
  }
  return warnings;
}

// 计算完成率排名（按计划负责人/组织单元，月考核，团队隔离）
export async function computeRanking(groupBy = 'owner', teamId) {
  const plans = (await all('plans')).filter((p) => p.status !== '已取消' && (!teamId || p.teamId === teamId));
  const acc = {};
  for (const p of plans) {
    const key = groupBy === 'orgUnit' ? p.orgUnitId : p.owner;
    if (!acc[key]) acc[key] = { id: key, name: '', total: 0, completed: 0, progressSum: 0 };
    acc[key].total += 1;
    if (p.status === '已完成') acc[key].completed += 1;
    acc[key].progressSum += Number(p.progress) || 0;
    if (groupBy === 'owner') acc[key].name = (await findOne('users', (u) => u.id === p.owner))?.name || p.owner;
    else acc[key].name = (await findOne('orgUnits', (u) => u.id === p.orgUnitId))?.name || p.orgUnitId;
  }
  const list = Object.values(acc).map((x) => ({
    ...x,
    completionRate: x.total ? Math.round((x.completed / x.total) * 100) : 0,
    avgProgress: x.total ? Math.round(x.progressSum / x.total) : 0,
  }));
  list.sort((a, b) => b.completionRate - a.completionRate || b.avgProgress - a.avgProgress);
  return list;
}

// 构造推送内容（钉钉/致信），仅记录 pushLog（企业本地部署模拟推送）
export async function pushNotice({ title, content, toUserIds = [], channel = '站内', color = 'red', teamId = null, eventKey = null, detail = null }) {
  if (eventKey && await findOne('pushLogs', row => row.eventKey === eventKey)) return null;
  const log = {
    id: `push_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    teamId,
    channel,
    title,
    content,
    toUserIds,
    color,
    at: new Date().toISOString(),
    enabled: channel === '站内' || (channel === '钉钉' ? config.DINGTALK_ENABLED : config.ZIXIN_ENABLED),
    eventKey,
    detail,
    status: (channel === '站内' || (channel === '钉钉' ? config.DINGTALK_ENABLED : config.ZIXIN_ENABLED)) ? '已记录' : '渠道未启用',
  };
  await insert('pushLogs', log);
  // 企业本地部署：模拟调用钉钉/致信接口（真实环境替换为 config.DINGTALK_BASE_URL / ZIXIN_BASE_URL）
  console.log(`[推送] ${channel} -> ${toUserIds.join(',')} | ${title} (${color})`);
  return log;
}

function recipientLabels(plan, campaign) {
  return [...new Set([plan.collector, campaign?.chief || campaign?.chiefName, plan.subCampaignOwner]
    .filter(Boolean))];
}

// 把当前计划完整字段打包，供推送详情与红黄灯推送使用（不依赖后端其他函数）
export function buildPlanDetail(plan, campaign, light, lightReason, phase) {
  // 完成状态展示口径与前端 completionTag 保持一致
  const progress = Number(plan.progress) || 0;
  const done = progress >= 100 || plan.status === '已完成';
  let statusText = plan.status || '未开始';
  if (done) {
    if (plan.completedAt && plan.due) statusText = plan.completedAt <= plan.due ? '按时完成' : '延误完成';
    else statusText = '已完成';
  }
  return {
    campaignName: campaign?.name || plan.campaignName || '-',         // 必胜战役
    subCampaign: plan.subCampaign || '-',                             // 分解战役
    planName: plan.name || '-',                                       // 行动计划
    level: plan.level || '未分级',                                     // 计划分级
    metric: plan.metric || '-',                                       // 衡量指标
    milestone: plan.milestone || '-',                                 // 里程碑事件
    due: plan.due || '-',                                             // 计划完成时间
    completedAt: plan.completedAt || '-',                             // 实际完成时间
    ownerName: plan.ownerName || plan.collector || '-',               // 负责人
    progress: `${progress}%`,                                        // 完成度
    status: statusText,                                               // 完成状态
    light: light || '-',                                              // 亮灯情况
    lightReason: lightReason || '-',                                  // 亮灯原因
    phase: phase || '-',                                              // 命中阶段（节点提醒用）
  };
}

export async function createOutcomeOrder(plan) {
  const complete = Number(plan.progress) >= 100 || plan.status === '已完成';
  const due = plan.due ? new Date(`${plan.due}T23:59:59`) : null;
  if (!complete && (!due || new Date() <= due)) return null;
  const type = complete ? '奖励' : '惩罚';
  const existing = await findOne('responsibilityOrders', row => row.planId === plan.id && row.type === type);
  if (existing) return existing;
  const campaign = await findOne('campaigns', row => row.id === plan.campaignId);
  const order = {
    id: await nextId('ro'), teamId: plan.teamId, planId: plan.id, campaignId: plan.campaignId,
    type, triggerReason: complete ? '计划完成率达到100%' : '节点到期但完成率未达到100%',
    campaignOwner: campaign?.chief || campaign?.chiefName || '', status: '待填写', allocations: [],
    hrStatus: '待流转', createdAt: now(), updatedAt: now(),
  };
  await insert('responsibilityOrders', order);
  await pushNotice({
    title: `【${type}责任工单】${plan.subCampaign || plan.name}`,
    content: `${order.triggerReason}，请战役负责人填写参与人员及分配比例后提交审批。`,
    toUserIds: recipientLabels(plan, campaign), channel: '站内', color: complete ? 'green' : 'red',
    teamId: plan.teamId, eventKey: `outcome:${plan.id}:${type}`,
  });
  return order;
}

export async function pushKeyNodeUpdate(plan, updateNote = '') {
  const campaign = await findOne('campaigns', row => row.id === plan.campaignId);
  return pushNotice({
    title: `【关键节点进展】${plan.subCampaign || plan.name}`,
    content: `完成度：${plan.progress || 0}%${updateNote ? `；关键进展：${updateNote}` : ''}`,
    toUserIds: recipientLabels(plan, campaign), channel: '站内', color: Number(plan.progress) >= 100 ? 'green' : 'yellow',
    teamId: plan.teamId, eventKey: `progress:${plan.id}:${plan.progress}:${plan.updatedAt || ''}`,
  });
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function oneMonthBefore(dateText) {
  const [year, month, day] = dateText.split('-').map(Number);
  const targetMonth = month === 1 ? 12 : month - 1;
  const targetYear = month === 1 ? year - 1 : year;
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

// 在 'YYYY-MM-DD' 字符串日期上加 n 天，返回同格式字符串
function addDays(dateText, n) {
  const [y, m, d] = dateText.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return localDate(dt);
}

// 节点提醒支持的阶段（顺序即界面展示顺序）
export const REMINDER_PHASES = ['提前一个月', '提前一周', '提前三天', '到期当天'];

// 按"剩余天数窗口"匹配阶段（从近到远优先，互斥），null 表示不在任何阶段。
// 到期当天  : 已逾期 或 今天到期（剩余 ≤ 0 天）
// 提前三天  : 剩余 1~3 天
// 提前一周  : 剩余 4~7 天
// 提前一个月: 剩余 8~30 天
// 说明：旧实现判定"due 恰好等于某一天"，日常数据几乎不可能刚好落在节点上，
//       实测 7 条种子计划在 4 个节点上全部 0 命中，功能形同虚设。改为天数窗口后命中率正常。
export function matchPhaseByDaysLeft(due, today) {
  if (!due) return null;
  if (due <= today) return '到期当天';
  if (due <= addDays(today, 3)) return '提前三天';
  if (due <= addDays(today, 7)) return '提前一周';
  if (due <= addDays(today, 30)) return '提前一个月';
  return null;
}

export async function runDueReminders(at = new Date(), teamId = null, phases = null) {
  const today = localDate(at);
  const plans = await find('plans', plan => (!teamId || plan.teamId === teamId) && plan.due && plan.status !== '已取消');
  for (const plan of plans) {
    const campaign = await findOne('campaigns', row => row.id === plan.campaignId);
    const recipients = recipientLabels(plan, campaign);
    let phase = null;
    const hit = matchPhaseByDaysLeft(plan.due, today);
    if (Array.isArray(phases) && phases.length) {
      // 手动选中阶段：按剩余天数窗口匹配，仅保留用户勾选的阶段
      if (hit && phases.includes(hit)) phase = hit;
    } else {
      // 定时任务默认行为：仅"到期当天"与"提前一个月"（沿用原有两个节点，改用天数窗口判定）
      if (hit === '到期当天' || hit === '提前一个月') phase = hit;
    }
    if (!phase) continue;
    // 仅红灯/黄灯才生成推送；亮绿灯的过滤掉（保持原 createOutcomeOrder 逻辑不变）
    const { light, reason: lightReason } = calcLight(plan, at);
    if (light === 'red' || light === 'yellow') {
      const detail = buildPlanDetail(plan, campaign, light, lightReason, phase);
      await pushNotice({
        title: `【节点提醒·${phase}·${light === 'red' ? '红灯' : '黄灯'}】${plan.subCampaign || plan.name}`,
        content: `所属必胜战役：${detail.campaignName}；里程碑：${detail.milestone}；完成度：${detail.progress}；亮灯：${light}（${lightReason}）`,
        detail,
        toUserIds: recipients, channel: '站内', color: light === 'red' ? 'red' : 'yellow', teamId: plan.teamId,
        eventKey: `due:${plan.id}:${phase}:${today}`,
      });
    }
    await createOutcomeOrder(plan);
  }
}

// 预警触发推送（红黄灯 -> 推送相关人）
export async function pushWarnings(warnings) {
  for (const w of warnings) {
    const owner = await findOne('users', (u) => u.id === w.owner);
    const targets = [];
    if (owner) targets.push(owner.id);
    // 红灯/黄灯推送上级（组织单元1号位）
    const unit = await findOne('orgUnits', (u) => u.id === w.orgUnitId);
    await pushNotice({
      title: `【${w.color === 'red' ? '红灯警示' : '黄灯预警'}】${w.planName}`,
      content: `${w.reason}，当前完成率${w.progress}%，责任人 ${owner?.name || w.owner}${unit ? `，所属${unit.name}` : ''}`,
      toUserIds: targets.length ? targets : [w.owner],
      channel: '钉钉',
      color: w.color,
      teamId: w.teamId,
    });
  }
}

// 周期推送（日/周/月），团队隔离
export async function pushCycleSummary(cycle, teamId) {
  const plans = (await all('plans')).filter((p) => !teamId || p.teamId === teamId);
  const now = new Date();
  const dueToday = plans.filter((p) => p.due && new Date(p.due) <= now && p.status !== '已完成');
  if (cycle === 'daily') {
    await pushNotice({ title: '【日·到期节点反馈】', content: `当日到期 ${dueToday.length} 项：${dueToday.slice(0, 10).map((p) => p.name).join('、')}`, toUserIds: plans.map((p) => p.owner || p.ownerName), channel: '站内', teamId });
  } else if (cycle === 'weekly' || cycle === 'biweekly') {
    const week = plans.filter((p) => p.due && (new Date(p.due) - now) / DAY <= 7);
    const warns = await refreshAllLights(teamId);
    await pushNotice({ title: `【${cycle === 'biweekly' ? '双周' : '周'}·到期汇总+风险提示】`, content: `本周期到期 ${week.length} 项，红灯 ${warns.filter((w) => w.color === 'red').length} 项，黄灯 ${warns.filter((w) => w.color === 'yellow').length} 项`, toUserIds: plans.map((p) => p.owner || p.ownerName), channel: '站内', teamId });
  } else if (cycle === 'monthly') {
    const ranking = await computeRanking('owner', teamId);
    await pushNotice({ title: '【月·完成率排名+奖惩】', content: `完成率排名：${ranking.slice(0, 5).map((r, i) => `${i + 1}.${r.name}(${r.completionRate}%)`).join(' ')}`, toUserIds: plans.map((p) => p.owner), channel: '钉钉', teamId });
  }
}

// 暴露给路由使用的辅助函数（推送详情页依赖）
export { localDate, oneMonthBefore, addDays };
