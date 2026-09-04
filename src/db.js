// ============================================================
// MySQL 数据层 —— 生产环境后端（企业服务器部署）
// 通过 mysql2/promise 连接池实现。所有 API 均为 async。
//
// 连接参数来自 config：
//   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME / DB_POOL_SIZE
// ============================================================
import mysql from 'mysql2/promise';
import { config } from './config.js';

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: config.DB_HOST || '127.0.0.1',
      port: Number(config.DB_PORT || 3306),
      user: config.DB_USER || 'root',
      password: config.DB_PASSWORD || '',
      database: config.DB_NAME || 'peis',
      waitForConnections: true,
      connectionLimit: Number(config.DB_POOL_SIZE || 10),
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: 'Z',
      decimalNumbers: true,
      dateStrings: false,
    });
  }
  return pool;
}

// ===== 表结构定义 =====
// 每个字段：{ type: 'text'|'int'|'real'|'bool'|'json', primary?, unique?, notNull?, default? }
// 复合主键表用 _pk: ['col1','col2']
const TABLES = {
  meta: {
    key: { type: 'text', primary: true },
    value: { type: 'text' },
  },
  teams: {
    id: { type: 'text', primary: true },
    name: { type: 'text', notNull: true },
    code: { type: 'text', unique: true },
    desc: { type: 'text' },
    ownerId: { type: 'text' },
    status: { type: 'text', default: 'active' },
    createdAt: { type: 'text' },
  },
  teamMembers: {
    teamId: { type: 'text', notNull: true },
    userId: { type: 'text', notNull: true },
    roleInTeam: { type: 'text', default: '成员' },
    orgUnitId: { type: 'text' },
    _pk: ['teamId', 'userId'],
  },
  orgUnits: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text', notNull: true },
    name: { type: 'text', notNull: true },
    type: { type: 'text' },
    parentId: { type: 'text' },
    sort: { type: 'int', default: 0 },
    source: { type: 'text', default: 'OA' },
    members: { type: 'int', default: 0 },
  },
  users: {
    id: { type: 'text', primary: true },
    username: { type: 'text', unique: true },
    name: { type: 'text', notNull: true },
    role: { type: 'text' },
    orgUnitId: { type: 'text' },
    dingtalkId: { type: 'text' },
    zixinId: { type: 'text' },
    oaId: { type: 'text' },
    status: { type: 'text', default: 'active' },
    hireDate: { type: 'text' },
    pwd: { type: 'text' },
  },
  roles: {
    id: { type: 'text', primary: true },
    name: { type: 'text', unique: true },
    perms: { type: 'json' },
    desc: { type: 'text' },
  },
  planLevels: {
    id: { type: 'text', primary: true },
    level: { type: 'text' },
    score: { type: 'int' },
    rewardMin: { type: 'int' },
    rewardMax: { type: 'int' },
    decision: { type: 'text' },
    desc: { type: 'text' },
  },
  responsibilityRules: {
    id: { type: 'text', primary: true },
    role: { type: 'text' },
    ratio: { type: 'real' },
    note: { type: 'text' },
  },
  warnRules: {
    id: { type: 'text', primary: true },
    color: { type: 'text' },
    name: { type: 'text' },
    desc: { type: 'text' },
    threshold: { type: 'text' },
  },
  meetings: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text', notNull: true },
    name: { type: 'text' },
    level: { type: 'text' },
    frequency: { type: 'text' },
    cadence: { type: 'text' },
    desc: { type: 'text' },
    owner: { type: 'text' },
    createdAt: { type: 'text' },
    updatedAt: { type: 'text' },
  },
  cycles: {
    id: { type: 'text', primary: true },
    period: { type: 'text' },
    cadence: { type: 'text' },
    content: { type: 'text' },
  },
  strategies: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text', notNull: true },
    title: { type: 'text' },
    commercialMode: { type: 'text' },
    coreAbility: { type: 'text' },
    strategicTradeoff: { type: 'text' },
    status: { type: 'text' },
    orgUnitId: { type: 'text' },
    owner: { type: 'text' },
    createdAt: { type: 'text' },
    updatedAt: { type: 'text' },
    progress: { type: 'int', default: 0 },
  },
  campaigns: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text', notNull: true },
    name: { type: 'text' },
    strategyId: { type: 'text' },
    orgUnitId: { type: 'text' },
    chief: { type: 'text' },
    commander: { type: 'text' },
    period: { type: 'text' },
    status: { type: 'text' },
    desc: { type: 'text' },
    progress: { type: 'int', default: 0 },
    createdAt: { type: 'text' },
    updatedAt: { type: 'text' },
  },
  plans: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text', notNull: true },
    name: { type: 'text' },
    campaignId: { type: 'text' },
    orgUnitId: { type: 'text' },
    level: { type: 'text' },
    score: { type: 'int', default: 0 },
    owner: { type: 'text' },
    participants: { type: 'json' },
    progress: { type: 'int', default: 0 },
    due: { type: 'text' },
    status: { type: 'text' },
    updatedAt: { type: 'text' },
    createdAt: { type: 'text' },
    category: { type: 'text' },
    _light: { type: 'text' },
    _lightReason: { type: 'text' },
  },
  progressLogs: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text' },
    planId: { type: 'text' },
    by: { type: 'text' },
    progress: { type: 'int' },
    note: { type: 'text' },
    at: { type: 'text' },
  },
  warnings: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text' },
    planId: { type: 'text' },
    planName: { type: 'text' },
    owner: { type: 'text' },
    orgUnitId: { type: 'text' },
    level: { type: 'text' },
    color: { type: 'text' },
    reason: { type: 'text' },
    progress: { type: 'int' },
    due: { type: 'text' },
    updatedAt: { type: 'text' },
  },
  rewards: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text' },
    planId: { type: 'text' },
    level: { type: 'text' },
    score: { type: 'int' },
    amount: { type: 'real' },
    type: { type: 'text' },
    by: { type: 'text' },
    note: { type: 'text' },
    at: { type: 'text' },
    ratio: { type: 'real' },
  },
  pushLogs: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text' },
    channel: { type: 'text' },
    title: { type: 'text' },
    content: { type: 'text' },
    toUserIds: { type: 'json' },
    color: { type: 'text' },
    at: { type: 'text' },
    enabled: { type: 'bool' },
  },
  tasks: {
    id: { type: 'text', primary: true },
    teamId: { type: 'text', notNull: true },
    planId: { type: 'text' },
    name: { type: 'text' },
    assignee: { type: 'text' },
    status: { type: 'text' },
    due: { type: 'text' },
    doneAt: { type: 'text' },
  },
};

