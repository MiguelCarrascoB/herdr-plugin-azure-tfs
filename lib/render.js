function field(item, name) { return item?.fields?.[name] ?? ''; }
function renderBoard(workItems, prs) {
  const lines = ['Azure TFS board', '================', 'Work items'];
  if (!workItems.length) lines.push('  (none)');
  for (const item of workItems) lines.push(`  #${item.id} [${field(item, 'System.State')}] ${field(item, 'System.Title')}`);
  lines.push('', 'Open pull requests');
  if (!prs.length) lines.push('  (none)');
  for (const pr of prs) lines.push(`  !${pr.pullRequestId || pr.id} [${pr.status || 'active'}] ${pr.title} (${pr.repository?.name || pr.repository?.id || ''})`);
  return lines.join('\n');
}
function renderWorkItem(item) { return [`Work item #${item.id}`, field(item, 'System.Title'), `State: ${field(item, 'System.State')}`, `Assigned to: ${field(item, 'System.AssignedTo')?.displayName || field(item, 'System.AssignedTo')}`, '', field(item, 'System.Description') || '(no description)', '', `Acceptance criteria: ${field(item, 'Microsoft.VSTS.Common.AcceptanceCriteria') || '(none)'}`].join('\n'); }
function renderPr(pr, threads = []) { return [`Pull request !${pr.pullRequestId || pr.id}`, pr.title, `Status: ${pr.status || ''}`, `Author: ${pr.createdBy?.displayName || ''}`, '', pr.description || '(no description)', '', `Threads: ${threads.length}`].join('\n'); }
module.exports = { renderBoard, renderWorkItem, renderPr };
