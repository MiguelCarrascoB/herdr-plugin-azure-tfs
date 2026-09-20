#!/usr/bin/env node
const { config } = require('../lib/config');
const { TfsClient, parseTfsUrl } = require('../lib/tfs');
const { context } = require('../lib/herdr');
(async () => {
  try {
    const ctx = context(); const input = process.argv[2] || ctx.url || ctx.href; const parsed = parseTfsUrl(input || '');
    const content = process.argv.slice(3).join(' ') || ctx.status || 'Agent is blocked and needs assistance.'; if (!parsed) throw new Error('Usage: report <TFS URL> [status]');
    const client = new TfsClient(config()); if (parsed.kind === 'workItem') await client.commentWorkItem(parsed.id, content); else await client.commentPullRequest(parsed.id, parsed.repository, content);
    console.log('TFS status posted.');
  } catch (error) { console.error(`Azure TFS report: ${error.message}`); process.exitCode = 1; }
})();
