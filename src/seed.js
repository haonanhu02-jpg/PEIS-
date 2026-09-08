// 数据库初始化种子数据（MySQL）—— 多团队（租户）+ 组织/用户/权限/分级/奖惩
import { all, raw } from './db.js';
import bcrypt from 'bcryptjs';

// 默认团队（工作区/租户）
const TEAMS = [
  { id: 't_1', name: '万盛股份', code: 'wansheng-gufen', desc: '万盛股份集团级项目管理工作区', ownerId: 'u_2', status: 'active', createdAt: '2026-01-01' },
  { id: 't_2', name: '涂料事业部', code: 'coating', desc: '涂料事业部独立工作区', ownerId: 'u_5', status: 'active', createdAt: '2026-01-01' },
];

// 集团总部的职能中心（按用户提供的"部门名称.png"组织结构，共 17 个职能中心 + 1 个集团总部）
const HEADQUARTER_UNITS = [
  { id: 'ou_2',  name: '高管',         type: '职能', members: 23 },
  { id: 'ou_3',  name: '党总支',       type: '党务', members: 2  },
  { id: 'ou_4',  name: '内控中心',     type: '职能', members: 6  },
  { id: 'ou_5',  name: '信披合规中心', type: '职能', members: 6  },
  { id: 'ou_6',  name: '投资中心',     type: '职能', members: 6  },
  { id: 'ou_7',  name: '产品发展中心', type: '职能', members: 21 },
  { id: 'ou_8',  name: '财务中心',     type: '职能', members: 30 },
  { id: 'ou_9',  name: '人力资源中心', type: '职能', members: 12 },
  { id: 'ou_10', name: '企管中心',     type: '职能', members: 19 },
  { id: 'ou_11', name: '数字化中心',   type: '职能', members: 7  },
  { id: 'ou_12', name: '安环中心',     type: '职能', members: 15 },
  { id: 'ou_13', name: '销售中心',     type: '职能', members: 34 },
  { id: 'ou_14', name: '工程中心',     type: '职能', members: 17 },
  { id: 'ou_15', name: '研究院',       type: '职能', members: 49 },
  { id: 'ou_16', name: '市场部',       type: '职能', members: 2  },
  { id: 'ou_17', name: '总裁办公室',   type: '职能', members: 3  },
  { id: 'ou_18', name: '采购中心',     type: '职能', members: 16 },
  { id: 'ou_19', name: '质量中心',     type: '职能', members: 0  },
];

