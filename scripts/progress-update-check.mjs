import assert from 'node:assert/strict';

const base = process.env.PEIS_URL || 'http://127.0.0.1:9280/api';
const json = async (path, options = {}) => {
  const response = await fetch(base + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) throw new Error(payload.msg || `${response.status} ${path}`);
  return payload.data;
};

const login = await json('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
const headers = { Authorization: `Bearer ${login.token}`, 'X-Team-Id': login.teams[0].id };
const campaigns = await json('/campaign-options', { headers });
assert.ok(campaigns.length, '需要至少一个必胜战役用于回归检查');
let plan;
try {
  plan = await json('/plans', {
    method: 'POST', headers,
    body: JSON.stringify({
      campaignId: campaigns[0].id,
      campaignName: campaigns[0].name,
      subCampaign: '进度修改回归检查',
      name: '临时计划（检查结束自动删除）',
      due: '2099-12-31',
      progress: 0,
    }),
  });
  await json(`/plans/${plan.id}/progress`, {
    method: 'POST', headers,
    body: JSON.stringify({ progress: 100, completedAt: '2026-09-14', keyProgress: '旧进展', varianceReason: '旧原因', solutionDecision: '旧方案' }),
  });
  await json(`/plans/${plan.id}/progress`, {
    method: 'POST', headers,
    body: JSON.stringify({ progress: 40, completedAt: '', keyProgress: '', varianceReason: '', solutionDecision: '' }),
  });
  const plans = await json('/plans', { headers });
  const saved = plans.find((item) => item.id === plan.id);
  assert.ok(saved, '修改后应能重新读取计划');
  assert.equal(saved.progress, 40);
  assert.equal(saved.status, '执行中');
  assert.equal(saved.completedAt, '');
  assert.equal(saved.keyProgress, '');
  assert.equal(saved.varianceReason, '');
  assert.equal(saved.solutionDecision, '');
  console.log('PASS: progress content can be changed/cleared and 100% can be reduced to in-progress.');
} finally {
  if (plan?.id) await json(`/plans/${plan.id}`, { method: 'DELETE', headers });
}
