const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { context, parsePaneId, openPane } = require('../lib/herdr');

const root = path.join(__dirname, '..');
function fakeRun(splitStdout) { const calls = []; return { calls, run: (args, capture) => { calls.push({ args, capture }); return Promise.resolve(capture ? splitStdout : ''); } }; }
function fixtureServer(t, handler) {
  const requests = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', x => body += x); req.on('end', () => { requests.push({ method: req.method, url: req.url, body }); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(handler(req))); }); });
  t.after(() => server.close());
  return new Promise(resolve => server.listen(0, () => resolve({ requests, port: server.address().port })));
}
function runCommand(file, args = [], env = {}) {
  return new Promise(resolve => execFile(process.execPath, [path.join(root, 'commands', file), ...args], { cwd: root, env: { PATH: process.env.PATH, HERDR_PLUGIN_CONFIG_DIR: path.join(root, 'test', 'no-such-config'), ...env } },
    (error, stdout, stderr) => resolve({ code: error ? error.code : 0, stdout, stderr })));
}
function tfsEnv(port) { return { TFS_BASE_URL: `http://127.0.0.1:${port}`, TFS_COLLECTION: 'DefaultCollection', TFS_PROJECT: 'MyProject', TFS_PAT: 'secret', AZURE_TFS_API_VERSION: '6.0' }; }

test('context() parses HERDR_PLUGIN_CONTEXT_JSON and tolerates junk', () => {
  const saved = process.env.HERDR_PLUGIN_CONTEXT_JSON;
  process.env.HERDR_PLUGIN_CONTEXT_JSON = '{"clicked_url":"https://host/tfs/C/P/_workitems/edit/7","selected_text":"blocked"}';
  assert.equal(context().clicked_url, 'https://host/tfs/C/P/_workitems/edit/7'); assert.equal(context().selected_text, 'blocked');
  process.env.HERDR_PLUGIN_CONTEXT_JSON = 'not json'; assert.deepEqual(context(), {});
  delete process.env.HERDR_PLUGIN_CONTEXT_JSON; assert.deepEqual(context(), {});
  if (saved !== undefined) process.env.HERDR_PLUGIN_CONTEXT_JSON = saved;
});

test('openPane splits a pane then runs the command in it', async () => {
  const { calls, run } = fakeRun(JSON.stringify({ result: { pane: { pane_id: '%9' } } }));
  assert.equal(await openPane('opencode --prompt x', run), '%9');
  assert.deepEqual(calls[0].args, ['pane', 'split', '--current', '--direction', 'right', '--no-focus']); assert.equal(calls[0].capture, true);
  assert.deepEqual(calls[1].args, ['pane', 'run', '%9', 'opencode --prompt x']); assert.ok(!calls[1].capture);
  assert.equal(calls.length, 2);
});

test('openPane reports unparseable split output and a missing pane id without running anything', async () => {
  const bad = fakeRun('[herdr shim] would run: herdr pane split');
  await assert.rejects(openPane('opencode', bad.run), /pane split did not return JSON/); assert.equal(bad.calls.length, 1);
  const empty = fakeRun(JSON.stringify({ result: { pane: {} } }));
  await assert.rejects(openPane('opencode', empty.run), /pane split returned no pane id/); assert.equal(empty.calls.length, 1);
  assert.equal(parsePaneId(JSON.stringify({ pane: { pane_id: '%3' } })), '%3');
});

test('openPane propagates a failing split', async () => {
  await assert.rejects(openPane('opencode', () => Promise.reject(new Error('herdr pane split exited 2'))), /herdr pane split exited 2/);
});

test('preview reads clicked_url from the invocation context', async (t) => {
  const { port } = await fixtureServer(t, () => ({ id: 1042, fields: { 'System.Title': 'Retry TFS auth', 'System.State': 'Active' } }));
  const result = await runCommand('preview.js', [], { ...tfsEnv(port), HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ clicked_url: 'https://tfsserver:8080/tfs/DefaultCollection/MyProject/_workitems/edit/1042', link_handler_id: 'workitem-link' }) });
  assert.equal(result.code, 0); assert.match(result.stdout, /Work item #1042/); assert.match(result.stdout, /Retry TFS auth/);
});

