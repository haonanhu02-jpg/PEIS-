// PEIS 业务核心：红黄灯预警、自动排名、推送（钉钉/致信）—— 多团队隔离
import { config } from './config.js';
import { findOne, find, all, insert, update, updateCollection } from './db.js';

const DAY = 86400000;

// 判断单个计划的红黄灯状态
export function calcLight(plan, today = new Date()) {
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
export async function pushNotice({ title, content, toUserIds = [], channel = '钉钉', color = 'red', teamId = null }) {
  const log = {
    id: `push_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    teamId,
    channel,
    title,
    content,
    toUserIds,
    color,
    at: new Date().toISOString(),
    enabled: channel === '钉钉' ? config.DINGTALK_ENABLED : config.ZIXIN_ENABLED,
  };
  await insert('pushLogs', log);
  // 企业本地部署：模拟调用钉钉/致信接口（真实环境替换为 config.DINGTALK_BASE_URL / ZIXIN_BASE_URL）
  console.log(`[推送] ${channel} -> ${toUserIds.join(',')} | ${title} (${color})`);
  return log;
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
    await pushNotice({ title: '【日·到期节点反馈】', content: `当日到期 ${dueToday.length} 项：${dueToday.slice(0, 10).map((p) => p.name).join('、')}`, toUserIds: plans.map((p) => p.owner), channel: '钉钉', teamId });
  } else if (cycle === 'weekly') {
    const week = plans.filter((p) => p.due && (new Date(p.due) - now) / DAY <= 7);
    const warns = await refreshAllLights(teamId);
    await pushNotice({ title: '【周·到期汇总+风险提示】', content: `本周到期 ${week.length} 项，红灯 ${warns.filter((w) => w.color === 'red').length} 项，黄灯 ${warns.filter((w) => w.color === 'yellow').length} 项`, toUserIds: plans.map((p) => p.owner), channel: '钉钉', teamId });
  } else if (cycle === 'monthly') {
    const ranking = await computeRanking('owner', teamId);
    await pushNotice({ title: '【月·完成率排名+奖惩】', content: `完成率排名：${ranking.slice(0, 5).map((r, i) => `${i + 1}.${r.name}(${r.completionRate}%)`).join(' ')}`, toUserIds: plans.map((p) => p.owner), channel: '钉钉', teamId });
  }
}
