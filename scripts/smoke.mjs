import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:9280';
let checks = 0;
async function request(path, { token, team, method = 'GET', body, status = 200 } = {}) {
  const r = await fetch(`${base}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(team ? { 'X-Team-Id': team } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await r.json();
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(json)}`);
  checks++;
  return json.data;
}
const admin = await request('/auth/login', { method: 'POST', body: { username: 'admin', password: 'admin123' } });
const limf = await request('/auth/login', { method: 'POST', body: { username: 'limf', password: '123456' } });
assert.deepEqual(admin.teams.map(t => t.id).sort(), ['t_1', 't_2']);
assert.deepEqual(limf.teams.map(t => t.id), ['t_2']);
await request('/plans', { status: 401 });
await request('/auth/login', { method: 'POST', body: { username: 'admin', password: 'wrong' }, status: 401 });
for (const team of ['t_1', 't_2']) {
  for (const path of ['/plans', '/strategies', '/campaigns', '/meetings']) {
    const rows = await request(path, { token: admin.token, team });
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.teamId === team));
  }
}
const plans = await request('/plans', { token: limf.token });
assert.ok(plans.length > 0 && plans.every(p => p.teamId === 't_2'));
await request('/teams/switch', { token: limf.token, method: 'POST', body: { teamId: 't_1' }, status: 403 });
await request('/plans', { token: limf.token, team: 't_1', status: 403 });
await request('/plans?teamId=t_1', { token: limf.token, status: 403 });
// p_3 is owned by limf but belongs to a team they cannot access.
await request('/plans/p_3', { token: limf.token, method: 'PUT', body: { progress: 45 }, status: 403 });
await request('/plans/p_3/progress', { token: limf.token, method: 'POST', body: { progress: 45 }, status: 403 });
await request('/plans/p_7', { token: limf.token, method: 'PUT', body: { teamId: 't_1' }, status: 403 });
await request('/plans/p_7', { token: limf.token, method: 'PUT', body: { campaignId: 'cm_1' }, status: 403 });
const own = await request('/plans/p_7', { token: limf.token, method: 'PUT', body: { progress: plans.find(p => p.id === 'p_7').progress } });
assert.equal(own.teamId, 't_2');
const context = await request('/context', { token: limf.token });
assert.ok(context.orgUnits.every(unit => unit.teamId === 't_2'));
assert.ok(context.users.every(user => !('pwd' in user)));
await request('/auth/oa-sso', { method: 'POST', body: { username: 'admin', oaToken: 'demo' }, status: 503 });
await request('/auth/push-open', { method: 'POST', body: { channelId: 'dingtalk', dingtalkId: 'dd_admin' }, status: 503 });
await request('/health');
console.log(`PASS: ${checks} HTTP checks; login, team reads, switch, cross-team writes and health.`);
