const { spawn } = require('node:child_process');
function context() { try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}'); } catch { return {}; } }
function herdrBin() { return process.env.HERDR_BIN_PATH || 'herdr'; }
function runHerdr(args, capture = false) { return new Promise((resolve, reject) => { const child = spawn(herdrBin(), args, { stdio: ['ignore', capture ? 'pipe' : 'inherit', 'inherit'], env: process.env }); let out = ''; if (capture) child.stdout.on('data', chunk => out += chunk); child.on('error', reject); child.on('close', code => code ? reject(new Error(`herdr ${args.slice(0, 2).join(' ')} exited ${code}`)) : resolve(out)); }); }
function parsePaneId(stdout) { let data; try { data = JSON.parse(stdout); } catch { throw new Error('herdr pane split did not return JSON'); } const id = data?.result?.pane?.pane_id ?? data?.pane?.pane_id; if (!id) throw new Error('herdr pane split returned no pane id'); return String(id); }
async function openPane(command, run = runHerdr) { const paneId = parsePaneId(await run(['pane', 'split', '--current', '--direction', 'right', '--no-focus'], true)); await run(['pane', 'run', paneId, command]); return paneId; }
module.exports = { context, herdrBin, runHerdr, parsePaneId, openPane };