const INDEXES = [
  { table: 'plans', columns: ['teamId'] },
  { table: 'campaigns', columns: ['teamId'] },
  { table: 'strategies', columns: ['teamId'] },
  { table: 'orgUnits', columns: ['teamId'] },
  { table: 'teamMembers', columns: ['userId'] },
];

// JSON 字段（存储为字符串，读取时反序列化）
const JSON_FIELDS = ['participants', 'toUserIds', 'perms'];
// 布尔字段（TINYINT(1)）
const BOOL_FIELDS = new Set(['enabled']);

function typeSql(def) {
  switch (def.type) {
    case 'int': return 'INT';
    case 'real': return 'DOUBLE';
    case 'bool': return 'TINYINT(1)';
    case 'json': return 'TEXT';
    case 'text':
    default: return 'TEXT';
  }
}

function columnDef(name, def, indexed = false) {
  const parts = [`\`${name}\``];
  // 字符串主键需 VARCHAR（TEXT 不能做主键/索引）
  const shortText = def.type === 'text' && (def.primary || def.unique || indexed || def.default !== undefined);
  parts.push(shortText ? 'VARCHAR(255)' : typeSql(def));
  if (def.notNull) parts.push('NOT NULL');
  if (def.primary) parts.push('NOT NULL', 'PRIMARY KEY');
  if (def.unique) parts.push('UNIQUE');
  if (def.default !== undefined) {
    const d = typeof def.default === 'string' ? `'${def.default.replace(/'/g, "''")}'` : def.default;
    parts.push(`DEFAULT ${d}`);
  }
  return parts.join(' ');
}

