const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { authHeader, parseTfsUrl, wiqlQuery, TfsClient } = require('../lib/tfs');
const { renderBoard } = require('../lib/render');

test('builds empty-user PAT basic auth', () => assert.equal(authHeader('secret'), `Basic ${Buffer.from(':secret').toString('base64')}`));
test('parses work item and pull request URLs', () => {
  assert.deepEqual(parseTfsUrl('https://host/tfs/DefaultCollection/App/_workitems/edit/42'), { kind: 'workItem', collection: 'DefaultCollection', project: 'App', id: 42 });
  assert.deepEqual(parseTfsUrl('https://host/tfs/DefaultCollection/App/_git/api/pullrequest/7/'), { kind: 'pullRequest', collection: 'DefaultCollection', project: 'App', repository: 'api', id: 7 });
  assert.equal(parseTfsUrl('https://host/not-tfs'), null);
});
test('builds assigned-to-me WIQL', () => { const query = wiqlQuery("A team's Project"); assert.match(query, /AssignedTo.*@Me/); assert.match(query, /A team''s Project/); });
test('renders board work items and PRs', () => {
  const text = renderBoard([{ id: 4, fields: { 'System.State': 'Active', 'System.Title': 'Fix it' } }], [{ pullRequestId: 8, title: 'Review it', status: 'active', repository: { name: 'api' } }]);
  assert.match(text, /#4 \[Active\] Fix it/); assert.match(text, /!8 \[active\] Review it \(api\)/);
});
test('client sends auth and handles WIQL, work items, PRs, and threads from a fixture server', async (t) => {
  const requests = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', x => body += x); req.on('end', () => { requests.push({ req, body }); res.setHeader('content-type', 'application/json');
    const path = req.url.split('?')[0]; const fixture = path.endsWith('/wit/wiql') ? { workItems: [{ id: 4 }] } : path.endsWith('/wit/workitems') ? { value: [{ id: 4, fields: { 'System.Title': 'Fixture' } }] } : path.endsWith('/git/pullrequests') ? [{ pullRequestId: 8, title: 'Fixture PR' }] : path.endsWith('/threads') ? { value: [{ id: 1 }] } : { pullRequestId: 8, title: 'Fixture PR' }; res.end(JSON.stringify(fixture)); }); });
  await new Promise(resolve => server.listen(0, resolve)); t.after(() => server.close());
  const port = server.address().port; const client = new TfsClient({ baseUrl: `http://127.0.0.1:${port}`, collection: 'DefaultCollection', project: 'App', pat: 'secret', apiVersion: '6.0' });
  const items = await client.queryWorkItems(); const prs = await client.pullRequests(); const pr = await client.pullRequest(8, 'api'); const threads = await client.threads(8, 'api');
  assert.equal(items.value[0].id, 4); assert.equal(prs[0].pullRequestId, 8); assert.equal(pr.title, 'Fixture PR'); assert.equal(threads.value[0].id, 1);
  assert.equal(requests[0].req.method, 'POST'); assert.equal(requests[0].req.headers.authorization, authHeader('secret')); assert.match(JSON.parse(requests[0].body).query, /@Me/);
});
test('picks JSON Patch content type for work item comments and plain JSON for PR comments', async (t) => {
  const requests = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', x => body += x); req.on('end', () => { requests.push({ req, body }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 1 })); }); });
  await new Promise(resolve => server.listen(0, resolve)); t.after(() => server.close());
  const port = server.address().port; const client = new TfsClient({ baseUrl: `http://127.0.0.1:${port}`, collection: 'DefaultCollection', project: 'App', pat: 'secret', apiVersion: '6.0' });
  await client.commentWorkItem(42, 'a comment'); await client.commentPullRequest(8, 'api', 'a comment');
  assert.equal(requests[0].req.headers['content-type'], 'application/json-patch+json'); assert.ok(Array.isArray(JSON.parse(requests[0].body)));
  assert.equal(requests[1].req.headers['content-type'], 'application/json'); assert.equal(Array.isArray(JSON.parse(requests[1].body)), false);
});
