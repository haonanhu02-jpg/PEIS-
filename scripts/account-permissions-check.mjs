import fs from 'node:fs';
// Run against the isolated test deployment: this test creates disposable records.
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:19280';
const accounts = [
  ['admin', 'admin123', ['t_1', 't_2'], ['*']],
  ['ceo', 'ceo123', ['t_1'], ['strategy.view','strategy.edit','plan.edit','meeting.view','meeting.manage','reward.view','reward.manage','org.view']],
  ['zhangwm', '123456', ['t_1'], ['strategy.view','plan.edit','meeting.view','reward.view']],
  ['wangxp', '123456', ['t_1'], ['strategy.view','plan.edit','meeting.view','meeting.manage','reward.view','org.view']],
  ['limf', '123456', ['t_2'], ['plan.edit','meeting.view']],
  ['zhaoh', '123456', ['t_1','t_2'], ['meeting.view']],
];
const results = [];
function check(account, test, expected, actual) { results.push({ account, test, expected, actual, pass: JSON.stringify(expected) === JSON.stringify(actual) }); }
async function call(path, token, team, method = 'GET', body) {
  const res = await fetch(base + '/api' + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(team ? { 'X-Team-Id': team } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  return { status: res.status, json: await res.json() };
}
const sessions = {};
for (const [name,password,teams,perms] of accounts) {
  const login = await call('/auth/login', null, null, 'POST', { username: name, password });
  check(name, 'login', 200, login.status);
  sessions[name] = login.json.data;
  check(name, 'team membership', teams, login.json.data.teams.map(t => t.id).sort());
  check(name, 'wrong password rejected', 401, (await call('/auth/login', null, null, 'POST', { username: name, password: 'incorrect-test-password' })).status);
}
const admin = sessions.admin.token;
const prefix = 'ACCOUNT_TEST_' + Date.now();
const fixtures = {};
for (const team of ['t_1','t_2']) {
  const orgUnitId = team === 't_1' ? 'ou_18' : 'ou_20';
  fixtures[team] = (await call('/plans', admin, team, 'POST', { name: prefix, owner: 'u_6', orgUnitId, progress: 100, status: '已完成' })).json.data;
}
const reads = [['/dashboard',null],['/plans',null],['/board',null],['/strategies','strategy.view'],['/campaigns','strategy.view'],['/meetings','meeting.view'],['/rewards','reward.view'],['/org','org.view'],['/oa-sync','org.view'],['/context',null],['/warnings',null],['/push-logs',null]];
const writes = [['/strategies','strategy.edit'],['/campaigns','strategy.edit'],['/plans','plan.edit'],['/meetings','meeting.manage'],['/rewards','reward.manage'],['/cycles/daily/run','plan.edit']];
for (const [name,password,teams,perms] of accounts) {
  const token = sessions[name].token;
  const allowed = perm => !perm || perms.includes('*') || perms.includes(perm);
  for (const team of teams) {
    check(name, `switch ${team}`, 200, (await call('/teams/switch', token, team, 'POST', {teamId:team})).status);
    for (const [path, perm] of reads) {
      const r = await call(path, token, team);
      check(name, `${team} GET ${path}`, allowed(perm) ? 200 : 403, r.status);
      if (r.status === 200) {
        const d = r.json.data;
        const rows = Array.isArray(d) ? d : [...(d.plans || []), ...(d.campaigns || []), ...(d.orgUnits || [])];
        check(name, `${team} scoped ${path}`, true, rows.every(row => !row.teamId || row.teamId === team));
      }
    }
    for (const [path, perm] of writes) {
      const r = await call(path, token, team, 'POST', {name:prefix, title:prefix, orgUnitId:team === 't_1' ? 'ou_18' : 'ou_20', planId:fixtures[team].id, progress:100, status:'已完成'});
      check(name, `${team} POST ${path}`, allowed(perm) ? 200 : 403, r.status);
    }
    const otherTeam = team === 't_1' ? 't_2' : 't_1';
    const cross = await call('/plans/' + fixtures[otherTeam].id, token, team, 'PUT', {progress:100});
    check(name, `${team} cross-team record write`, 403, cross.status);
    const edit = await call('/plans/' + fixtures[team].id, token, team, 'PUT', {progress:100});
    // Industry head's department is ou_17; this unrelated fixture is in ou_18.
    check(name, `${team} edit within owner/department scope`, name === 'zhangwm' ? 403 : 200, edit.status);
    const progress = await call('/plans/' + fixtures[team].id + '/progress', token, team, 'POST', {progress:100});
    check(name, `${team} progress within owner/department scope`, name === 'zhangwm' ? 403 : 200, progress.status);
    if (!teams.includes(otherTeam)) {
      check(name, 'nonmember header rejected', 403, (await call('/plans', token, otherTeam)).status);
      check(name, 'nonmember query rejected', 403, (await call('/plans?teamId=' + otherTeam, token)).status);
      check(name, 'nonmember switch rejected', 403, (await call('/teams/switch', token, team, 'POST', {teamId:otherTeam})).status);
    }
  }
}
// An execution member has plan.edit_self, which the API comment defines as progress-only.
check('zhaoh', 'self progress permission must not allow changing plan score', 403,
  (await call('/plans/' + fixtures.t_2.id, sessions.zhaoh.token, 't_2', 'PUT', {score:999})).status);
// The seeded industry head owns p_1, which should be usable if they are responsible for it.
const ownPlans = await call('/plans?mine=1', sessions.zhangwm.token, 't_1');
check('zhangwm', 'assigned seed plan p_1 visible', true, ownPlans.json.data.some(p => p.id === 'p_1'));
check('zhangwm', 'assigned plan remains editable outside home department', 200,
  (await call('/plans/p_1', sessions.zhangwm.token, 't_1', 'PUT', {progress:92})).status);
for (const field of ['score','owner','orgUnitId','name','due','participants']) {
  const values = {score:999, owner:'u_1', orgUnitId:'ou_20', name:'not allowed', due:'2030-01-01', participants:['u_1']};
  check('zhaoh', `self cannot modify ${field}`, 403,
    (await call('/plans/' + fixtures.t_2.id, sessions.zhaoh.token, 't_2', 'PUT', {[field]:values[field]})).status);
}
fs.mkdirSync('artifacts', {recursive:true});
fs.writeFileSync('artifacts/account-permissions-results.json', JSON.stringify({base, runAt:new Date().toISOString(), results}, null, 2));
const failed = results.filter(r => !r.pass);
console.log(JSON.stringify({checks:results.length, passed:results.length-failed.length, failed}, null, 2));
if (failed.length) process.exitCode = 1;