// 建表 + 索引（幂等）
export async function init() {
  const conn = await getPool().getConnection();
  try {
    for (const [table, cols] of Object.entries(TABLES)) {
      const composite = cols._pk;
      const defs = Object.entries(cols)
        .filter(([k]) => k !== '_pk')
        .map(([name, def]) => columnDef(name, def,
          composite?.includes(name) || INDEXES.some(idx => idx.table === table && idx.columns.includes(name))));
      if (composite) defs.push(`PRIMARY KEY (${composite.map((c) => `\`${c}\``).join(', ')})`);
      await conn.query(`CREATE TABLE IF NOT EXISTS \`${table}\` (${defs.join(', ')}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    }
    for (const idx of INDEXES) {
      const name = `idx_${idx.table}_${idx.columns.join('_')}`;
      await conn.query(`CREATE INDEX ${name} ON \`${idx.table}\` (${idx.columns.map((c) => `\`${c}\``).join(', ')})`).catch(error => {
        if (error.code !== 'ER_DUP_KEYNAME') throw error;
      });
    }
  } finally {
    conn.release();
  }
}

// ===== 序列化 / 反序列化 =====
function serialize(record) {
  const out = { ...record };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (JSON_FIELDS.includes(k) && v !== undefined && typeof v !== 'string') {
      out[k] = JSON.stringify(v);
    } else if (typeof v === 'boolean') {
      out[k] = v ? 1 : 0;
    } else if (v === undefined) {
      out[k] = null;
    } else if (typeof v === 'object' && v !== null) {
      out[k] = JSON.stringify(v);
    }
  }
  return out;
}

function deserialize(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of JSON_FIELDS) {
    if (out[k] && typeof out[k] === 'string') {
      try { out[k] = JSON.parse(out[k]); } catch { /* keep raw */ }
    }
  }
  for (const k of BOOL_FIELDS) {
    if (out[k] !== undefined && out[k] !== null) out[k] = !!out[k];
  }
  return out;
}

function qid(s) { return `\`${s}\``; }

const _colCache = {};
async function columnsOf(table) {
  if (!_colCache[table]) {
    const [rows] = await getPool().query(`SHOW COLUMNS FROM \`${table}\``);
    _colCache[table] = rows.map((r) => r.Field);
  }
  return _colCache[table];
}
async function filterCols(table, rec) {
  const cols = await columnsOf(table);
  const out = {};
  for (const k of Object.keys(rec)) if (cols.includes(k)) out[k] = rec[k];
  return out;
}

// ===== 兼容 API（全部 async） =====

export async function getMeta(key) {
  const [rows] = await getPool().query(`SELECT value FROM meta WHERE \`key\` = ?`, [key]);
  return rows.length ? rows[0].value : null;
}

export async function setMeta(key, value) {
  await getPool().query(
    `INSERT INTO meta (\`key\`, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [key, String(value)],
  );
}

export async function nextId(prefix = 'id') {
  const cur = Number(await getMeta('seq')) || 10000;
  const nxt = cur + 1;
  await setMeta('seq', nxt);
  return `${prefix}_${nxt}`;
}

export function now() { return new Date().toISOString(); }

export async function insert(name, record) {
  const rec = await filterCols(name, serialize(record));
  const cols = Object.keys(rec);
  const sql = `INSERT INTO ${qid(name)} (${cols.map(qid).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  await getPool().query(sql, cols.map((c) => rec[c]));
  return record;
}

export async function find(name, predicate) {
  const [rows] = await getPool().query(`SELECT * FROM ${qid(name)}`);
  const list = rows.map(deserialize);
  return predicate ? list.filter(predicate) : list;
}

export async function findOne(name, predicate) {
  const list = await find(name, predicate);
  return list[0] || null;
}

export async function update(name, id, patch) {
  const rec = await filterCols(name, serialize({ ...patch, updatedAt: now() }));
  const keys = Object.keys(rec);
  if (!keys.length) return findOne(name, (x) => x.id === id);
  const sql = `UPDATE ${qid(name)} SET ${keys.map((k) => `${qid(k)} = ?`).join(', ')} WHERE id = ?`;
  await getPool().query(sql, [...keys.map((k) => rec[k]), id]);
  return findOne(name, (x) => x.id === id);
}

export async function remove(name, id) {
  await getPool().query(`DELETE FROM ${qid(name)} WHERE id = ?`, [id]);
}

// 覆盖整个集合（seed 初始化 / warnings 重建），事务内执行
export async function updateCollection(name, arr) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM ${qid(name)}`);
    for (const r of arr) {
      const rec = await filterCols(name, serialize(r));
      const cols = Object.keys(rec);
      if (!cols.length) continue;
      const sql = `INSERT INTO ${qid(name)} (${cols.map(qid).join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
      await conn.query(sql, cols.map((c) => rec[c]));
    }
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function all(name) {
  const [rows] = await getPool().query(`SELECT * FROM ${qid(name)}`);
  return rows.map(deserialize);
}

export async function clear(name) {
  await getPool().query(`DELETE FROM ${qid(name)}`);
}

// 事务包装：传入 async fn，返回 async 函数
export function transaction(fn) {
  return async (...args) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(...args);
      await conn.commit();
      return result;
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  };
}

// 暴露底层连接池（供高级查询/迁移）
export function raw() {
  return getPool();
}

// 兼容旧代码占位
export function load() { return {}; }
export function db() { return {}; }
