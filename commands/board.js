#!/usr/bin/env node
const { config } = require('../lib/config');
const { TfsClient } = require('../lib/tfs');
const { renderBoard } = require('../lib/render');

async function fetchBoard() {
  const client = new TfsClient(config());
  const [items, prs] = await Promise.all([client.queryWorkItems(), client.pullRequests()]);
  return renderBoard(items.value || [], Array.isArray(prs) ? prs : prs.value || []);
}

// Unset/empty/NaN/negative all fall back to the 60s default; only an explicit
// "0" (or --once) means print-once-and-exit.
function parseRefreshSeconds(raw) {
  if (raw === undefined || raw.trim() === '') return 60;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 60;
}
const refreshSeconds = parseRefreshSeconds(process.env.TFS_BOARD_REFRESH_SECONDS);
const once = process.argv.includes('--once') || refreshSeconds === 0;

// clear=false keeps the plain print-once-and-exit output scripted/CI callers rely on.
async function draw(clear) {
  const board = await fetchBoard();
  if (clear) console.clear();
  console.log(board);
  if (clear) console.log(`\nLast updated: ${new Date().toLocaleTimeString()}  (refreshing every ${refreshSeconds}s, Ctrl+C to close)`);
}

(async () => {
  // Registered before the first draw so a hung initial fetch can still be killed cleanly.
  let stopped = false;
  const stop = () => { stopped = true; process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  try { await draw(!once); }
  catch (error) { console.error(`Azure TFS board: ${error.message}`); process.exitCode = 1; return; }
  if (once) return;

  // A transient refresh failure must not kill the pane: show it in place and
  // retry next tick. Self-rescheduling (not setInterval) so a slow or hung
  // fetch can't stack overlapping draws.
  const tick = async () => {
    if (stopped) return;
    try { await draw(true); }
    catch (error) {
      console.clear();
      console.log(`Azure TFS board: refresh failed: ${error.message}`);
      console.log(`\nLast updated: ${new Date().toLocaleTimeString()}  (retrying in ${refreshSeconds}s, Ctrl+C to close)`);
    }
    if (!stopped) setTimeout(tick, refreshSeconds * 1000);
  };
  setTimeout(tick, refreshSeconds * 1000);
})();
