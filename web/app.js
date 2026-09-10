// PEIS 项目管理系统 - 前端 SPA（hash 路由，Teambition 风格）
(function () {
  'use strict';

  const API = '/api';
  let token = localStorage.getItem('peis_token') || '';
  let me = null;
  let teams = [];
  let activeTeamId = localStorage.getItem('peis_team') || '';
  let cache = { orgUnits: [], levels: [], campaigns: [], plans: [] };
  const routePerms = { strategies: 'strategy.view', campaigns: 'strategy.view', meetings: 'meeting.view', rewards: 'reward.view', org: 'org.view' };
  function allowed(perm) { return !perm || me?.permissions?.includes('*') || me?.permissions?.includes(perm); }

  // ===== HTTP =====
  async function req(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (activeTeamId) opts.headers['X-Team-Id'] = activeTeamId;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API + url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.msg || '请求失败');
    return data.data;
  }

  function toast(msg, color) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.borderLeftColor = color === 'red' ? '#f5222d' : '#00b382';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ===== 登录 =====
  function renderLogin() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-logo"><img class="company-logo" src="/assets/wansheng-logo.png" alt="万盛股份" />
            <h1>PEIS <span class="peis">项目管理系统</span></h1>
            <div class="sub">万盛股份 · 计划效率 Implementation System</div>
          </div>
          <div class="login-form">
            <div class="field"><label>账号</label><input id="lg-user" placeholder="请输入账号" value="admin" /></div>
            <div class="field"><label>密码</label><input id="lg-pass" type="password" placeholder="请输入密码" value="admin123" /></div>
            <button class="btn-primary" onclick="window.__login()">登 录</button>
          </div>
          <div class="login-divider">或通过企业账号登录</div>
          <div class="sso-row">
            <button class="sso-btn" onclick="window.__oaSso()">OA 单点登录</button>
            <button class="sso-btn dd" onclick="window.__pushOpen('dingtalk')">钉钉打开</button>
            <button class="sso-btn zx" onclick="window.__pushOpen('zixin')">致信打开</button>
          </div>
          <div class="login-tip">
            演示账号：<b>admin/admin123</b>（超级管理员）<br />
            <b>ceo/ceo123</b> · <b>zhangwm/123456</b> · <b>limf/123456</b>
          </div>
        </div>
      </div>`;
    window.__login = async () => {
      const username = document.getElementById('lg-user').value.trim();
      const password = document.getElementById('lg-pass').value.trim();
      try {
        const d = await req('POST', '/auth/login', { username, password });
        token = d.token; me = d.user; teams = d.teams || [];
        activeTeamId = teams[0] ? teams[0].id : '';
        localStorage.setItem('peis_token', token);
        localStorage.setItem('peis_team', activeTeamId);
        location.hash = '#/dashboard';
      } catch (e) { toast('登录失败：' + e.message, 'red'); }
    };
    window.__oaSso = async () => {
      try {
        const d = await req('POST', '/auth/oa-sso', { oaToken: 'demo-oa-token', oaId: 'OA-0001', username: 'admin' });
        token = d.token; me = d.user; teams = d.teams || [];
        activeTeamId = teams[0] ? teams[0].id : '';
        localStorage.setItem('peis_token', token);
        localStorage.setItem('peis_team', activeTeamId);
        toast('OA 单点登录成功'); location.hash = '#/dashboard';
      } catch (e) { toast('OA 登录失败：' + e.message, 'red'); }
    };
    window.__pushOpen = async (ch) => {
      try {
        const id = ch === 'dingtalk' ? { dingtalkId: 'dd_admin', channelId: 'dingtalk' } : { zixinId: 'zx_admin', channelId: 'zixin' };
        const d = await req('POST', '/auth/push-open', { ...id, pushToken: 'demo' });
        token = d.token; me = d.user; teams = d.teams || [];
        activeTeamId = teams[0] ? teams[0].id : '';
        localStorage.setItem('peis_token', token);
        localStorage.setItem('peis_team', activeTeamId);
        toast('从' + (ch === 'dingtalk' ? '钉钉' : '致信') + '消息打开成功'); location.hash = '#/dashboard';
      } catch (e) { toast('打开失败：' + e.message, 'red'); }
    };
  }

  // ===== 主框架 =====
  function renderLayout(content) {
    const app = document.getElementById('app');
    const nav = [
      { group: '驾驶舱', items: [{ id: 'dashboard', ico: '📊', label: '数据看板' }] },
      { group: '目标制定', items: [
        { id: 'strategies', ico: '🎯', label: '集团战略规划' },
        { id: 'campaigns', ico: '⚔️', label: '战略解码-必胜战役' },
        { id: 'plans', ico: '📋', label: '分解战役-行动计划' },
        { id: 'board', ico: '🗂️', label: '看板视图' },
      ] },
      { group: '会议与周期', items: [
        { id: 'meetings', ico: '📅', label: '会议机制' },
        { id: 'cycles', ico: '🔁', label: '运行节奏' },
        { id: 'push-details', ico: '📨', label: '推送详情' },
      ] },
      { group: '考核与组织', items: [
        { id: 'rewards', ico: '🏆', label: '奖惩考核' },
        { id: 'warnings', ico: '🚨', label: '预警中心' },
        { id: 'org', ico: '🏢', label: '组织权限' },
      ] },
    ];
    const navHtml = nav.map((g) => `<div class="nav-group">${g.group}</div>` + g.items.filter(it => allowed(routePerms[it.id])).map((it) =>
      `<div class="nav-item" data-route="${it.id}" onclick="window.__go('${it.id}')"><span class="ico">${it.ico}</span>${it.label}</div>`
    ).join('')).join('');
    app.innerHTML = `
      <div class="layout">
        <aside class="sidebar">
          <div class="sidebar-brand"><img src="/assets/wansheng-logo.png" alt="万盛股份" /><span>PEIS 管理平台</span></div>
          ${teams.length > 1 ? `<div class="team-switch">
            <label>当前团队</label>
            <select id="team-select" onchange="window.__switchTeam(this.value)">${teams.map((t) => `<option value="${t.id}" ${t.id === activeTeamId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
          </div>` : ''}
          <nav class="nav">${navHtml}</nav>
          <div class="sidebar-foot">
            <div class="user"><span class="avatar">${esc((me && me.name || 'U')[0])}</span>${esc(me ? me.name : '')}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span>${esc(me ? me.role : '')}</span>
              <a href="#" onclick="window.__logout();return false;" style="font-size:12px;">退出</a>
            </div>
          </div>
        </aside>
        <div class="main">
          <div class="topbar"><h2 id="page-title"></h2><span class="spacer"></span><span class="chip" id="page-chip"></span></div>
          <div class="content" id="page-body"></div>
        </div>
      </div>`;
    window.__go = (r) => { location.hash = '#/' + r; };
    window.__logout = () => { token = ''; me = null; teams = []; activeTeamId = ''; localStorage.removeItem('peis_token'); localStorage.removeItem('peis_team'); location.hash = '#/login'; };
    window.__switchTeam = (id) => {
      activeTeamId = id;
      localStorage.setItem('peis_team', id);
      location.reload();
    };
  }

  function setPage(title, chip) {
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-chip').textContent = chip || '';
  }
  function activeNav(route) {
    document.querySelectorAll('.nav-item').forEach((n) => {
      n.classList.toggle('active', n.dataset.route === route);
    });
  }

  // ===== 工具函数 =====
  function lightTag(p) {
    const c = p._light || 'green';
    const map = { green: '<span class="tag green">● 绿灯</span>', yellow: '<span class="tag yellow">● 黄灯</span>', red: '<span class="tag red">● 红灯</span>' };
    return map[c] || map.green;
  }

  function lightControl(plan) {
    const map = { red: '红灯', yellow: '黄灯', green: '绿灯' };
    const keys = ['red', 'yellow', 'green'];
    const current = plan._light || 'green';
    if (!allowed('plan.edit')) return lightTag(plan);
    return `<select class="light-select" aria-label="${esc(plan.name)}亮灯情况" onchange="window.__setPlanLight('${plan.id}', this.value)">
      ${keys.map(k => `<option value="${k}" ${current === k ? 'selected' : ''}>${map[k]}</option>`).join('')}
    </select>`;
  }
  function progressBar(p) {
    const done = Number(p.progress) >= 100 || p.status === '已完成';
    return `<div class="trend"><div class="progress ${done ? 'done' : ''}"><i style="width:${Math.min(100, Number(p.progress) || 0)}%"></i></div><span style="font-size:12px;color:#4a4a4a;">${p.progress || 0}%</span></div>`;
  }
  function unitName(id) {
    const u = cache.orgUnits.find((x) => x.id === id);
    return u ? u.name : id;
  }
  function levelScore(level) {
    const l = cache.levels.find((x) => x.level === level);
    return l ? l.score : '';
  }

  async function ensureMeta() {
    try {
      const o = await req('GET', '/context');
      cache.orgUnits = o.orgUnits || [];
      usersCache = o.users || [];
    } catch (e) {}
    try {
      const s = await req('GET', '/reward-standards');
      cache.levels = s.levels || [];
    } catch (e) {}
  }

  // ===== 各页面 =====
  async function pageDashboard() {
    setPage('数据看板', '驾驶舱');
    activeNav('dashboard');
    const d = await req('GET', '/dashboard');
    const body = document.getElementById('page-body');
    const maxScore = Math.max(1, ...(d.scoreRanking || []).map((r) => r.totalScore));
    body.innerHTML = `
      <div class="cards" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
        <div class="card"><h3>总计划量</h3><div class="num">${d.total}</div><div class="sub">已纳入PEIS的计划</div></div>
        <div class="card"><h3>整体完成率</h3><div class="num green">${d.completionRate}%</div><div class="sub">已完成 ${d.completed} 项</div></div>
        <div class="card"><h3>平均进度</h3><div class="num">${d.avgProgress}%</div><div class="sub">人为定期更新汇总</div></div>
        <div class="card"><h3>红黄灯</h3><div class="num" style="display:flex;gap:8px;align-items:center;"><span style="color:var(--red);font-size:24px;">${d.lights.red}</span><span style="color:var(--yellow);font-size:24px;">${d.lights.yellow}</span><span style="color:var(--green);font-size:24px;">${d.lights.green}</span></div><div class="sub">红/黄/绿 实时预警</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div class="section-title">完成率排名 <span class="line"></span></div>
          <table><thead><tr><th>#</th><th>负责人</th><th>完成率</th><th>平均进度</th></tr></thead><tbody>
            ${d.ranking.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.completionRate}%</td><td>${progressHtml(r.avgProgress)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">暂无数据</td></tr>'}
          </tbody></table>
        </div>
        <div>
          <div class="section-title">分值排名 <span class="line"></span></div>
          <table><thead><tr><th>#</th><th>总战役</th><th>总得分</th><th>计划数</th></tr></thead><tbody>
            ${(d.scoreRanking || []).map((r, i) => `<tr>
              <td>${i + 1}</td>
              <td>${esc(r.name)}</td>
              <td title="${esc((r.detail || []).join('；'))}">
                <div style="display:flex;align-items:center;gap:8px;">
                  <div class="trend" style="flex:1;"><div class="progress"><i style="width:${Math.round((r.totalScore / maxScore) * 100)}%"></i></div></div>
                  <span class="tag blue" style="min-width:56px;text-align:center;">${r.totalScore} 分</span>
                </div>
              </td>
              <td>${r.planCount}</td>
            </tr>`).join('') || '<tr><td colspan="4" class="empty">暂无数据</td></tr>'}
          </tbody></table>
          <div class="field-tip">每个总战役满分 100；计划权重 = 该等级标准分 ÷ 本总战役标准分总和 × 100；子得分 = 计划权重 × 完成度（悬停得分可看明细）</div>
        </div>
      </div>
      <div style="margin-top:20px;">
        <div class="section-title">预警清单 <span class="line"></span></div>
        <table><thead><tr><th>计划</th><th>级别</th><th>进度</th><th>状态</th><th>原因</th></tr></thead><tbody>
          ${d.warnings.map((w) => `<tr><td>${esc(w.planName)}</td><td><span class="tag blue">${esc(w.level)}</span></td><td>${w.progress}%</td><td>${lightTag({ _light: w.color })}</td><td style="font-size:12px;color:#8a8f99;">${esc(w.reason)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">当前无预警 🎉</td></tr>'}
        </tbody></table>
      </div>`;
    function progressHtml(v) { return `<div class="trend"><div class="progress"><i style="width:${v}%"></i></div></div>`; }
  }

  async function pageStrategies() {
    setPage('集团战略规划 · 定方向', '商业模式 / 核心能力 / 战略取舍');
    activeNav('strategies');
    const list = await req('GET', '/strategies');
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="section-title">集团战略规划 <span class="line"></span> <button class="btn p sm" onclick="window.__newStrategy()">+ 新建战略</button></div>
      <div class="cards">
        ${list.map((s) => `<div class="card">
          <h3 style="font-size:15px;color:var(--gray-900);font-weight:600;">${esc(s.title)}</h3>
          <div style="margin-top:12px;font-size:13px;color:var(--gray-700);line-height:1.9;">
            <div><b>商业模式：</b>${esc(s.commercialMode)}</div>
            <div><b>核心能力：</b>${esc(s.coreAbility)}</div>
            <div><b>战略取舍：</b>${esc(s.strategicTradeoff)}</div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
            <span class="tag blue">${esc(s.status)}</span>${progressBar(s)}
          </div>
        </div>`).join('') || '<div class="empty" style="grid-column:1/-1;">暂无战略，点击右上角新建</div>'}
      </div>`;
    window.__newStrategy = () => showStrategyModal();
  }

  function showStrategyModal() {
    showModal('新建战略规划', `
      <div class="form">
        <div class="full"><label>战略名称</label><input id="f-title" /></div>
        <div><label>商业模式</label><input id="f-mode" placeholder="如：双轮驱动" /></div>
        <div><label>核心能力</label><input id="f-ability" /></div>
        <div class="full"><label>战略取舍</label><input id="f-tradeoff" /></div>
        <div class="full"><label>所属组织</label><select id="f-org">${cache.orgUnits.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
        <div class="actions"><button class="btn p" onclick="window.__saveStrategy()">保存</button><button class="btn g" onclick="window.__closeModal()">取消</button></div>
      </div>`);
    window.__saveStrategy = async () => {
      try {
        await req('POST', '/strategies', {
          title: document.getElementById('f-title').value,
          commercialMode: document.getElementById('f-mode').value,
          coreAbility: document.getElementById('f-ability').value,
          strategicTradeoff: document.getElementById('f-tradeoff').value,
          orgUnitId: document.getElementById('f-org').value,
        });
        closeModal(); toast('战略已创建'); pageStrategies();
      } catch (e) { toast(e.message, 'red'); }
    };
  }

  async function pageCampaigns() {
    setPage('战略解码-必胜战役', '必胜战役 / 责任人');
    activeNav('campaigns');
    const list = await req('GET', '/campaigns');
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="section-title">战役清单 <span class="line"></span> <button class="btn p sm" onclick="window.__newCampaign()">+ 新建战役</button></div>
      <div class="cards">
        ${list.map((c) => `<div class="card">
          <h3 style="font-size:15px;color:var(--gray-900);font-weight:600;">${esc(c.name)}</h3>
          <div style="margin-top:10px;font-size:13px;color:var(--gray-700);line-height:1.9;">
            <div><b>责任人：</b>${esc(c.chiefName || userName(c.chief))}</div>
            <div><b>班子：</b>${esc(userName(c.commander))}</div>
            <div><b>周期：</b>${esc(c.period)}</div>
            <div><b>说明：</b>${esc(c.desc)}</div>
          </div>
          <div style="margin-top:12px;display:flex;gap:8px;align-items:center;"><span class="tag blue">${esc(c.status)}</span>${progressBar(c)}</div>
        </div>`).join('') || '<div class="empty" style="grid-column:1/-1;">暂无战役</div>'}
      </div>`;
    window.__newCampaign = () => showCampaignModal();
  }

  function showCampaignModal() {
    showModal('新建战役', `
      <div class="form">
        <div class="full"><label>战役名称</label><input id="f-name" /></div>
        <div><label>主将</label><select id="f-chief">${userOptions()}</select></div>
        <div><label>班子（战将）</label><select id="f-cmd">${userOptions()}</select></div>
        <div><label>周期</label><input id="f-period" placeholder="2026全年" /></div>
        <div><label>所属组织</label><select id="f-org">${cache.orgUnits.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
        <div class="full"><label>说明</label><input id="f-desc" /></div>
        <div class="actions"><button class="btn p" onclick="window.__saveCampaign()">保存</button><button class="btn g" onclick="window.__closeModal()">取消</button></div>
      </div>`);
    window.__saveCampaign = async () => {
      try {
        await req('POST', '/campaigns', {
          name: document.getElementById('f-name').value,
          chief: document.getElementById('f-chief').value,
          commander: document.getElementById('f-cmd').value,
          period: document.getElementById('f-period').value,
          orgUnitId: document.getElementById('f-org').value,
          desc: document.getElementById('f-desc').value,
        });
        closeModal(); toast('战役已创建'); pageCampaigns();
      } catch (e) { toast(e.message, 'red'); }
    };
  }

  async function pagePlans() {
    setPage('分解战役-行动计划', '行动计划 / 衡量指标 / 里程碑事件');
    activeNav('plans');
    const [plans, campaigns] = await Promise.all([req('GET', '/plans'), req('GET', '/campaign-options')]);
    cache.campaigns = campaigns;
    cache.plans = plans;
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="filters">
        <select id="fl-campaign" onchange="window.__filterPlans()"><option value="">全部必胜战役</option>${campaigns.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
        <select id="fl-status" onchange="window.__filterPlans()"><option value="">全部状态</option><option>执行中</option><option>已完成</option></select>
        <select id="fl-mine" onchange="window.__filterPlans()"><option value="">全部负责人</option><option value="1">我的计划</option></select>
        <button class="btn p sm" style="margin-left:auto;" onclick="window.__newPlan()">+ 新建行动计划</button>
      </div>
      <div class="table-scroll"><table class="wide-table"><thead><tr><th>必胜战役</th><th>分解战役</th><th>行动计划</th><th>计划分级</th><th>衡量指标</th><th>里程碑事件</th><th>计划完成时间</th><th>实际完成时间</th><th>子得分</th><th>负责人</th><th>完成度</th><th>完成状态</th><th>亮灯情况</th><th>操作</th></tr></thead>
      <tbody id="plan-tbody">${renderPlanRows(plans)}</tbody></table></div>`;
    window.__filterPlans = async () => {
      const campaignId = document.getElementById('fl-campaign').value;
      const status = document.getElementById('fl-status').value;
      const mine = document.getElementById('fl-mine').value;
      const qs = new URLSearchParams();
      if (campaignId) qs.set('campaignId', campaignId);
      if (status) qs.set('status', status);
      if (mine) qs.set('mine', mine);
      const list = await req('GET', '/plans?' + qs); cache.plans = list;
      document.getElementById('plan-tbody').innerHTML = renderPlanRows(list);
    };
    window.__newPlan = () => showPlanModal();
    window.__editPlan = (id) => {
      const plan = cache.plans.find(p => p.id === id);
      if (!plan) return toast('未找到该行动计划', 'red');
      showPlanModal(plan);
    };
    window.__deletePlan = async (id) => {
      const plan = cache.plans.find(p => p.id === id);
      if (!plan) return toast('未找到该行动计划', 'red');
      if (!confirm(`确定删除行动计划「${plan.name}」吗？删除后不可恢复。`)) return;
      try {
        await req('DELETE', `/plans/${id}`);
        toast('行动计划已删除'); pagePlans();
      } catch (e) { toast(e.message, 'red'); }
    };
    window.__updProgress = (id) => showProgressModal(id);
    window.__setPlanLevel = async (id, level) => {
      if (!level) return;
      try {
        await req('PUT', `/plans/${id}`, { level, score: levelScore(level) });
        toast('计划分级已保存'); pagePlans();
      } catch (e) { toast(e.message, 'red'); pagePlans(); }
    };
    window.__setPlanLight = async (id, light) => {
      const labels = { red: '红灯', yellow: '黄灯', green: '绿灯' };
      try {
        await req('PUT', `/plans/${id}`, { _light: light, _lightReason: '手动设置', _lightManual: true });
        toast(`已设为${labels[light]}`); pagePlans();
      } catch (e) { toast(e.message, 'red'); pagePlans(); }
    };
  }

  function campaignName(p) {
    return p.campaignName || cache.campaigns.find(c => c.id === p.campaignId)?.name || '-';
  }

  function renderPlanRows(plans) {
    if (!plans.length) return '<tr><td colspan="14" class="empty">暂无行动计划</td></tr>';
    return plans.map((p) => `<tr>
      <td style="font-weight:600;min-width:180px;">${esc(campaignName(p))}</td>
      <td style="min-width:145px;">${esc(p.subCampaign || p.name)}</td>
      <td style="min-width:230px;">${esc(p.name)}</td>
      <td>${planLevelControl(p)}</td>
      <td style="min-width:200px;">${esc(p.metric || '-')}</td>
      <td style="min-width:220px;">${esc(p.milestone || '-')}</td>
      <td>${esc(p.due || '-')}</td><td>${esc(p.completedAt || '-')}</td>
      <td title="权重 ${p.weightedScore || 0} 分 × 完成度 ${Number(p.progress) || 0}%"><span class="tag blue">${Number(p.subScore || 0).toFixed(2)} 分</span></td>
      <td>${esc(p.ownerName || userName(p.owner))}</td>
      <td>${progressBar(p)}</td><td>${completionTag(p)}</td><td>${lightControl(p)}</td>
      <td>
        <button class="btn g sm" onclick="window.__updProgress('${p.id}')">更新进度</button>
        ${allowed('plan.edit') ? `<button class="btn p sm" onclick="window.__editPlan('${p.id}')">修改</button><button class="btn r sm" onclick="window.__deletePlan('${p.id}')">删除</button>` : ''}
      </td>
    </tr>`).join('');
  }

  function planLevelLabel(level) {
    return ['里程碑计划', '1级计划', '2级计划', '3级计划', '4级计划'].includes(level) ? level : '未分级';
  }

  function planLevelControl(plan) {
    const levels = ['里程碑计划', '1级计划', '2级计划', '3级计划', '4级计划'];
    if (!allowed('plan.edit')) return `<span class="tag ${plan.level ? 'blue' : 'gray'}">${esc(planLevelLabel(plan.level))}</span>`;
    return `<select class="level-select" aria-label="${esc(plan.subCampaign || plan.name)}计划分级" onchange="window.__setPlanLevel('${plan.id}', this.value)">
      <option value="" ${plan.level ? '' : 'selected'}>请选择计划分级</option>
      ${levels.map(level => `<option value="${level}" ${plan.level === level ? 'selected' : ''}>${level}</option>`).join('')}
    </select>`;
  }

  function completionTag(plan) {
    const done = Number(plan.progress) >= 100 || plan.status === '已完成';
    if (!done) return '<span class="tag gray">未完成</span>';
    if (!plan.completedAt) return '<span class="tag green">已完成</span>';
    if (!plan.due) return '<span class="tag green">已完成</span>';
    return plan.completedAt <= plan.due ? '<span class="tag green">按时完成</span>' : '<span class="tag red">延误完成</span>';
  }

  function showPlanModal(plan = null) {
    const isEdit = !!plan;
    const campaignOptions = cache.campaigns.map(c => `<option value="${c.id}" ${plan?.campaignId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    showModal(`${isEdit ? '修改' : '新建'}分解战役-行动计划`, `
      <div class="form">
        <div class="full"><label>关联必胜战役</label><select id="f-campaign">${campaignOptions}</select></div>
        <div class="full"><label>分解战役</label><input id="f-sub" value="${esc(plan?.subCampaign || '')}" /></div>
        <div class="full"><label>行动计划</label><textarea id="f-name" rows="2">${esc(plan?.name || '')}</textarea></div>
        <div><label>计划分级</label><select id="f-level">${['里程碑计划','1级计划','2级计划','3级计划','4级计划'].map(l => `<option value="${l}" ${plan?.level === l ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="full"><label>衡量指标</label><textarea id="f-metric" rows="2">${esc(plan?.metric || '')}</textarea></div>
        <div class="full"><label>里程碑事件</label><textarea id="f-milestone" rows="2">${esc(plan?.milestone || '')}</textarea></div>
        <div><label>完成时间</label><input id="f-due" type="date" value="${esc(plan?.due || '')}" /></div>
        <div><label>负责人</label><input id="f-owner-name" placeholder="姓名" value="${esc(plan?.ownerName || '')}" /></div>
        <div><label>进度收集人</label><input id="f-collector" placeholder="姓名" value="${esc(plan?.collector || '')}" /></div>
        <div><label>分解战役负责人</label><input id="f-sub-owner" placeholder="姓名" value="${esc(plan?.subCampaignOwner || '')}" /></div>
        <div class="actions"><button class="btn p" onclick="window.__savePlan()">保存</button><button class="btn g" onclick="window.__closeModal()">取消</button></div>
      </div>`);
    window.__savePlan = async () => {
      try {
        const campaignId = document.getElementById('f-campaign').value;
        const campaign = cache.campaigns.find(c => c.id === campaignId);
        const payload = {
          campaignId, campaignName: campaign?.name || '', subCampaign: document.getElementById('f-sub').value,
          name: document.getElementById('f-name').value, level: document.getElementById('f-level').value,
          score: levelScore(document.getElementById('f-level').value), metric: document.getElementById('f-metric').value,
          milestone: document.getElementById('f-milestone').value, due: document.getElementById('f-due').value,
          ownerName: document.getElementById('f-owner-name').value, collector: document.getElementById('f-collector').value,
          subCampaignOwner: document.getElementById('f-sub-owner').value, orgUnitId: campaign?.orgUnitId
        };
        if (isEdit) {
          await req('PUT', `/plans/${plan.id}`, payload);
          closeModal(); toast('行动计划已修改'); pagePlans();
        } else {
          await req('POST', '/plans', payload);
          closeModal(); toast('行动计划已创建'); pagePlans();
        }
      } catch (e) { toast(e.message, 'red'); }
    };
  }

  function showProgressModal(id) {
    const plan = cache.plans.find(p => p.id === id) || {};
    showModal('战役计划的进度更新', `
      <div class="form">
        <div class="full"><label>关键进展</label><textarea id="f-key" rows="3"></textarea></div>
        <div><label>完成度（%）</label><input id="f-prog" type="number" min="0" max="100" value="${Number(plan.progress) || 0}" /></div>
        <div><label>完成时间</label><input id="f-completed-at" type="date" value="${esc(plan.completedAt || '')}" /><div class="field-tip">填写实际完成日期，用于判断按时完成或延误</div></div>
        <div class="full"><label>差异原因</label><textarea id="f-variance" rows="3"></textarea></div>
        <div class="full"><label>解决方案建议/决策点</label><textarea id="f-solution" rows="3"></textarea></div>
        <div class="actions"><button class="btn p" onclick="window.__saveProgress('${id}')">提交</button><button class="btn g" onclick="window.__closeModal()">取消</button></div>
      </div>`);
    window.__saveProgress = async (id) => {
      try {
        const r = await req('POST', `/plans/${id}/progress`, {
          progress: Number(document.getElementById('f-prog').value), keyProgress: document.getElementById('f-key').value,
          completedAt: document.getElementById('f-completed-at').value,
          varianceReason: document.getElementById('f-variance').value, solutionDecision: document.getElementById('f-solution').value
        });
        closeModal(); toast(`进度已更新，红黄灯：${r.light === 'green' ? '绿灯' : r.light === 'yellow' ? '黄灯预警' : '红灯警示'}`); pagePlans();
      } catch (e) { toast(e.message, 'red'); }
    };
  }

  async function pageBoard() {
    setPage('看板视图', '按红黄灯分组');
    activeNav('board');
    const d = await req('GET', '/board');
    const body = document.getElementById('page-body');
    const cols = [
      { key: 'red', title: '🔴 红灯 · 警示', cls: 'red' },
      { key: 'yellow', title: '🟡 黄灯 · 预警', cls: 'yellow' },
      { key: 'green', title: '🟢 绿灯 · 正常', cls: 'green' },
    ];
    body.innerHTML = `<div class="board">${cols.map((c) => {
      const items = d.plans.filter((p) => p._light === c.key);
      return `<div class="board-col"><h4>${c.title}<span class="cnt">${items.length}</span></h4><div class="body">${items.map((p) => `
        <div class="task-card ${c.cls}">
          <div class="t">${esc(p.name)}</div>
          <div class="meta"><span class="tag blue">${esc(p.level)}</span><span>${esc(userName(p.owner))}</span></div>
          <div style="margin-top:8px;">${progressBar(p)}</div>
        </div>`).join('') || '<div class="empty">无</div>'}</div></div>`;
    }).join('')}</div>`;
  }

  async function pageMeetings() {
    setPage('会议机制', '三级会议体系');
    activeNav('meetings');
    const list = await req('GET', '/meetings');
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="cards">
        ${list.map((m) => `<div class="card">
          <h3 style="font-size:15px;color:var(--gray-900);font-weight:600;">${esc(m.name)}</h3>
          <div style="margin-top:10px;font-size:13px;color:var(--gray-700);line-height:1.9;">
            <div><b>层级：</b>${esc(m.level)}</div>
            <div><b>频率：</b>${esc(m.frequency)}</div>
            <div><b>说明：</b>${esc(m.desc)}</div>
          </div>
        </div>`).join('')}
      </div>`;
  }

  async function pageCycles() {
    setPage('运行节奏', '日 / 周 / 双周 / 关键节点');
    activeNav('cycles');
    const [list, pushLogs] = await Promise.all([req('GET', '/cycles'), req('GET', '/push-logs')]);
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="cards">
        ${list.map((c) => `<div class="card">
          <h3 style="font-size:16px;color:var(--gray-900);font-weight:600;">${esc(c.period)}</h3>
          <div style="margin-top:8px;font-size:13px;color:var(--gray-700);">${esc(c.content)}</div>
          <button class="btn g sm" style="margin-top:12px;" onclick="window.__runCycle('${c.cadence}')">触发${esc(c.period)}推送</button>
        </div>`).join('')}
      </div>
      <div class="filters" style="margin-top:18px;">
        <button class="btn p sm" id="btn-check-toggle" onclick="window.__toggleCheck()">检查</button>
        <button class="btn g sm" onclick="window.__runCycle('weekly')">触发周推送</button>
        <button class="btn g sm" onclick="window.__runCycle('biweekly')">触发双周推送</button>
        <div id="check-panel" class="check-panel" style="display:none;">
          <div class="check-opts">
            <label><input type="checkbox" class="chk-phase" value="提前一个月"> 提前一个月</label>
            <label><input type="checkbox" class="chk-phase" value="提前一周"> 提前一周</label>
            <label><input type="checkbox" class="chk-phase" value="提前三天"> 提前三天</label>
            <label><input type="checkbox" class="chk-phase" value="到期当天"> 到期当天</label>
          </div>
          <div class="check-actions">
            <button class="btn p sm" onclick="window.__runCheck()">执行检查</button>
            <button class="btn sm" onclick="window.__toggleCheck(false)">收起</button>
          </div>
        </div>
      </div>
      <div class="section-title">最近推送 <span class="line"></span></div>
      <table><thead><tr><th>时间</th><th>渠道</th><th>标题</th><th>内容</th><th>接收对象</th><th>状态</th></tr></thead><tbody>${pushLogs.map(x => `<tr><td>${esc((x.at || '').slice(0,16).replace('T',' '))}</td><td>${esc(x.channel)}</td><td>${esc(x.title)}</td><td>${esc(x.content)}</td><td>${esc((x.toUserIds || []).join('、'))}</td><td>${esc(x.status || '-')}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">暂无推送</td></tr>'}</tbody></table>`;
    window.__runCycle = async (cadence) => {
      try { await req('POST', `/cycles/${cadence}/run`); toast('已触发周期推送'); pageCycles(); } catch (e) { toast(e.message, 'red'); }
    };
    window.__toggleCheck = (show) => {
      const panel = document.getElementById('check-panel');
      if (!panel) return;
      panel.style.display = show === false ? 'none' : (panel.style.display === 'none' ? 'block' : 'none');
    };
    window.__runCheck = async () => {
      const checked = [...document.querySelectorAll('.chk-phase:checked')].map((c) => c.value);
      if (!checked.length) { toast('请至少选择一个检查节点', 'red'); return; }
      try {
        await req('POST', '/cycles/reminders/run', { phases: checked });
        toast('已触发节点检查：' + checked.join('、'));
        window.__toggleCheck(false);
        pageCycles();
      } catch (e) { toast(e.message, 'red'); }
    };
  }

  // ===== 推送详情 =====
  // 显示**已触发推送**的红黄灯计划（读 pushLogs 历史），未推送时页面为空。
  async function pagePushDetails() {
    setPage('推送详情', '已触发推送的红黄灯计划完整内容');
    activeNav('push-details');
    const body = document.getElementById('page-body');
    body.innerHTML = `<div class="empty">加载中...</div>`;
    let logs = [];
    try {
      // 仅保留本次"节点提醒·红黄灯"类型的推送记录（eventKey 以 due: 开头，且带 detail 12 字段）
      const all = await req('GET', '/push-logs');
      logs = all
        .filter((x) => x && x.eventKey && x.eventKey.startsWith('due:') && x.detail)
        .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
    } catch (e) {
      body.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
      return;
    }
    const reds = logs.filter((x) => x.color === 'red');
    const yellows = logs.filter((x) => x.color === 'yellow');
    const fields = [
      ['campaignName', '必胜战役'],
      ['subCampaign', '分解战役'],
      ['planName', '行动计划'],
      ['level', '计划分级'],
      ['metric', '衡量指标'],
      ['milestone', '里程碑事件'],
      ['due', '计划完成时间'],
      ['completedAt', '实际完成时间'],
      ['ownerName', '负责人'],
      ['progress', '完成度'],
      ['status', '完成状态'],
      ['light', '亮灯情况'],
    ];
    const renderCard = (log, idx) => {
      const it = log.detail || {};
      const light = log.color || it.light || 'red';
      const lightColor = light === 'red' ? '#dc2626' : '#d97706';
      const lightBg = light === 'red' ? '#fef2f2' : '#fffbeb';
      const lightLabel = light === 'red' ? '🔴 红灯' : '🟡 黄灯';
      const phaseTag = it.phase && it.phase !== '-' ? `<span class="tag blue">${esc(it.phase)}</span>` : '';
      const pushTime = (log.at || '').slice(0, 19).replace('T', ' ');
      return `<div class="pd-card" style="border-left:3px solid ${lightColor};">
        <div class="pd-head" style="background:${lightBg};">
          <div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
              <span class="pd-light" style="color:${lightColor};background:#fff;">${lightLabel}</span>
              <strong style="font-size:15px;">${esc(it.planName || '-')}</strong>
              ${phaseTag}
              <span class="tag gray" style="font-size:11px;">推送于 ${esc(pushTime)}</span>
            </div>
            <div style="margin-top:6px;font-size:12px;color:var(--gray-700);">
              ${esc(it.campaignName)} / ${esc(it.subCampaign)} · 负责人 ${esc(it.ownerName)}
              · 接收：${esc((log.toUserIds || []).join('、') || '-')}
            </div>
          </div>
          <div style="font-size:11px;color:var(--gray-700);">#${idx + 1}</div>
        </div>
        <div class="pd-grid">
          ${fields.map(([k, label]) => {
            let v = it[k];
            if (k === 'progress' && typeof v === 'number') v = `${v}%`;
            const isLight = k === 'light';
            const tag = isLight
              ? `<span class="tag ${v === 'red' ? 'red' : 'yellow'}" style="font-weight:600;">${v === 'red' ? '红灯' : v === 'yellow' ? '黄灯' : esc(v || '-')}</span>`
              : esc(v || '-');
            return `<div class="pd-cell"><div class="pd-label">${label}</div><div class="pd-val">${tag}</div></div>`;
          }).join('')}
          ${it.lightReason && it.lightReason !== '-' ? `<div class="pd-cell" style="grid-column:span 3;"><div class="pd-label">亮灯原因</div><div class="pd-val" style="color:${lightColor};">${esc(it.lightReason)}</div></div>` : ''}
        </div>
      </div>`;
    };
    body.innerHTML = `
      <div class="filters" style="margin-bottom:12px;">
        <span class="tag red">🔴 红灯 ${reds.length}</span>
        <span class="tag yellow">🟡 黄灯 ${yellows.length}</span>
        <button class="btn g sm" onclick="window.__runPushNow()">立即触发推送</button>
      </div>
      ${logs.length === 0
        ? `<div class="empty">暂无推送记录<br><span style="font-size:12px;color:var(--gray-500);">请先在「运行节奏」点「检查」,或点上方「立即触发推送」后再来查看</span></div>`
        : logs.map(renderCard).join('')}
    `;
    // 自带触发逻辑，不依赖 pageCycles 里定义的 __runCycle（避免未访问运行节奏页时按钮失效）
    window.__runPushNow = async () => {
      try {
        await req('POST', '/cycles/reminders/run', { phases: ['提前一个月', '提前一周', '提前三天', '到期当天'] });
        toast('已按红黄灯规则触发推送');
        pagePushDetails();
      } catch (e) { toast(e.message, 'red'); }
    };
  }

  async function pageRewards() {
    setPage('奖惩考核', '完成/逾期触发 / 填写责任单 / 审批 / 人力执行');
    activeNav('rewards');
    const [rewards, std, orders] = await Promise.all([req('GET', '/rewards'), req('GET', '/reward-standards'), req('GET', '/responsibility-orders')]);
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="section-title">奖惩责任工单 <span class="line"></span></div>
      <div class="table-scroll"><table><thead><tr><th>类型</th><th>触发原因</th><th>战役负责人</th><th>参与人员及比例</th><th>状态</th><th>人力状态</th><th>操作</th></tr></thead><tbody>
        ${orders.map(o => `<tr><td><span class="tag ${o.type === '奖励' ? 'green' : 'red'}">${esc(o.type)}</span></td><td>${esc(o.triggerReason)}</td><td>${esc(userName(o.campaignOwner) || o.campaignOwner)}</td><td>${esc((o.allocations || []).map(a => `${a.name}:${a.ratio}%`).join('；') || '-')}</td><td>${esc(o.status)}</td><td>${esc(o.hrStatus)}</td><td>${orderButtons(o)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">计划完成100%或到期未完成后自动生成</td></tr>'}
      </tbody></table></div>
      <div class="section-title" style="margin-top:20px;">奖惩标准 <span class="line"></span></div>
      <table><thead><tr><th>级别</th><th>分值</th><th>激励区间</th><th>决策层级</th><th>说明</th></tr></thead><tbody>
        ${std.levels.map(l => `<tr><td><span class="tag blue">${esc(l.level)}</span></td><td>${l.score}分</td><td>${l.rewardMin}-${l.rewardMax}元</td><td>${esc(l.decision)}</td><td>${esc(l.desc)}</td></tr>`).join('')}
      </tbody></table>
      <div class="section-title" style="margin-top:20px;">奖惩记录 <span class="line"></span></div>
      <table><thead><tr><th>类型</th><th>计划</th><th>级别</th><th>金额</th><th>时间</th></tr></thead><tbody>
        ${rewards.map(r => `<tr><td>${esc(r.type)}</td><td>${esc(r.planId)}</td><td>${esc(r.level)}</td><td>${r.amount}元</td><td>${esc((r.at || '').slice(0,10))}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">暂无奖惩记录</td></tr>'}
      </tbody></table>`;
    window.__fillOrder = (id) => showOrderModal(id);
    window.__orderStatus = async (id, status) => { try { await req('PUT', `/responsibility-orders/${id}`, { status }); toast('工单状态已更新'); pageRewards(); } catch(e) { toast(e.message, 'red'); } };
  }

  function orderButtons(o) {
    if (o.status === '待填写' || o.status === '已驳回') return `<button class="btn p sm" onclick="window.__fillOrder('${o.id}')">填写并提交</button>`;
    if (o.status === '待审批' && allowed('reward.manage')) return `<button class="btn p sm" onclick="window.__orderStatus('${o.id}','已批准')">批准</button> <button class="btn g sm" onclick="window.__orderStatus('${o.id}','已驳回')">驳回</button>`;
    if (o.status === '已批准' && allowed('org.view')) return `<button class="btn p sm" onclick="window.__orderStatus('${o.id}','人力已执行')">人力确认执行</button>`;
    return '-';
  }

  function showOrderModal(id) {
    showModal('填写奖惩责任单', `<div class="form"><div class="full"><label>参与人员及分配比例（每行：姓名:比例）</label><textarea id="f-alloc" rows="6" placeholder="张三:60\n李四:40"></textarea></div><div class="full"><label>说明</label><textarea id="f-order-note" rows="3"></textarea></div><div class="actions"><button class="btn p" onclick="window.__submitOrder('${id}')">提交审批</button><button class="btn g" onclick="window.__closeModal()">取消</button></div></div>`);
    window.__submitOrder = async id => {
      try {
        const allocations = document.getElementById('f-alloc').value.split(/\n+/).filter(Boolean).map(line => { const [name, ratio] = line.split(/[:：]/); return { name: (name || '').trim(), ratio: Number(ratio) }; });
        await req('PUT', `/responsibility-orders/${id}`, { status: '待审批', allocations, note: document.getElementById('f-order-note').value });
        closeModal(); toast('责任单已提交审批'); pageRewards();
      } catch(e) { toast(e.message, 'red'); }
    };
  }

  async function pageWarnings() {
    setPage('预警中心', '红黄灯实时监控');
    activeNav('warnings');
    const list = await req('GET', '/warnings');
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="section-title">预警清单 <span class="line"></span></div>
      <table><thead><tr><th>计划</th><th>级别</th><th>所属组织</th><th>进度</th><th>状态</th><th>原因</th></tr></thead><tbody>
        ${list.map((w) => `<tr><td style="font-weight:600;">${esc(w.planName)}</td><td><span class="tag blue">${esc(w.level)}</span></td><td>${esc(unitName(w.orgUnitId))}</td><td>${w.progress}%</td><td>${lightTag({ _light: w.color })}</td><td style="font-size:12px;color:#8a8f99;">${esc(w.reason)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">当前无预警 🎉</td></tr>'}
      </tbody></table>`;
  }

  async function pageOrg() {
    setPage('组织权限', 'OA对接 / 钉钉致信推送 / 数据隔离');
    activeNav('org');
    const [org, sync] = await Promise.all([req('GET', '/org'), req('GET', '/oa-sync')]);
    const body = document.getElementById('page-body');
    body.innerHTML = `
      <div class="section-title">组织架构（来源 ${esc(sync.source)}） <span class="line"></span>
        <span class="chip">已推送：${sync.pushedTo.join('、') || '-'}${sync.extra.length ? ' / ' + sync.extra.join('、') : ''}</span>
      </div>
      <table><thead><tr><th>组织单元</th><th>类型</th><th>上级</th><th>成员数</th></tr></thead><tbody>
        ${org.orgUnits.map((o) => `<tr><td>${esc(o.name)}</td><td><span class="tag gray">${esc(o.type)}</span></td><td>${o.parentId ? esc(unitName(o.parentId)) : '—'}</td><td>${o.members}</td></tr>`).join('')}
      </tbody></table>
      <div class="section-title" style="margin-top:20px;">人员（含钉钉/致信账号） <span class="line"></span></div>
      <table><thead><tr><th>姓名</th><th>角色</th><th>OA账号</th><th>钉钉</th><th>致信</th></tr></thead><tbody>
        ${sync.users.map((u) => `<tr><td>${esc(u.name)}</td><td><span class="tag blue">${esc(u.role)}</span></td><td>${esc(u.oaId)}</td><td>${esc(u.dingtalkId)}</td><td>${esc(u.zixinId)}</td></tr>`).join('')}
      </tbody></table>
      <div class="section-title" style="margin-top:20px;">角色权限 <span class="line"></span></div>
      <table><thead><tr><th>角色</th><th>权限</th><th>说明</th></tr></thead><tbody>
        ${org.roles.map((r) => `<tr><td>${esc(r.name)}</td><td style="font-size:12px;color:#8a8f99;">${r.perms.includes('*') ? '全部权限' : r.perms.join(', ')}</td><td>${esc(r.desc)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  // ===== 弹窗 =====
  function showModal(title, innerHtml) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.id = 'modal-mask';
    mask.innerHTML = `<div class="modal"><div class="modal-h">${esc(title)}<span class="x" onclick="window.__closeModal()">×</span></div><div class="modal-b">${innerHtml}</div></div>`;
    document.body.appendChild(mask);
    window.__closeModal = closeModal;
  }
  function closeModal() {
    const m = document.getElementById('modal-mask');
    if (m) m.remove();
  }

  // ===== 用户辅助 =====
  let usersCache = [];
  async function ensureUsers() {
    if (usersCache.length) return usersCache;
    try { const d = await req('GET', '/context'); usersCache = d.users; } catch (e) {}
    return usersCache;
  }
  function userOptions() {
    const us = usersCache;
    return us.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('');
  }
  function userName(id) {
    const us = usersCache;
    const u = us.find((x) => x.id === id);
    return u ? u.name : id;
  }
  // userName 同步 fallback（种子用户）
  const seedNames = { u_1: '系统管理员', u_2: '陈总', u_3: '张文明', u_4: '王新平', u_5: '李明月', u_6: '赵辉' };
  function userNameSync(id) { return seedNames[id] || id; }

  // ===== 路由 =====
  const routes = {
    dashboard: pageDashboard,
    strategies: pageStrategies,
    campaigns: pageCampaigns,
    plans: pagePlans,
    board: pageBoard,
    meetings: pageMeetings,
    cycles: pageCycles,
    rewards: pageRewards,
    warnings: pageWarnings,
    org: pageOrg,
    'push-details': pagePushDetails,
  };

  async function router() {
    const hash = location.hash.replace(/^#\/?/, '');
    if (hash === 'login' || !token) { renderLogin(); return; }
    if (!me || !me.permissions) {
      try {
        const d = await req('GET', '/me');
        me = d;
        teams = d.teams || [];
        if (!teams.some((t) => t.id === activeTeamId)) activeTeamId = teams[0] ? teams[0].id : '';
        localStorage.setItem('peis_team', activeTeamId);
      } catch (e) { token = ''; localStorage.removeItem('peis_token'); localStorage.removeItem('peis_team'); renderLogin(); return; }
    }
    renderLayout();
    if (!allowed(routePerms[hash])) {
      document.getElementById('page-body').innerHTML = '<div class="empty">当前账号无权访问此页面</div>';
      return;
    }
    await ensureMeta();
    const route = routes[hash] || routes.dashboard;
    try { await route(); } catch (e) { document.getElementById('page-body').innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`; }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('DOMContentLoaded', router);
})();
