// 认证与鉴权中间件（JWT + OA 单点登录 + 钉钉/致信推送打开 + 多团队隔离）
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { findOne, find, all } from './db.js';

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, orgUnitId: user.orgUnitId },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// 从请求中提取当前用户（异步中间件）
export async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, msg: '未登录' });
  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    const user = await findOne('users', (u) => u.id === payload.id || u.username === payload.username);
    if (!user) return res.status(401).json({ ok: false, msg: '账号不存在' });
    if (user.status === 'disabled') return res.status(403).json({ ok: false, msg: '账号已停用' });
    req.user = user;
    // 解析当前团队上下文（请求头 X-Team-Id > 查询参数 teamId > 默认第一个团队）
    req.teams = await getUserTeams(user.id);
    const headerTeam = req.headers['x-team-id'];
    const queryTeam = req.query ? req.query.teamId : null;
    let wantTeam = headerTeam || queryTeam || null;
    // 超级管理员可访问任意团队；其余用户只能访问自己所属团队
    const isSuper = /超级管理员|admin/i.test(user.role || '');
    if (wantTeam && !isSuper && !req.teams.some((t) => t.id === wantTeam)) {
      return res.status(403).json({ ok: false, msg: '无权访问该团队' });
    }
    if (!wantTeam) wantTeam = req.teams[0] ? req.teams[0].id : null;
    if (!wantTeam || !(await findOne('teams', t => t.id === wantTeam))) {
      return res.status(403).json({ ok: false, msg: '无可访问的团队' });
    }
    req.teamId = wantTeam;
    req.permissions = await permissionsFor(user, req.teams.find(t => t.id === wantTeam)?.roleInTeam);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, msg: '登录已失效' });
  }
}

// 获取用户所属团队列表（异步）
export async function getUserTeams(userId) {
  const memberships = await find('teamMembers', (m) => m.userId === userId);
  const teams = await all('teams');
  return memberships
    .map((m) => teams.find((t) => t.id === m.teamId))
    .filter(Boolean)
    .map((t) => ({ ...t, roleInTeam: memberships.find((m) => m.teamId === t.id)?.roleInTeam }));
}

export async function permissionsFor(user, teamRole) {
  if (/超级管理员|admin/i.test(user.role || '')) return ['*'];
  const role = await findOne('roles', r => r.name === user.role) ||
    await findOne('roles', r => r.name === teamRole);
  return role?.perms || [];
}

// 权限校验（分部门分人权限控制），异步中间件
export function requirePerm(perm) {
  return async (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(401).json({ ok: false, msg: '未登录' });
    // 超级管理员（role 字段含超级管理员）拥有全部权限
    if (/超级管理员|超级|admin/i.test(user.role || '')) return next();
    const perms = req.permissions || [];
    if (perms.includes('*') || perms.includes(perm)) return next();
    // 允许 plan.edit 覆盖 plan.edit_self
    if (perm === 'plan.edit_self' && perms.includes('plan.edit')) return next();
    return res.status(403).json({ ok: false, msg: `无权限：${perm}` });
  };
}

// 数据隔离：返回当前团队下可见的组织单元 id 集合（含下级），异步
export async function orgScope(user, teamId) {
  const units = await find('orgUnits', (u) => !teamId || u.teamId === teamId);
  function collect(id) {
    const out = [id];
    for (const u of units) if (u.parentId === id) out.push(...collect(u.id));
    return out;
  }
  // 超级管理员/CEO/计划效率部主任 可见全团队
  if (/超级管理员|admin|CEO|计划效率部/i.test(user.role || '')) {
    return units.map((u) => u.id);
  }
  // 用户在团队内的组织归属
  let myUnit = null;
  if (teamId) {
    const m = await findOne('teamMembers', (m) => m.teamId === teamId && m.userId === user.id);
    myUnit = m ? m.orgUnitId : null;
  }
  if (!myUnit) myUnit = user.orgUnitId;
  // 若 myUnit 不属于当前团队，则该团队内无可见范围（返回空）
  if (!units.some((u) => u.id === myUnit)) return [];
  return collect(myUnit);
}

// 团队数据过滤：返回某集合中属于指定团队（或用户可见团队）的记录
export async function teamScope(user, teamId) {
  const teams = teamId ? [teamId] : (await getUserTeams(user.id)).map((t) => t.id);
  return (record) => teams.includes(record.teamId);
}

export { signToken };
