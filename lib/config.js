const fs = require('node:fs');
const path = require('node:path');

function readDotEnv(dir) {
  const file = path.join(dir, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
    .map(line => line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/))
    .filter(Boolean).map(([, key, value]) => [key, value.replace(/^['"]|['"]$/g, '')]));
}

function config() {
  const values = { ...readDotEnv(process.env.HERDR_PLUGIN_CONFIG_DIR || process.cwd()), ...process.env };
  const required = ['TFS_BASE_URL', 'TFS_COLLECTION', 'TFS_PROJECT', 'TFS_PAT'];
  for (const key of required) if (!values[key]) throw new Error(`Missing ${key}; configure .env in HERDR_PLUGIN_CONFIG_DIR`);
  return { baseUrl: values.TFS_BASE_URL.replace(/\/$/, ''), collection: values.TFS_COLLECTION,
    project: values.TFS_PROJECT, pat: values.TFS_PAT, apiVersion: values.AZURE_TFS_API_VERSION || '6.0' };
}
module.exports = { config, readDotEnv };
