const { spawn } = require('node:child_process');
function context() { try { return JSON.parse(process.env.HERDR_PLUGIN_CONTEXT_JSON || '{}'); } catch { return {}; } }
function herdrBin() { return process.env.HERDR_BIN_PATH || 'herdr'; }
function openPane(command, args = []) { return new Promise((resolve, reject) => { const child = spawn(herdrBin(), ['pane', 'open', '--command', command, ...args], { stdio: 'inherit', env: process.env }); child.on('error', reject); child.on('exit', code => code ? reject(new Error(`herdr pane open exited ${code}`)) : resolve()); }); }
module.exports = { context, herdrBin, openPane };