const D = {
  teams: TEAMS,

  // 团队-成员关联（用户可加入多个团队，orgUnitId 为该成员在团队内的组织归属）
  teamMembers: [
    { teamId: 't_1', userId: 'u_1', roleInTeam: '超级管理员', orgUnitId: 'ou_1' },
    { teamId: 't_1', userId: 'u_2', roleInTeam: 'CEO', orgUnitId: 'ou_2' },          // 高管
    { teamId: 't_1', userId: 'u_3', roleInTeam: '产业1号位', orgUnitId: 'ou_17' },   // 总裁办公室
    { teamId: 't_1', userId: 'u_4', roleInTeam: '计划效率部主任', orgUnitId: 'ou_10' }, // 企管中心
    { teamId: 't_1', userId: 'u_6', roleInTeam: '执行成员', orgUnitId: 'ou_18' },    // 采购中心
    { teamId: 't_2', userId: 'u_1', roleInTeam: '超级管理员', orgUnitId: 'ou_20' },
    { teamId: 't_2', userId: 'u_5', roleInTeam: '部门1号位', orgUnitId: 'ou_20' },  // 涂料运营
    { teamId: 't_2', userId: 'u_6', roleInTeam: '执行成员', orgUnitId: 'ou_20' },
  ],

  // 组织单元：集团总部（ou_1 集团）+ 17 个职能中心（ou_2~ou_19）+ 涂料事业部（ou_20~21）
  orgUnits: [
    // 集团总部
    { id: 'ou_1', teamId: 't_1', name: '万盛集团', type: '集团', parentId: null, sort: 0, source: 'OA', members: 249 },
    // 17 个职能中心（按部门名称.png）
    ...HEADQUARTER_UNITS.map((u, i) => ({
      id: u.id, teamId: 't_1', name: u.name, type: u.type, parentId: 'ou_1', sort: i + 1, source: 'OA', members: u.members,
    })),
    // 涂料事业部（独立工作区下的部门树）
    { id: 'ou_20', teamId: 't_2', name: '涂料运营', type: '项目', parentId: null, sort: 0, source: 'OA', members: 3 },
  ],

  // 用户
  users: [
    { id: 'u_1', username: 'admin', name: '系统管理员', role: '超级管理员', orgUnitId: 'ou_1', dingtalkId: 'dd_admin', zixinId: 'zx_admin', oaId: 'OA-0001', status: 'active', hireDate: '2023-01-10', pwd: 'admin123' },
    { id: 'u_2', username: 'ceo', name: '陈总', role: 'CEO', orgUnitId: 'ou_2', dingtalkId: 'dd_ceo', zixinId: 'zx_ceo', oaId: 'OA-0002', status: 'active', hireDate: '2020-03-15', pwd: 'ceo123' },
    { id: 'u_3', username: 'zhangwm', name: '张文明', role: '产业1号位', orgUnitId: 'ou_17', dingtalkId: 'dd_zhang', zixinId: 'zx_zhang', oaId: 'OA-0003', status: 'active', hireDate: '2022-06-20', pwd: '123456' },
    { id: 'u_4', username: 'wangxp', name: '王新平', role: '计划效率部主任', orgUnitId: 'ou_10', dingtalkId: 'dd_wang', zixinId: 'zx_wang', oaId: 'OA-0004', status: 'active', hireDate: '2024-01-08', pwd: '123456' },
    { id: 'u_5', username: 'limf', name: '李明月', role: '涂料事业部1号位', orgUnitId: 'ou_20', dingtalkId: 'dd_li', zixinId: 'zx_li', oaId: 'OA-0005', status: 'active', hireDate: '2026-07-01', pwd: '123456' },
    { id: 'u_6', username: 'zhaoh', name: '赵辉', role: '执行成员', orgUnitId: 'ou_18', dingtalkId: 'dd_zhao', zixinId: 'zx_zhao', oaId: 'OA-0006', status: 'active', hireDate: '2025-09-10', pwd: '123456' },
  ],

  // 角色权限
  roles: [
    { id: 'r_1', name: '超级管理员', perms: ['*'], desc: '系统全部权限' },
    { id: 'r_2', name: 'CEO', perms: ['plan.view', 'plan.edit', 'strategy.view', 'strategy.edit', 'meeting.view', 'meeting.manage', 'reward.view', 'reward.manage', 'dashboard.view', 'org.view', 'report.view', 'team.manage'], desc: '战略/战役/考核决策' },
    { id: 'r_3', name: '计划效率部主任', perms: ['plan.view', 'plan.edit', 'strategy.view', 'meeting.view', 'meeting.manage', 'reward.view', 'org.view', 'dashboard.view', 'report.view'], desc: '规则制定/系统配置/协助实施' },
    { id: 'r_4', name: '产业1号位', perms: ['plan.view', 'plan.edit', 'strategy.view', 'meeting.view', 'reward.view', 'dashboard.view', 'report.view'], desc: '1号位统筹、考核决策' },
    { id: 'r_5', name: '部门1号位', perms: ['plan.view', 'plan.edit', 'meeting.view', 'dashboard.view', 'report.view'], desc: '部门计划与执行' },
    { id: 'r_6', name: '执行成员', perms: ['plan.view', 'plan.edit_self', 'meeting.view', 'dashboard.view'], desc: '本人任务更新' },
  ],

  // 计划分级标准
  planLevels: [
    { id: 'pl_1', level: '里程碑', score: 5, rewardMin: 5000, rewardMax: 30000, decision: 'CEO', desc: '战略级重大事项·最高决策层关注（重大签约/项目筹开/业务战略）' },
    { id: 'pl_2', level: '1级', score: 4, rewardMin: 3000, rewardMax: 6000, decision: 'CEO', desc: '产业1号位或总部部门负责人直接主责、向最高决策层汇报、对年度目标有重要影响' },
    { id: 'pl_3', level: '2级', score: 3, rewardMin: 2000, rewardMax: 4000, decision: '产业1号位/CEO', desc: '里程碑和1级计划的分解、需跨部门协调的重要任务' },
    { id: 'pl_4', level: '3级', score: 2, rewardMin: 2000, rewardMax: 4000, decision: '产业1号位/CHO', desc: '执行层面任务、双周/月度可完成的操作性事项' },
    { id: 'pl_5', level: '4级', score: 1, rewardMin: 2000, rewardMax: 4000, decision: '产业1号位/部门1号位', desc: '日常执行事项、单周可完成的支撑性任务' },
  ],

  // 责任工单比例
  responsibilityRules: [
    { id: 'rr_1', role: '1号位责任人', ratio: 1.0, note: '无协办人时100%担责' },
    { id: 'rr_2', role: '非1号位责任人', ratio: 0.5, note: '有协办人时50%担责' },
    { id: 'rr_3', role: '协办人', ratio: 0.3, note: '协办人30%担责' },
    { id: 'rr_4', role: '上级', ratio: 0.2, note: '上级连带20%' },
    { id: 'rr_5', role: '新入职豁免', ratio: 0.0, note: '新入职人员2-3个月适应豁免期' },
  ],

  // 预警规则
  warnRules: [
    { id: 'w_1', color: 'green', name: '绿灯·正常', desc: '进度达标，无风险', threshold: '完成率>=100% 或 未到期' },
    { id: 'w_2', color: 'yellow', name: '黄灯·预警', desc: '进度滞后，存在风险，需关注', threshold: '完成率<80% 且 距截止<=7天' },
    { id: 'w_3', color: 'red', name: '红灯·警示', desc: '已逾期/严重滞后，需立即协调', threshold: '已逾期 或 完成率<50%' },
  ],

  // 会议机制（挂团队）
  meetings: [
    { id: 'm_1', teamId: 't_1', name: '战役专项会', level: '董事长层级', frequency: '月/季度', cadence: 'quarterly', desc: '战役专项会', owner: 'u_2' },
    { id: 'm_2', teamId: 't_1', name: '战役例会', level: 'CEO层级', frequency: '双周/月度', cadence: 'biweekly', desc: '纳入EMC', owner: 'u_2' },
    { id: 'm_3', teamId: 't_1', name: '内部例会', level: '战役层级', frequency: '周', cadence: 'weekly', desc: '战役内部例会', owner: 'u_3' },
    { id: 'm_4', teamId: 't_2', name: '涂料事业部周会', level: '战役层级', frequency: '周', cadence: 'weekly', desc: '事业部内部例会', owner: 'u_5' },
  ],

  // 周期节奏（全局共享）
  cycles: [
    { id: 'c_1', period: '日', cadence: 'daily', content: '当日到期节点及任务反馈' },
    { id: 'c_2', period: '周/双周', cadence: 'weekly', content: '当周到期节点汇总、风险提示' },
    { id: 'c_3', period: '月', cadence: 'monthly', content: '考核完成率排名、奖惩实施' },
    { id: 'c_4', period: '季', cadence: 'quarterly', content: '经验分享、交流提升、人才盘点' },
    { id: 'c_5', period: '年', cadence: 'yearly', content: '结果应用于评奖评优等' },
  ],

  // 战略规划（挂团队，按集团层级/事业部层级）
  strategies: [
    { id: 's_1', teamId: 't_1', title: '万盛股份2026战略规划', commercialMode: '重资产+轻资产双轮驱动', coreAbility: '核心能力复制+数智化运营', strategicTradeoff: '聚焦核心产业与CM，收缩低效项目', status: '执行中', orgUnitId: 'ou_1', owner: 'u_2', createdAt: '2026-01-10', progress: 80 },
    { id: 's_2', teamId: 't_2', title: '涂料事业部2026经营战略', commercialMode: '涂料产品高端化+定制化', coreAbility: '配方研发+客户定制能力', strategicTradeoff: '聚焦高端涂料赛道，收缩低毛利产品', status: '执行中', orgUnitId: 'ou_20', owner: 'u_5', createdAt: '2026-02-01', progress: 70 },
  ],

  // 战役（挂团队）
  campaigns: [
    { id: 'cm_1', teamId: 't_1', name: '经营提效战役', strategyId: 's_1', orgUnitId: 'ou_1', chief: 'u_3', commander: 'u_3', period: '2026全年', status: '进行中', desc: '明确降本方案', progress: 88 },
    { id: 'cm_2', teamId: 't_1', name: '营销一体化战役', strategyId: 's_1', orgUnitId: 'ou_1', chief: 'u_3', commander: 'u_4', period: '2026上半年', status: '进行中', desc: '国内会员拉新、销售', progress: 76 },
    { id: 'cm_3', teamId: 't_1', name: 'AI+数字化战役', strategyId: 's_1', orgUnitId: 'ou_11', chief: 'u_4', commander: 'u_4', period: '2026', status: '进行中', desc: '国内营销数据中台', progress: 65 },
    { id: 'cm_4', teamId: 't_2', name: '旺季交付保障战役', strategyId: 's_2', orgUnitId: 'ou_20', chief: 'u_5', commander: 'u_5', period: '2026下半年', status: '进行中', desc: '客户订单按时保质交付', progress: 82 },
  ],

  // 战役计划（挂团队，按战役对应部门）
  plans: [
    { id: 'p_1', teamId: 't_1', name: '明确降本方案落地', campaignId: 'cm_1', orgUnitId: 'ou_10', level: '1级', score: 4, owner: 'u_3', participants: ['u_4'], progress: 92, due: '2026-09-30', status: '执行中', updatedAt: '2026-08-28', category: '经营提效' },
    { id: 'p_2', teamId: 't_1', name: '全球线下零售收入2.07亿', campaignId: 'cm_2', orgUnitId: 'ou_13', level: '2级', score: 3, owner: 'u_4', participants: ['u_6'], progress: 70, due: '2026-12-31', status: '执行中', updatedAt: '2026-08-25', category: '营销一体化' },
    { id: 'p_3', teamId: 't_1', name: '高端新品客房出街提前32天', campaignId: 'cm_1', orgUnitId: 'ou_7', level: '3级', score: 2, owner: 'u_5', participants: ['u_6'], progress: 45, due: '2026-09-15', status: '执行中', updatedAt: '2026-09-01', category: '经营提效' },
    { id: 'p_4', teamId: 't_1', name: '国内营销数据中台使用', campaignId: 'cm_3', orgUnitId: 'ou_11', level: '1级', score: 4, owner: 'u_4', participants: ['u_3'], progress: 60, due: '2026-10-30', status: '执行中', updatedAt: '2026-08-30', category: 'AI+数字化' },
    { id: 'p_5', teamId: 't_1', name: '核心岗位到位率96%', campaignId: 'cm_1', orgUnitId: 'ou_9', level: '2级', score: 3, owner: 'u_4', participants: [], progress: 96, due: '2026-08-31', status: '已完成', updatedAt: '2026-08-20', category: '组织人才' },
    { id: 'p_6', teamId: 't_1', name: '重大客户合作签约3+2个', campaignId: 'cm_2', orgUnitId: 'ou_6', level: '里程碑', score: 5, owner: 'u_2', participants: ['u_3'], progress: 55, due: '2026-12-31', status: '执行中', updatedAt: '2026-08-29', category: '投融增长' },
    { id: 'p_7', teamId: 't_2', name: '涂料订单交付验收', campaignId: 'cm_4', orgUnitId: 'ou_20', level: '2级', score: 3, owner: 'u_5', participants: ['u_6'], progress: 85, due: '2026-09-10', status: '执行中', updatedAt: '2026-08-28', category: '交付保障' },
  ],

  // 进度更新记录
  progressLogs: [
    { id: 'plg_1', teamId: 't_1', planId: 'p_1', by: 'u_3', progress: 92, note: '降本方案已落地3项', at: '2026-08-28' },
    { id: 'plg_2', teamId: 't_1', planId: 'p_3', by: 'u_5', progress: 45, note: '出街延期，资源协调中', at: '2026-09-01' },
  ],

  warnings: [],
  rewards: [
    { id: 'rw_1', teamId: 't_1', planId: 'p_5', level: '2级', score: 3, amount: 3000, type: '激励', by: 'u_2', note: '完成率100%，按期达成', at: '2026-08-20', ratio: 1.0 },
    { id: 'rw_2', teamId: 't_1', planId: 'p_3', level: '3级', score: 2, amount: -500, type: '处罚', by: 'u_3', note: '进度滞后红灯', at: '2026-09-01', ratio: 0.5 },
  ],
  pushLogs: [],
  tasks: [],
};

