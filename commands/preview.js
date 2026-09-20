#!/usr/bin/env node
const { config } = require('../lib/config');
const { TfsClient, parseTfsUrl } = require('../lib/tfs');
const { renderWorkItem, renderPr } = require('../lib/render');
const { context } = require('../lib/herdr');
function tfsUrl(input) { try { return input ? parseTfsUrl(input) : null; } catch { return null; } }
(async () => {
  try {
    const ctx = context(); const parsed = tfsUrl(process.argv[2] || ctx.clicked_url);
    if (!parsed) throw new Error('No TFS work item or pull request URL in context');
    const client = new TfsClient(config());
    if (parsed.kind === 'workItem') console.log(renderWorkItem(await client.workItem(parsed.id)));
    else { const [pr, threads] = await Promise.all([client.pullRequest(parsed.id, parsed.repository), client.threads(parsed.id, parsed.repository)]); console.log(renderPr(pr, threads.value || threads || [])); }
  } catch (error) { console.error(`Azure TFS preview: ${error.message}`); process.exitCode = 1; }
})();
