#!/usr/bin/env node
const { config } = require('../lib/config');
const { TfsClient, parseTfsUrl } = require('../lib/tfs');
const { context } = require('../lib/herdr');
function tfsUrl(input) { try { return input ? parseTfsUrl(input) : null; } catch { return null; } }
(async () => {
  try {
    const ctx = context(); const parsed = tfsUrl(process.argv[2] || ctx.clicked_url); if (!parsed) throw new Error('Usage: report <TFS URL> [status]');
    const content = process.argv.slice(3).join(' ') || ctx.selected_text || 'Agent is blocked and needs assistance.';
    const client = new TfsClient(config()); if (parsed.kind === 'workItem') await client.commentWorkItem(parsed.id, content); else await client.commentPullRequest(parsed.id, parsed.repository, content);
    console.log('TFS status posted.');
  } catch (error) { console.error(`Azure TFS report: ${error.message}`); process.exitCode = 1; }
})();