export async function seedIfEmpty() {
  // 判断是否已初始化（用 teams 表是否有数据）
  if ((await all('teams')).length > 0) return;
  const conn = await raw().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("INSERT INTO meta (`key`, value) VALUES ('seq', '10000') ON DUPLICATE KEY UPDATE value = '10000'");
    for (const [name, arr] of Object.entries(D)) {
      for (const source of arr) {
        const row = { ...source };
        if (name === 'users') row.pwd = await bcrypt.hash(row.pwd, 12);
        const columns = Object.keys(row);
        const values = columns.map(key => row[key] !== null && typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key]);
        await conn.query(`INSERT INTO \`${name}\` (${columns.map(key => `\`${key}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, values);
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

const SCREENSHOT_CAMPAIGNS = [
  { id: 'cm_2025_1', teamId: 't_1', orgUnitId: 'ou_1', strategyId: 's_1', name: '潍坊产能释放及发展规划', chiefName: '曹海宾', status: '进行中' },
  { id: 'cm_2025_2', teamId: 't_1', orgUnitId: 'ou_1', strategyId: 's_1', name: '新项目全生命周期管理体系建设及业务规模突破（落地）', chiefName: '成耿宇/李旭锋', status: '进行中' },
  { id: 'cm_2025_3', teamId: 't_1', orgUnitId: 'ou_1', strategyId: 's_1', name: '销售目标达成（预算+存量），及技术支持与服务保障', chiefName: '高正炎', status: '进行中' },
  { id: 'cm_2025_4', teamId: 't_1', orgUnitId: 'ou_1', strategyId: 's_1', name: '泰国基地建设与运营', chiefName: '海金春', status: '进行中',
    desc: '战役总目标：完成工程建设，实现投产运营；衡量指标：6.10日前投产；完成TCPP/TDCP XX吨生产目标；实现XX万人民币的利润。' },
  { id: 'cm_2025_5', teamId: 't_1', orgUnitId: 'ou_1', strategyId: 's_1', name: '极致成本管理', chiefName: '王新军', status: '进行中' },
  { id: 'cm_2025_6', teamId: 't_1', orgUnitId: 'ou_1', strategyId: 's_1', name: '人才梯队建设与培养', chiefName: '张婷', status: '进行中' },
];

const SCREENSHOT_PLANS = [
  ['完成建设工程', '1、加快推进项目建设；2、完成“三查四定”', '“三查四定”及项目中交', '组织“三查四定”', '2026-03-31', '欧阳春'],
  ['申报建筑和消防验收', '建筑和消防报验', '建筑和消防验收批复', '取得建筑验收批复、消防检测报告', '2026-04-30', '欧阳春'],
  ['原辅料进场', 'PO（ECH）及其它原辅料进厂', '三氯氧磷卸车；环氧丙烷卸车；三氯化铝到厂。', '三氯氧磷卸车；环氧丙烷卸车；三氯化铝到厂。', '2026-05-10', '包晓敏'],
  ['工厂相关资质办理', '1、编制风险评估报告；2、办理三氯氧磷《使用武器许可证》；3、申请试生产；4、申请OPERATION。', '三氯氧磷《使用武器许可证》和试生产批复', '取得三氯氧磷《使用武器许可证》（YP2）；取得试生产批复；取得OPERATION证书。', '2026-06-10', '郭宏'],
  ['产量目标', '实现TCPP/TDCP XX万吨的生产任务', '6.10前投料试车；出合格产品', '6.10前投料试车成功', '2026-12-31', '应有龙'],
  ['利润目标', '1、实现XX万吨的销售；2、实现XX万的利润', '1、实现XX万吨的销售；2、实现XX万的利润', '第一批成品出厂', '2026-12-31', '李吉'],
].map((row, index) => ({
  id: `p_2025_${index + 1}`, teamId: 't_1', campaignId: 'cm_2025_4', campaignName: '泰国基地建设与运营',
  subCampaign: row[0], name: row[1], metric: row[2], milestone: row[3], due: row[4], ownerName: row[5],
  collector: row[5], subCampaignOwner: row[5], orgUnitId: 'ou_1', level: '2级', score: 3,
  participants: [], progress: 0, status: '执行中', category: '泰国基地建设与运营', createdAt: '2026-01-01', updatedAt: '2026-01-01',
}));

// One-time content migration based only on the supplied screenshots.
export async function migrateScreenshotContent() {
  const version = 'screenshot-template-v3';
  const [done] = await raw().query('SELECT value FROM meta WHERE `key` = ?', ['contentVersion']);
  if (done[0]?.value === version) return;
  const conn = await raw().getConnection();
  const insertRows = async (table, rows) => {
    for (const source of rows) {
      const row = { ...source };
      for (const key of ['participants', 'allocations']) if (Array.isArray(row[key])) row[key] = JSON.stringify(row[key]);
      const columns = Object.keys(row);
      await conn.query(`INSERT INTO \`${table}\` (${columns.map(key => `\`${key}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map(key => row[key]));
    }
  };
  try {
    await conn.beginTransaction();
    const [oldPlans] = await conn.query("SELECT id FROM plans WHERE teamId = 't_1'");
    const oldIds = oldPlans.map(row => row.id);
    if (oldIds.length) {
      const placeholders = oldIds.map(() => '?').join(',');
      for (const table of ['progressLogs', 'warnings', 'rewards', 'tasks', 'responsibilityOrders']) {
        await conn.query(`DELETE FROM \`${table}\` WHERE planId IN (${placeholders})`, oldIds);
      }
    }
    await conn.query("DELETE FROM pushLogs WHERE teamId = 't_1'");
    await conn.query("DELETE FROM plans WHERE teamId = 't_1'");
    await conn.query("DELETE FROM campaigns WHERE teamId = 't_1'");
    await insertRows('campaigns', SCREENSHOT_CAMPAIGNS);
    await insertRows('plans', SCREENSHOT_PLANS);
    await conn.query("INSERT INTO meta (`key`, value) VALUES ('contentVersion', ?) ON DUPLICATE KEY UPDATE value = VALUES(value)", [version]);
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