test('preview with no URL anywhere prints its usage message and exits 1', async () => {
  const result = await runCommand('preview.js', [], { HERDR_PLUGIN_CONTEXT_JSON: '{}' });
  assert.equal(result.code, 1); assert.equal(result.stderr.trim(), 'Azure TFS preview: No TFS work item or pull request URL in context');
  const junk = await runCommand('preview.js', ['not-a-url'], { HERDR_PLUGIN_CONTEXT_JSON: '{}' });
  assert.equal(junk.code, 1); assert.match(junk.stderr, /No TFS work item or pull request URL in context/);
});

test('report comments with selected_text from the context', async (t) => {
  const { requests, port } = await fixtureServer(t, () => ({ id: 1042 }));
  const result = await runCommand('report.js', [], { ...tfsEnv(port), HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ clicked_url: 'https://tfsserver:8080/tfs/DefaultCollection/MyProject/_workitems/edit/1042', selected_text: 'Blocked on a flaky auth test.' }) });
  assert.equal(result.code, 0); assert.match(result.stdout, /TFS status posted\./);
  assert.equal(requests[0].method, 'PATCH'); assert.match(requests[0].url, /wit\/workitems\/1042/);
  assert.equal(JSON.parse(requests[0].body)[0].value, 'Blocked on a flaky auth test.');
});

test('report prefers argv status text over selected_text', async (t) => {
  const { requests, port } = await fixtureServer(t, () => ({ id: 1042 }));
  const result = await runCommand('report.js', ['https://tfsserver:8080/tfs/DefaultCollection/MyProject/_workitems/edit/1042', 'manual', 'override'], { ...tfsEnv(port), HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ selected_text: 'ignored' }) });
  assert.equal(result.code, 0); assert.equal(JSON.parse(requests[0].body)[0].value, 'manual override');
});

test('report with no URL prints the usage message and exits 1', async () => {
  const result = await runCommand('report.js', [], { HERDR_PLUGIN_CONTEXT_JSON: '{}' });
  assert.equal(result.code, 1); assert.equal(result.stderr.trim(), 'Azure TFS report: Usage: report <TFS URL> [status]');
  const blank = await runCommand('report.js', [''], {});
  assert.equal(blank.code, 1); assert.match(blank.stderr, /Usage: report <TFS URL> \[status\]/);
});

test('dispatch derives the work item id from clicked_url and drives pane split then pane run', { skip: process.platform === 'win32' && 'needs a POSIX shim' }, async (t) => {
  const { port } = await fixtureServer(t, () => ({ id: 1042, fields: { 'System.Title': 'Retry TFS auth', 'System.Description': 'Board dies.', 'Microsoft.VSTS.Common.AcceptanceCriteria': '401 hints.' } }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-shim-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const shim = path.join(dir, 'herdr'); const log = path.join(dir, 'calls.log');
  fs.writeFileSync(shim, `#!/bin/sh\nprintf '%s\\n' "herdr $*" >> "$SHIM_LOG"\nif [ "$2" = "split" ]; then echo '{"result":{"pane":{"pane_id":"%12"}}}'; fi\n`, { mode: 0o755 });
  const result = await runCommand('dispatch.js', [], { ...tfsEnv(port), HERDR_BIN_PATH: shim, SHIM_LOG: log, HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ clicked_url: 'https://tfsserver:8080/tfs/DefaultCollection/MyProject/_workitems/edit/1042', focused_pane_agent: 'claude' }) });
  assert.equal(result.code, 0, result.stderr);
  const calls = fs.readFileSync(log, 'utf8').split(/^herdr /m).slice(1).map(entry => entry.replace(/\n$/, ''));
  assert.equal(calls[0], 'pane split --current --direction right --no-focus');
  assert.match(calls[1], /^pane run %12 claude --prompt 'Work on TFS work item #1042: Retry TFS auth\n/);
  assert.match(calls[1], /Acceptance criteria:\n401 hints\.'$/); assert.equal(calls.length, 2);
});

test('dispatch without an id in argv or context prints its usage message and exits 1', async () => {
  const result = await runCommand('dispatch.js', [], { HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ clicked_url: 'https://tfsserver:8080/tfs/DefaultCollection/MyProject/_git/api/pullrequest/78' }) });
  assert.equal(result.code, 1); assert.equal(result.stderr.trim(), 'Azure TFS dispatch: Usage: dispatch <work-item-id>');
});
