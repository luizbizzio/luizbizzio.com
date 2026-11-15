// Refresh public repository data on GitHub Actions, not in visitors' browsers.
// The published site reads only this committed snapshot.
import fs from 'node:fs/promises';
import path from 'node:path';

const owner = 'luizbizzio';
const file = path.resolve('public/project-metadata.json');
const existing = JSON.parse(await fs.readFile(file, 'utf8'));
const repos = Object.fromEntries(Object.entries(existing.repos || {})
  .filter(([slug]) => slug !== 'windhawk-mods' && /^[a-z0-9._-]+$/i.test(slug)));
const token = process.env.GITHUB_TOKEN || '';
const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'LuizBizzio-Portfolio-Snapshot',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(token ? {Authorization: 'Bearer ' + token} : {})
};
async function get(url) {
  const response = await fetch(url, {
    headers, signal: AbortSignal.timeout(18000)
  });
  if (!response.ok) throw new Error('GitHub API HTTP ' + response.status);
  return response.json();
}
const names = Object.keys(repos);
let next = 0, updated = 0, failed = 0;
await Promise.all(Array.from({length: 5}, async () => {
  while (next < names.length) {
    const name = names[next++];
    const url = 'https://api.github.com/repos/' + owner + '/' + encodeURIComponent(name);
    try {
      const detail = await get(url);
      const base = repos[name] || {};
      const revision = {
        ...base,
        created: detail.created_at || base.created || '',
        updated: detail.pushed_at || base.updated || '',
        description: detail.description || base.description || '',
        archived: Boolean(detail.archived)
      };
      try {
        const releases = await get(url + '/releases?per_page=15');
        const published = Array.isArray(releases) ? releases.filter(item =>
          item && !item.draft && item.tag_name && item.published_at) : [];
        published.sort((a, b) => b.published_at.localeCompare(a.published_at));
        const latest = published[0];
        revision.release = latest?.tag_name || '';
        revision.releasePublishedAt = latest?.published_at || '';
        revision.releaseChecked = true;
      } catch (error) {
        // Keep the last verified release, not a made-up version.
        console.warn('[RELEASE-KEPT]', name, error.message);
      }
      repos[name] = revision;
      updated++;
    } catch (error) {
      console.warn('[METADATA-KEPT]', name, error.message);
      failed++;
    }
  }
}));
const sorted = Object.fromEntries(Object.entries(repos)
  .sort((a,b) => a[0].localeCompare(b[0])));
const nextManifest = {
  version: 3,
  source: 'Locally cached public GitHub repository and release metadata',
  updatedAt: existing.updatedAt || '',
  repos: sorted
};
const previousComparable = JSON.stringify({
  version: existing.version, repos: existing.repos,
  source: existing.source
});
const nextComparable = JSON.stringify({
  version: nextManifest.version, repos: nextManifest.repos,
  source: nextManifest.source
});
if (previousComparable !== nextComparable) {
  nextManifest.updatedAt = new Date().toISOString();
  await fs.writeFile(file, JSON.stringify(nextManifest, null, 2) + '\n');
}
console.log('Repository metadata sync:', updated, 'checked,', failed,
  'unavailable,', names.length, 'repositories,',
  previousComparable !== nextComparable ? 'snapshot updated' : 'no changes');
