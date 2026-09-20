#!/usr/bin/env node
const { config } = require('../lib/config');
const { TfsClient, parseTfsUrl } = require('../lib/tfs');
const { context, openPane } = require('../lib/herdr');
function quote(value) { return `'${String(value).replace(/'/g, `'\\''`)}'`; }
function tfsUrl(input) { try { return input ? parseTfsUrl(input) : null; } catch { return null; } }
(async () => {
  try {
    const ctx = context(); const linked = tfsUrl(ctx.clicked_url);
    const id = Number(process.argv[2] || (linked?.kind === 'workItem' ? linked.id : NaN)); if (!Number.isInteger(id)) throw new Error('Usage: dispatch <work-item-id>');
    const item = await new TfsClient(config()).workItem(id); const f = item.fields || {};
    const prompt = `Work on TFS work item #${id}: ${f['System.Title'] || ''}\n\nDescription:\n${f['System.Description'] || '(none)'}\n\nAcceptance criteria:\n${f['Microsoft.VSTS.Common.AcceptanceCriteria'] || '(none)'}`;
    const agent = process.env.TFS_AGENT_COMMAND || ctx.focused_pane_agent || 'opencode';
    await openPane(`${agent} --prompt ${quote(prompt)}`);
  } catch (error) { console.error(`Azure TFS dispatch: ${error.message}`); process.exitCode = 1; }
})();
