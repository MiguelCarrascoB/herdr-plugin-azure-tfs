const { URL, URLSearchParams } = require('node:url');

function authHeader(pat) { return `Basic ${Buffer.from(`:${pat}`, 'utf8').toString('base64')}`; }
function parseTfsUrl(input) {
  const u = new URL(input); const parts = u.pathname.split('/').filter(Boolean);
  const wi = parts.indexOf('_workitems'); const pr = parts.indexOf('_git');
  if (wi >= 2 && parts[wi + 1] === 'edit' && /^\d+$/.test(parts[wi + 2] || ''))
    return { kind: 'workItem', collection: parts[wi - 2], project: parts[wi - 1], id: Number(parts[wi + 2]) };
  if (pr >= 2 && parts[pr + 2] === 'pullrequest' && /^\d+$/.test(parts[pr + 3] || ''))
    return { kind: 'pullRequest', collection: parts[pr - 2], project: parts[pr - 1], repository: parts[pr + 1], id: Number(parts[pr + 3]) };
  return null;
}
function wiqlQuery(project) { return `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo] FROM WorkItems WHERE [System.TeamProject] = '${project.replace(/'/g, "''")}' AND [System.AssignedTo] = @Me AND [System.State] <> 'Closed' ORDER BY [System.ChangedDate] DESC`; }
class TfsClient {
  constructor(c, fetchImpl = globalThis.fetch) { this.c = c; this.fetch = fetchImpl; }
  url(pathname, query = {}) { const u = new URL(`${this.c.baseUrl}/${this.c.collection}/${this.c.project}/_apis/${pathname.replace(/^\//, '')}`); u.search = new URLSearchParams({ ...query, 'api-version': this.c.apiVersion }); return u; }
  async request(method, pathname, body, query) {
    const response = await this.fetch(this.url(pathname, query), { method, headers: { Authorization: authHeader(this.c.pat), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!response.ok) throw new Error(`TFS ${response.status}: ${typeof data === 'string' ? data : data?.message || response.statusText}`);
    return data;
  }
  async workItem(id) { return this.request('GET', `wit/workitems/${id}`, undefined, { '$expand': 'all' }); }
  async workItems(ids) { if (!ids.length) return { value: [] }; return this.request('GET', 'wit/workitems', undefined, { ids: ids.join(','), '$expand': 'fields' }); }
  async queryWorkItems() { const result = await this.request('POST', 'wit/wiql', { query: wiqlQuery(this.c.project) }); return this.workItems((result.workItems || []).map(x => x.id)); }
  async pullRequests() { return this.request('GET', 'git/pullrequests', undefined, { 'searchCriteria.status': 'active', '$top': '50' }); }
  async pullRequest(id, repository) { return this.request('GET', `git/repositories/${encodeURIComponent(repository)}/pullrequests/${id}`); }
  async threads(id, repository) { return this.request('GET', `git/repositories/${encodeURIComponent(repository)}/pullrequests/${id}/threads`); }
  async commentWorkItem(id, content) { return this.request('PATCH', `wit/workitems/${id}`, [{ op: 'add', path: '/fields/System.History', value: content }], { '$expand': 'all' }); }
  async commentPullRequest(id, repository, content) { return this.request('POST', `git/repositories/${encodeURIComponent(repository)}/pullrequests/${id}/threads`, { comments: [{ parentCommentId: 0, content, commentType: 'text' }], status: 'active' }); }
}
module.exports = { TfsClient, authHeader, parseTfsUrl, wiqlQuery };
