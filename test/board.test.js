const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const boardPath = path.join(__dirname, '..', 'commands', 'board.js');

function fixtureServer() {
  let requests = 0;
  const server = http.createServer((req, res) => {
    requests++;
    let body = '';
    req.on('data', x => body += x);
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      const p = req.url.split('?')[0];
      const fixture = p.endsWith('/wit/wiql') ? { workItems: [{ id: 4 }] }
        : p.endsWith('/wit/workitems') ? { value: [{ id: 4, fields: { 'System.State': 'Active', 'System.Title': 'Fixture item' } }] }
        : p.endsWith('/git/pullrequests') ? [{ pullRequestId: 8, title: 'Fixture PR', status: 'active', repository: { name: 'api' } }]
        : {};
      res.end(JSON.stringify(fixture));
    });
  });
  return { server, get requests() { return requests; } };
}

function baseEnv(port, extra = {}) {
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-test-'));
  return {
    ...process.env,
    HERDR_PLUGIN_CONFIG_DIR: configDir,
    TFS_BASE_URL: `http://127.0.0.1:${port}`,
    TFS_COLLECTION: 'DefaultCollection',
    TFS_PROJECT: 'MyProject',
    TFS_PAT: 'secret',
    AZURE_TFS_API_VERSION: '6.0',
    ...extra,
  };
}

function run(env, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [boardPath, ...args], { env });
    let stdout = '', stderr = '';
    child.stdout.on('data', x => stdout += x);
    child.stderr.on('data', x => stderr += x);
    child.on('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('--once renders the board once and exits 0', async (t) => {
  const { server } = fixtureServer();
  await new Promise(resolve => server.listen(0, resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const { code, stdout, stderr } = await run(baseEnv(port), ['--once']);
  assert.equal(code, 0);
  assert.equal(stderr, '');
  assert.match(stdout, /Azure TFS board/);
  assert.match(stdout, /#4 \[Active\] Fixture item/);
  assert.match(stdout, /!8 \[active\] Fixture PR \(api\)/);
  assert.doesNotMatch(stdout, /Last updated:/);
});

test('TFS_BOARD_REFRESH_SECONDS=0 also renders once and exits 0', async (t) => {
  const { server } = fixtureServer();
  await new Promise(resolve => server.listen(0, resolve));
  t.after(() => server.close());
  const port = server.address().port;
  const { code, stdout } = await run(baseEnv(port, { TFS_BOARD_REFRESH_SECONDS: '0' }));
  assert.equal(code, 0);
  assert.match(stdout, /Azure TFS board/);
  assert.doesNotMatch(stdout, /Last updated:/);
});

test('a failure on the first render exits 1 and prints the error', async (t) => {
  // Nothing listens on this port: every request fails immediately.
  const deadServer = http.createServer(() => {});
  await new Promise(resolve => deadServer.listen(0, resolve));
  const port = deadServer.address().port;
  await new Promise(resolve => deadServer.close(resolve));
  const { code, stdout, stderr } = await run(baseEnv(port), ['--once']);
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /Azure TFS board:/);
});

test('refresh mode redraws on an interval and survives a transient failure', async (t) => {
  const { server } = fixtureServer();
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  t.after(() => { try { server.close(); } catch { /* already closed */ } });

  const child = spawn(process.execPath, [boardPath], { env: baseEnv(port, { TFS_BOARD_REFRESH_SECONDS: '1' }) });
  let stdout = '', stderr = '';
  child.stdout.on('data', x => stdout += x);
  child.stderr.on('data', x => stderr += x);

  const exited = new Promise(resolve => child.on('exit', code => resolve(code)));

  // Wait for the first successful render (not a fixed delay: a slow first
  // fetch on a loaded machine could otherwise race the server shutdown
  // below and produce a first-render failure instead of a transient one).
  await new Promise((resolve, reject) => {
    const started = Date.now();
    const poll = setInterval(() => {
      if (/Azure TFS board/.test(stdout)) { clearInterval(poll); resolve(); }
      else if (Date.now() - started > 5000) { clearInterval(poll); reject(new Error(`first render never appeared. stderr: ${stderr}`)); }
    }, 20);
  });

  // Now kill the fixture server to force a transient failure on the next tick.
  await new Promise(resolve => server.close(resolve));

  // Give it time to hit the failed tick and at least one more tick after.
  await new Promise(resolve => setTimeout(resolve, 1800));
  child.kill('SIGTERM');
  const code = await exited;

  assert.equal(code, 0, `expected clean exit on SIGTERM, got ${code}. stderr: ${stderr}`);
  assert.match(stdout, /Azure TFS board/);
  assert.match(stdout, /Last updated:/);
  assert.match(stdout, /refresh failed:/);
});
