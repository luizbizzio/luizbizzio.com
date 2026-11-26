// Browser regression tests for the static directory. No backend or framework required.
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const origin = 'http://127.0.0.1:8123';
const server = spawn('python3', ['-m', 'http.server', '8123', '--bind', '127.0.0.1', '--directory', 'public'], {
  cwd: process.cwd(), stdio: 'ignore'
});
let browser;
try {
  let healthy = false;
  for (let i = 0; i < 35; i++) {
    try {
      const response = await fetch(origin + '/sites.json');
      if (response.ok) { healthy = true; break; }
    } catch {}
    await delay(200);
  }
  assert(healthy, 'Local static server did not start');
  browser = await chromium.launch({headless: true, args: ['--no-sandbox']});

  async function setup(width, height) {
    const page = await browser.newPage({viewport: {width, height}, colorScheme: 'dark'});
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    // All pages must load from Cloudflare assets, with no runtime GitHub API calls.
    const apiCalls = [];
    await page.route('https://api.github.com/**', route => {
      apiCalls.push(route.request().url()); route.abort();
    });
    await page.route('https://raw.githubusercontent.com/**', route => {
      apiCalls.push(route.request().url()); route.abort();
    });
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await page.goto(origin + '/', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.HubDirectory?.sites().length === 8);
    return {page, failures, apiCalls};
  }

  const desktop = await setup(1440, 900);
  const {page} = desktop;
  const projects = page.locator('#projectsList .repository-entry');
  const sourceNames = ['GitHub', 'GitLab', 'Codeberg'];
  assert.equal(await page.locator('main h1').innerText(), 'Luiz Bizzio');
  assert.equal(await page.locator('.profile-handle').innerText(), '@luizbizzio');
  assert(await page.locator('.profile-intro').evaluate(sidebar =>
    sidebar.getBoundingClientRect().right < document.querySelector('.profile-content').getBoundingClientRect().left));
  assert.equal(await page.locator('#pinnedProjects, #viewAtlas, #atlasView').count(), 0);
  assert.equal(await page.locator('#sortSelect').inputValue(), 'recent');
  assert.equal(await projects.count(), 32);
  assert.equal(await page.locator('#projectsTab').getAttribute('aria-selected'), 'true');
  assert.equal(await projects.getByRole('button', {name:'Gitmirror', exact:true}).count(), 0);

  await page.waitForFunction(() => document.querySelectorAll('#projectsList a.source-link').length === 96);
  const repos = await projects.evaluateAll(rows => rows.map(row => ({
    name: row.querySelector('[data-project]').dataset.project,
    links: [...row.querySelectorAll('a[data-forge]')].map(link => [link.textContent, link.hostname, link.pathname])
  })));
  assert.equal(new Set(repos.map(repo => repo.name.toLowerCase())).size, 32, 'One row per project');
  for (const {name, links} of repos) {
    assert.deepEqual(links.map(([label]) => label), sourceNames);
    assert.deepEqual(links.map(([,host]) => host), ['github.com', 'gitlab.com', 'codeberg.org']);
    assert(links.every(([, , path]) => path.toLowerCase() === '/luizbizzio/' + name.toLowerCase()));
  }
  const previewSlugs = await projects.locator('.repository-preview').evaluateAll(
    previews => previews.map(preview => preview.dataset.project).sort());
  assert.deepEqual(previewSlugs, [
    'codepuff', 'mypixel', 'scandeck', 'uninstall-here', 'urlforge', 'voicebuffer', 'windhawk-inspector'
  ]);
  const codepuffImage = projects.locator('.repository-preview[data-project="codepuff"] img');
  assert.equal(await codepuffImage.getAttribute('src'), './previews/covers/codepuff.png');
  await codepuffImage.evaluate(img => img.decode());
  const releases = await page.evaluate(async () => {
    const response = await fetch('./project-metadata.json');
    const {repos} = await response.json();
    return Object.entries(repos)
      .filter(([name, entry]) => name !== 'windhawk-mods' && entry.release && Date.parse(entry.releasePublishedAt))
      .sort((a, b) => Date.parse(b[1].releasePublishedAt) - Date.parse(a[1].releasePublishedAt) ||
        a[0].localeCompare(b[0])).slice(0, 3);
  });
  await page.locator('#recentReleases').waitFor({state: 'visible'});
  assert.equal(await page.locator('.release-link').count(), 3);
  for (const [index, [name, entry]] of releases.entries()) {
    const release = page.locator('.release-link').nth(index);
    assert.equal(await release.locator('.release-repo').innerText(), name);
    assert.equal(await release.locator('.release-tag').innerText(), entry.release);
    assert.equal(await release.locator('time').getAttribute('datetime'), entry.releasePublishedAt);
    assert.equal(await release.getAttribute('href'), 'https://github.com/luizbizzio/' +
      encodeURIComponent(name) + '/releases/tag/' + encodeURIComponent(entry.release));
  }

  const urlforge = projects.filter({has: page.getByRole('heading', {name: 'urlforge', exact: true})});
  assert.equal(await urlforge.locator('.repository-visit').getAttribute('href'), 'https://uf.do/');
  assert.equal(await projects.locator('.repository-visit').count(), 8);
  await urlforge.getByRole('button', {name:'Open preview for URLForge', exact:true}).click();
  assert(await page.locator('#previewDialog').isVisible());
  assert.equal(await page.locator('#previewTitle').innerText(), 'URLForge');
  assert.equal(await page.locator('#detailLinks .detail-primary').getAttribute('href'), 'https://uf.do/');
  assert.deepEqual(await page.locator('#detailLinks a.source-link').allTextContents(), sourceNames);
  await page.locator('#previewArea img').evaluate(img => img.decode());
  await page.keyboard.press('Escape');

  assert.equal(await page.locator('.linkedin-link').getAttribute('href'), 'https://www.linkedin.com/in/luizbizzio/');
  assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{writeText:async value=>{window.__copiedEmailTest=value;}}
    });
  });
  await page.locator('#copyEmailButton').click();
  assert.equal(await page.evaluate(() => window.__copiedEmailTest),
    ['contact','@','luizbizzio','.com'].join(''));
  assert.equal(await page.locator('#emailCopyStatus').innerText(), 'Email copied!');

  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'searchInput');
  const search = page.locator('#searchInput');
  await search.fill('uf.do');
  assert.equal(await projects.count(), 1);
  await search.press('Enter');
  assert.equal(await page.locator('#previewTitle').innerText(), 'URLForge');
  await page.keyboard.press('Escape');
  await search.fill('no-matching-repository');
  assert(await page.locator('#emptyState').isVisible());
  await page.locator('#clearButton').click();
  assert.equal(await projects.count(), 32);
  await page.locator('#categorySelect').selectOption('Windhawk');
  assert(await projects.count() > 0 && await projects.count() < 32);
  assert((await projects.locator('.repository-category').allTextContents()).every(category => category === 'Windhawk'));
  await page.locator('#categorySelect').selectOption('All');
  await page.locator('#sortSelect').selectOption('name');
  const names = await projects.locator('h3').allTextContents();
  assert.deepEqual(names, [...names].sort((a,b) => a.localeCompare(b)));
  await page.locator('#projectsTab').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#sitesTab').getAttribute('aria-selected'), 'true');
  assert.equal(await projects.count(), 8);
  assert.equal(await projects.locator('a.source-link').count(), 24);
  assert.equal(await projects.locator('.repository-visit').count(), 8);
  assert(page.url().endsWith('#sites'));
  assert.equal(await page.locator('.release-link').count(), 3);
  await page.reload();
  await page.waitForFunction(() => window.HubDirectory?.sites().length === 8);
  assert.equal(await projects.count(), 8, 'The Websites deep link still works');

  await page.locator('#commandButton').click();
  for (const [query, label] of [['github','GitHub'], ['gitlab','GitLab'], ['codeberg','Codeberg']]) {
    await page.locator('#commandInput').fill('> ' + query + ' scandeck');
    assert.match(await page.locator('#commandResults').innerText(), new RegExp('Open ' + label + ' repository'));
  }
  await page.locator('#commandInput').fill('> recent');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#sortSelect').inputValue(), 'recent');
  assert.deepEqual(desktop.failures, [], 'Desktop runtime errors');
  assert.deepEqual(desktop.apiCalls, [], 'Catalog must work without GitHub API requests');
  await page.close();

  const mobile = await setup(390, 844);
  const m = mobile.page;
  assert(await m.locator('.profile-intro').evaluate(sidebar =>
    sidebar.getBoundingClientRect().bottom < document.querySelector('.profile-content').getBoundingClientRect().top));
  assert.equal(await m.locator('#projectsList .repository-entry').count(), 32);
  const releasesPanel = m.locator('#releasesPanel');
  assert.equal(await releasesPanel.getAttribute('open'), null);
  await releasesPanel.locator('summary').click();
  assert(await releasesPanel.locator('.release-link').first().isVisible());
  await releasesPanel.locator('summary').click();
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  assert(await m.locator('#projectsList a.source-link').first().evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.height >= 24 && rect.width >= 24;
  }), 'All mobile source links should be tappable');
  await m.locator('#sitesTab').click();
  assert.equal(await m.locator('#projectsList .repository-entry').count(), 8);
  assert.equal(await m.locator('#projectsList .repository-preview').count(), 8);
  const mypixel = m.getByRole('button', {name:'Open preview for MyPixel', exact:true});
  await mypixel.click();
  assert(await m.locator('#previewDialog').isVisible());
  assert.equal(await m.locator('#previewTitle').innerText(), 'MyPixel');
  await m.keyboard.press('Escape');
  assert.deepEqual(mobile.failures, [], 'Mobile runtime errors');
  assert.deepEqual(mobile.apiCalls, [], 'Mobile catalog must work without GitHub API requests');
  await m.close();

  console.log('PASS: profile layout, previews, releases, source mirrors, search, filters, details and mobile');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
