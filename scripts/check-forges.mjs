// Verify public GitLab and Codeberg mirrors using their public APIs.
// Never mark a guessed URL as confirmed based on its format alone.
import fs from 'node:fs/promises';

const OWNER = 'luizbizzio';
const GITLAB_OWNER = 'luizbizzio1';
const OUTPUT = new URL('../public/forges.json', import.meta.url);
const hosts = {gitlab: 'gitlab.com', codeberg: 'codeberg.org'};
const forgeOwners = {gitlab: GITLAB_OWNER, codeberg: OWNER};

let saved;
try { saved = JSON.parse(await fs.readFile(OUTPUT, 'utf8')); }
catch { saved = {version: 1, verified: {gitlab: {}, codeberg: {}}}; }
if (!saved.verified || typeof saved.verified !== 'object')
  saved.verified = {gitlab: {}, codeberg: {}};

async function getJSON(url, timeout = 9500) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeout),
      headers: {Accept: 'application/json', 'User-Agent': 'luizbizzio-hub-mirror-check/1.0'}
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn('[FETCH-SKIP]', new URL(url).hostname, error.message);
    return null;
  }
}
const isOwnMirror = (candidate, forge, repo) => {
  if (!candidate || typeof candidate !== 'string') return false;
  try {
    const u = new URL(candidate);
    const expected = '/' + forgeOwners[forge] + '/' + repo;
    return u.protocol === 'https:' && u.hostname === hosts[forge] &&
      decodeURIComponent(u.pathname).replace(/\/$/, '').toLowerCase() === expected.toLowerCase();
  } catch { return false; }
};
const data = await getJSON('https://api.github.com/users/' + OWNER + '/repos?per_page=100&type=owner');
if (!Array.isArray(data) || !data.length) {
  console.warn('GitHub API unavailable: preserving the last committed repository catalog and mirrors.');
  process.exit(0);
}
const names = data
  .filter(item => item && item.private === false && item.name !== OWNER &&
    /^[a-zA-Z0-9._-]+$/.test(item.name))
  .map(item => item.name);
const verified = {gitlab: {...(saved.verified.gitlab || {})}, codeberg: {...(saved.verified.codeberg || {})}};
let found = 0;

// Keep traffic moderate and avoid requiring any access tokens.
const concurrency = 4;
let cursor = 0;
async function worker() {
  while (cursor < names.length) {
    const repo = names[cursor++];
    const encoded = encodeURIComponent(GITLAB_OWNER + '/' + repo);
    const [gitlab, codeberg] = await Promise.all([
      getJSON('https://gitlab.com/api/v4/projects/' + encoded),
      getJSON('https://codeberg.org/api/v1/repos/' + OWNER + '/' + encodeURIComponent(repo))
    ]);
    const gitlabURL = gitlab?.web_url;
    const codebergURL = codeberg?.html_url;
    if (gitlab && gitlab.visibility === 'public' && isOwnMirror(gitlabURL, 'gitlab', repo) &&
      String(gitlab.path_with_namespace || '').toLowerCase() === (GITLAB_OWNER + '/' + repo).toLowerCase()) {
      verified.gitlab[repo] = gitlabURL;
      console.log('[CONFIRMED] GitLab', repo);
      found++;
    }
    if (codeberg && codeberg.private !== true && isOwnMirror(codebergURL, 'codeberg', repo) &&
      String(codeberg.full_name || '').toLowerCase() === (OWNER + '/' + repo).toLowerCase()) {
      verified.codeberg[repo] = codebergURL;
      console.log('[CONFIRMED] Codeberg', repo);
      found++;
    }
  }
}
await Promise.all(Array.from({length: Math.min(concurrency, names.length)}, () => worker()));

const stable = {version: 1, verified: {
  gitlab: Object.fromEntries(Object.entries(verified.gitlab).sort(([a],[b])=>a.localeCompare(b))),
  codeberg: Object.fromEntries(Object.entries(verified.codeberg).sort(([a],[b])=>a.localeCompare(b)))
}};
const json = JSON.stringify(stable, null, 2) + '\n';
await fs.writeFile(OUTPUT, json);
const count = Object.values(stable.verified).reduce((n, value) => n + Object.keys(value).length, 0);
console.log('Public GitHub projects checked:', names.length);
console.log('Public mirrors found in this scan:', found);
console.log('Total verified mirror links:', count);
console.log('All other destinations stay as marked, unverified fallback paths.');

// The static catalog is the source of truth for site visitors.
 // This workflow updates it only after a successful GitHub fetch.
const metaFile = new URL('../public/project-metadata.json', import.meta.url);
let previous = {};
try {
  const cached = JSON.parse(await fs.readFile(metaFile, 'utf8'));
  previous = cached.repos || {};
} catch {}
const repos = data.filter(item =>
  item && item.private === false && item.name !== OWNER &&
  item.name !== 'luizbizzio.com' && /^[a-zA-Z0-9._-]+$/.test(item.name));
const metadata = {
  version: 2,
  source: 'Public GitHub descriptions, creation dates and last pushes cached for offline API independence',
  updatedAt: new Date().toISOString(),
  repos: Object.fromEntries(repos.map(item => [item.name,{
    created: item.created_at || previous[item.name]?.created || '',
    updated: item.pushed_at || item.updated_at || previous[item.name]?.updated || '',
    description: item.description || previous[item.name]?.description || '',
    archived: !!item.archived
  }]).sort(([a],[b]) => a.localeCompare(b)))
};
await fs.writeFile(metaFile, JSON.stringify(metadata,null,2) + '\n');
console.log('Local official GitHub descriptions and metadata refreshed:',repos.length);
