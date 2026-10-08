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
let campaign;
let plan;
try {
  campaign = await json('/campaigns', {
    method: 'POST', headers,
    body: JSON.stringify({ name: '战役进度联动回归检查', orgUnitId: login.user.orgUnitId }),
  });
  plan = await json('/plans', {
    method: 'POST', headers,
    body: JSON.stringify({
      campaignId: campaign.id,
      campaignName: campaign.name,
      subCampaign: '进度联动检查',
      name: '临时计划（检查结束自动删除）',
      level: '里程碑计划',
      progress: 0,
      due: '2099-12-31',
      orgUnitId: campaign.orgUnitId,
    }),
  });
  await json(`/plans/${plan.id}/progress`, { method: 'POST', headers, body: JSON.stringify({ progress: 60 }) });
  let campaigns = await json('/campaigns', { headers });
  assert.equal(campaigns.find((item) => item.id === campaign.id)?.progress, 60);

  await json(`/plans/${plan.id}/progress`, { method: 'POST', headers, body: JSON.stringify({ progress: 25 }) });
  campaigns = await json('/campaigns', { headers });
  assert.equal(campaigns.find((item) => item.id === campaign.id)?.progress, 25);
  console.log('PASS: campaign progress follows its action-plan weighted score.');
} finally {
  if (plan?.id) await json(`/plans/${plan.id}`, { method: 'DELETE', headers });
  if (campaign?.id) await json(`/campaigns/${campaign.id}`, { method: 'DELETE', headers });
}
