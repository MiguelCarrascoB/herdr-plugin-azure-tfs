#!/usr/bin/env node
const { config } = require('../lib/config');
const { TfsClient } = require('../lib/tfs');
const { renderBoard } = require('../lib/render');
(async () => {
  try { const client = new TfsClient(config()); const [items, prs] = await Promise.all([client.queryWorkItems(), client.pullRequests()]); console.log(renderBoard(items.value || [], Array.isArray(prs) ? prs : prs.value || [])); }
  catch (error) { console.error(`Azure TFS board: ${error.message}`); process.exitCode = 1; }
})();
