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
    // Atlas must render using local Three.js even with the public CDN blocked.
    await page.route('https://cdn.jsdelivr.net/**', route => route.abort());
    await page.goto(origin + '/', {waitUntil: 'domcontentloaded'});
    await page.waitForFunction(() => window.HubDirectory?.sites().length === 8);
    return {page, failures, apiCalls};
  }

  const desktop = await setup(1440, 900);
  const {page} = desktop;
  const projects = page.locator('#projectsList .repository-entry');
  const pinned = page.locator('#pinnedProjects .pinned-project');
  const sourceNames = ['GitHub', 'GitLab', 'Codeberg'];
  assert.equal(await page.locator('main h1').innerText(), 'Luiz Bizzio');
  assert.equal(await page.locator('.profile-handle').innerText(), '@luizbizzio');
  assert.deepEqual(await pinned.locator('h3').allTextContents(),
    ['CodePuff', 'URLForge', 'ScanDeck', 'Windhawk Inspector']);
  assert.equal(await projects.count(), 32);
  assert.equal(await page.locator('#viewList').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#projectsTab').getAttribute('aria-selected'), 'true');
  assert(await page.locator('#atlasView').isHidden());
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
  for (const card of await pinned.all()) {
    assert.deepEqual(await card.locator('a.source-link').allTextContents(), sourceNames);
    await card.locator('img[data-sources]').evaluate(img => img.decode());
  }

  const urlforge = projects.filter({has: page.getByRole('heading', {name: 'URLForge', exact: true})});
  assert.equal(await urlforge.locator('.repository-visit').getAttribute('href'), 'https://uf.do/');
  assert.equal(await projects.locator('.repository-visit').count(), 8);
  await pinned.getByRole('button', {name:'URLForge', exact:true}).click();
  assert(await page.locator('#previewDialog').isVisible());
  assert.equal(await page.locator('#previewTitle').innerText(), 'URLForge');
  assert.equal(await page.locator('#detailLinks .detail-primary').getAttribute('href'), 'https://uf.do/');
  assert.deepEqual(await page.locator('#detailLinks a.source-link').allTextContents(), sourceNames);
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
  await page.reload();
  await page.waitForFunction(() => window.HubDirectory?.sites().length === 8);
  assert.equal(await projects.count(), 8, 'The Websites deep link still works');

  await page.locator('#viewAtlas').click();
  assert(await page.locator('#atlasView').isVisible(), 'Showcase is an accessible secondary view');
  assert.equal(await page.locator('#viewAtlas').getAttribute('aria-pressed'), 'true');
  await page.locator('#atlasCanvas canvas.atlas-webgl').waitFor({state: 'visible', timeout: 18000});
  await page.waitForFunction(() => {
    const state = window.HubAtlas?.debug?.();
    return state?.hasTexture && state?.textureTint === 'ffffff';
  }, null, {timeout: 10000});
  assert.equal(await page.evaluate(() => window.HubAtlas.debug().textureTint), 'ffffff',
    'Original screenshots must not be darkened by the fallback material color');
  const initialStudio=await page.evaluate(() => window.HubAtlas.debug());
  assert.equal(initialStudio.sceneStyle, 'rounded-arc',
    'The carousel must use the new Three.js studio scene');
  // Both scenes must be fully prepared in the same WebGL renderer.
  await page.waitForFunction(() => {
    const debug=window.HubAtlas?.debug?.();
    return debug?.collectionStatus?.length===2 &&
      debug.collectionStatus.every(collection=>
        collection.prepared && collection.loadedImages===3);
  },null,{timeout:30000});
  await page.locator('#atlasCanvas canvas.atlas-webgl')
    .evaluate(canvas=>{canvas.dataset.persistCheck='same-webgl-context';});
  for(const tab of ['projects','sites','projects','sites']) {
    await page.locator(tab==='sites'?'#sitesTab':'#projectsTab').click();
    const debug=await page.evaluate(()=>window.HubAtlas.debug());
    assert.equal(debug.currentTab,tab,
      'Switching 3D tabs must instantly activate a pre-rendered collection');
    assert.equal(debug.sceneCount,2,
      'Both tabs stay prepared in one Three.js scene');
    assert(debug.hasTexture && debug.selectedFrame?.imageWidth>=1700,
      'The incoming tab must show its actual high-resolution screenshot');
    assert.equal(await page.locator('#atlasCanvas canvas.atlas-webgl')
      .getAttribute('data-persist-check'),'same-webgl-context',
      'Switching tabs must never replace or restart the WebGL canvas');
    assert.equal(await page.locator('#atlasCanvas .atlas-loading').count(),0,
      'No empty loading placeholder should flash during tab changes');
  }
  assert.equal(await page.locator('#atlasTitle').innerText(),'ScanDeck',
    'The original Website scene must retain its selected project');
  assert.equal(initialStudio.hoverIsStatic,true,
    'Hover must never lift or move any carousel frame');
  assert.equal(initialStudio.reflectiveFloor,true,
    'Studio floor reflections must use a real Three.js alpha-masked mesh');
  assert(initialStudio.rendererDpr >= 1.8,
    'Desktop canvas must be supersampled for sharp screenshot edges');
  assert(initialStudio.selectedFrame?.reflectedMapShared,
    'Reflections must reuse the exact image texture rather than duplicate GPU resources');
  await page.waitForFunction(() =>
    window.HubAtlas.debug().selectedFrame?.imageWidth >= 3000,
    null,{timeout:15000});
  const canvasToHover=page.locator('#atlasCanvas canvas.atlas-webgl');
  const beforeHover=await page.evaluate(() => ({
    y:window.HubAtlas.debug().selectedFrame.y,
    z:window.HubAtlas.debug().selectedFrame.z,
    scale:window.HubAtlas.debug().selectedFrame.scale
  }));
  const hoverRect=await canvasToHover.boundingBox();
  await page.mouse.move(hoverRect.x+hoverRect.width/2,hoverRect.y+hoverRect.height/2);
  await page.waitForTimeout(100);
  const afterHover=await page.evaluate(() => ({
    y:window.HubAtlas.debug().selectedFrame.y,
    z:window.HubAtlas.debug().selectedFrame.z,
    scale:window.HubAtlas.debug().selectedFrame.scale
  }));
  assert.deepEqual(afterHover,beforeHover,
    'Pointer hover must not trigger any 3D jump or vertical movement');
  assert.equal(initialStudio.selectedFrame?.geometry, 'ShapeGeometry',
    'The featured screenshot must be a rounded Three.js mesh, not a flat billboard');
  assert(initialStudio.selectedFrame?.shadow && initialStudio.selectedFrame?.bevel,
    'Screenshot frame must have geometry depth and soft contact shadows');
  assert(initialStudio.selectedFrame.z > initialStudio.neighborFrame.z + 1.5,
    'The selected card should sit visibly in front of the curved side cards');
  assert(Math.abs(initialStudio.neighborFrame.yaw) > .25,
    'Neighboring cards must actually turn in 3D');
  assert.deepEqual(await page.evaluate(() => window.HubAtlas.debug().overlays), [],
    '3D websites must not place a floating favicon above the image');
  assert(await page.locator('#atlasFavicon').isVisible(),
    '3D website favicon belongs beside the title in the inspector');
  assert(await page.locator('#atlasFavicon').getAttribute('src') === './icons/scandeck.svg',
    'Right-hand website icon must come from the local icon collection');
  assert((await page.locator('#atlasCanvas canvas').evaluate(c => c.width)) >= 600,
    'Real WebGL canvas must be rendered, not an HTML fallback');
  assert.equal(await page.locator('#atlasPagination .atlas-marker').count(), 8,
    'Website Showcase must have eight selectable positions');
  assert(await page.locator('#atlasPagination').isVisible(),
    'Carousel position dots should be visible outside the framed 3D scene');
  assert.equal(await page.locator('#directoryPanel #atlasPagination').count(),0,
    'Pagination must be outside directoryPanel, not just outside the 3D stage');
  assert(await page.locator('#atlasPagination').evaluate(nav =>
    nav.parentElement?.classList.contains('directory') &&
    nav.previousElementSibling?.id === 'directoryPanel'),
    'Pagination must be an immediate sibling directly below directoryPanel');
  assert(await page.locator('#atlasPagination').evaluate(node => {
    const panel=document.querySelector('#directoryPanel').getBoundingClientRect();
    const stage=document.querySelector('#atlasStage').getBoundingClientRect();
    const dots=node.getBoundingClientRect();
    return dots.top>=panel.bottom+3 && dots.bottom<=document.documentElement.scrollHeight+2 &&
      Math.abs((dots.left+dots.right-stage.left-stage.right)/2)<2 &&
      Math.abs((dots.left+dots.right-panel.left-panel.right)/2)>20;
  }), 'Desktop indicators must be below the panel and centered under only the left 3D stage');
  assert.equal(await page.locator('#atlasPagination .atlas-marker[aria-current="page"]').count(),1,
    'The current project should highlight exactly one navigation dot');
  await page.locator('#atlasPagination .atlas-marker[data-index="1"]').click();
  assert.equal(await page.locator('#atlasTitle').innerText(),'MyPixel',
    'Clicking a dot must navigate to the corresponding project');
  await page.locator('#atlasPagination .atlas-marker[data-index="0"]').click();
  assert.equal(await page.locator('#atlasTitle').innerText(),'ScanDeck',
    'Clicking the previous dot must move the carousel back');
  await page.waitForFunction(() => document.querySelector('#atlasCreated')?.textContent !== '—');
  assert.match(await page.locator('#atlasCreated').textContent(), /2026/);
  assert(await page.locator('#atlasCreated').isHidden(),
    'Dates belong in the detail dialog instead of the 3D inspector');
  assert.equal(await page.locator('#atlasView .atlas-counter').count(), 1,
    '3D gallery should show its position once');
  assert(await page.locator('#atlasFavicon').isVisible(),
    'The selected website must keep its identity in the right-hand inspector');
  assert(await page.locator('#atlasView').evaluate(el =>
    el.getBoundingClientRect().height>=620),
    'The larger 3D showcase should use at least 620px on desktop');
  assert(await page.locator('#atlasView').evaluate(node =>
    node.getBoundingClientRect().bottom < document.documentElement.scrollHeight+2),
    '3D must end above the bottom of the page, not stretch to the footer');
  const atlasHeight = await page.locator('#atlasView').evaluate(node => node.getBoundingClientRect().height);
  const inspectorHeight = await page.locator('#atlasInspector').evaluate(node => node.getBoundingClientRect().height);
  await page.locator('#atlasSelect').selectOption('2');
  assert.equal(await page.locator('#atlasView').evaluate(node => node.getBoundingClientRect().height),
    atlasHeight, 'Atlas height must not change for longer project titles');
  assert.equal(await page.locator('#atlasInspector').evaluate(node => node.getBoundingClientRect().height),
    inspectorHeight, 'Inspector height must stay fixed when navigating');
  await page.locator('#atlasSelect').selectOption('0');
  await page.locator('#atlasNext').click();
  await page.waitForFunction(() => document.querySelector('#atlasCanvas')?.dataset.settledIndex === '1');
  assert(await page.locator('#atlasProgress').isHidden(),
    'No duplicated progress indicator below the artwork');
  assert.equal(await page.locator('#atlasTitle').innerText(), 'MyPixel',
    'Next should switch the 3D featured project');
  await page.locator('#atlasPrev').click();
  assert.equal(await page.locator('#atlasTitle').innerText(), 'ScanDeck');
  await page.locator('#atlasCanvas canvas.atlas-webgl').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#atlasTitle').innerText(), 'MyPixel',
    'Keyboard arrow should navigate 3D cards');
  await page.locator('#atlasSelect').selectOption('0');
  assert.equal(await page.locator('#atlasTitle').innerText(), 'ScanDeck');
  // Repeated Next clicks must advance the same continuous focus track.
  await page.locator('#atlasNext').click();
  const firstTarget=await page.evaluate(() => window.HubAtlas.debug().target);
  await page.locator('#atlasNext').click();
  const secondTarget=await page.evaluate(() => window.HubAtlas.debug().target);
  assert.equal(secondTarget-firstTarget,1,'Next must extend the in-progress animation');
  assert.equal(await page.locator('#atlasTitle').innerText(),'Windhawk Inspector');
  await page.waitForFunction(() =>
    document.querySelector('#atlasCanvas')?.dataset.settledIndex==='2',
    null,{timeout:4000});
  await page.locator('#atlasSelect').selectOption('0');
  const renderSize=await page.locator('#atlasCanvas canvas').evaluate(canvas =>
    ({width:canvas.width,height:canvas.height}));
  assert(renderSize.height > 380, '3D stage must remain a substantial visual area');
  assert(await page.locator('#pinnedSection').isHidden());
  assert.deepEqual(await page.locator('#atlasRepositoryLinks a').allTextContents(), sourceNames);
  assert.equal(await page.locator('#atlasVisit').getAttribute('href'), 'https://scandeck.luizbizzio.com/');
  await page.locator('#projectsTab').click();
  assert.equal(await page.locator('#atlasSelect option').count(), 33,
    'All locally saved public repositories must appear in Showcase');
  assert(await page.locator('#atlasView').evaluate(el =>
    el.getBoundingClientRect().height>=620),
    'The Projects 3D gallery should have the same expanded stage');
  assert.equal(await page.locator('#atlasPagination .atlas-marker').count(), 32,
    'Projects must expose an indicator for every repository');
  assert.equal(await page.locator('#atlasPagination button.atlas-marker').count(),32,
    'Desktop repository markers should remain clickable');
  assert(await page.locator('#atlasPagination').isVisible(),
    'Projects must show the same outside pagination as Websites');
  assert.equal(await page.locator('#atlasPagination .atlas-marker[aria-current="page"]').count(),1,
    'Repository pagination must indicate one current item');
  assert(await page.locator('#atlasPagination').evaluate(nav => {
    const rail = nav.getBoundingClientRect();
    const stage = document.querySelector('#atlasStage').getBoundingClientRect();
    const markers = [...nav.querySelectorAll('.atlas-marker')]
      .map(marker => marker.getBoundingClientRect());
    return markers.length === 32 &&
      Math.abs((rail.left + rail.right - stage.left - stage.right) / 2) < 2 &&
      markers.every(box =>
        Math.abs(box.top - markers[0].top) < 1 &&
        box.left >= rail.left - 1 && box.right <= rail.right + 1);
  }), 'All repository dots must occupy one centered, horizontal row');
  assert.deepEqual(await page.evaluate(() => window.HubAtlas.debug().overlays),
    [], 'Repository 3D cards must display clean, unobstructed images');
  assert(await page.locator('#atlasFavicon').isVisible(), 'The selected project has a website favicon');
  const emojisIndex=await page.evaluate(() =>
    [...document.querySelectorAll('#atlasSelect option')]
      .find(option=>option.textContent==='Emojis')?.value);
  assert(emojisIndex!=null,'Emojis should exist in Projects');
  await page.locator('#atlasSelect').selectOption(emojisIndex);
  assert.equal(await page.locator('#atlasTitle').innerText(),'Emojis');
  assert(await page.locator('#atlasDescription').evaluate(node=>{
    const css=getComputedStyle(node);
    return css.webkitLineClamp==='none' &&
      css.overflowY==='auto' &&
      node.textContent.includes('commercial projects');
  }), 'Long project descriptions must not use line clamping or hidden overflow');
  await page.locator('#atlasSelect').selectOption('0');
  assert.deepEqual(await page.locator('#atlasRepositoryLinks a').allTextContents(), sourceNames);
  await page.locator('#atlasSelect').selectOption('19');
  assert.equal(await page.locator('#atlasPagination .atlas-marker[aria-current="page"]').getAttribute('data-index'),'19',
    'The selected project must be highlighted among all 32 stable indicators');
  await page.waitForFunction(() => document.querySelector('#atlasCanvas')?.dataset.settledIndex === '19',
    null, {timeout: 3500});
  assert.equal(await page.locator('#atlasSelectedIndex').innerText(), '20 / 32',
    'Inspector should remain synchronized with the centered 3D project');
  assert(await page.evaluate(() => window.HubAtlas.debug().activeTextures <= 14),
    'Showcase should not retain all 32 project textures in GPU memory');
  await page.locator('#atlasSelect').selectOption('0');
  await page.waitForFunction(() => document.querySelector('#atlasCanvas')?.dataset.settledIndex === '0',
    null, {timeout: 3500});
  await page.locator('#atlasSelect').selectOption('10');
  assert((await page.locator('#atlasTitle').innerText()).length > 0);
  await page.locator('#atlasExplore').click();
  assert(await page.locator('#previewDialog').isVisible(),
    '3D Atlas project selection should open the same project details');
  await page.keyboard.press('Escape');
  await page.locator('#viewList').click();
  assert(await page.locator('#projectsList').isVisible());
  assert(await page.locator('#pinnedSection').isVisible());
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
  assert(await m.locator('#viewList').isVisible());
  assert.equal(await m.locator('#pinnedProjects .pinned-project').count(), 4);
  assert.equal(await m.locator('#projectsList .repository-entry').count(), 32);
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  assert(await m.locator('#projectsList a.source-link').first().evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.height >= 24 && rect.width >= 24;
  }), 'All mobile source links should be tappable');
  await m.locator('#sitesTab').click();
  await m.locator('#viewAtlas').click();
  await m.locator('#atlasCanvas canvas.atlas-webgl').waitFor({state:'visible',timeout:18000});
  await m.locator('#atlasExplore').click();
  assert(await m.locator('#previewDialog').isVisible());
  await m.keyboard.press('Escape');
  await m.locator('#projectsTab').click();
  assert.equal(await m.locator('#atlasSelect option').count(), 33);
  assert.equal(await m.locator('#atlasPagination .atlas-marker').count(), 32);
  assert.equal(await m.locator('#atlasPagination button').count(), 0);
  assert.equal(await m.locator('#atlasPagination').getAttribute('aria-hidden'), 'true');
  await m.locator('#atlasSelect').selectOption({label:'Emojis'});
  assert(await m.locator('#atlasVisit').isHidden());
  assert.deepEqual(await m.locator('#atlasRepositoryLinks a').allTextContents(), sourceNames);
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
  assert.deepEqual(mobile.failures, [], 'Mobile runtime errors');
  assert.deepEqual(mobile.apiCalls, [], 'Mobile catalog must work without GitHub API requests');
  await m.close();

  // Graceful non-WebGL path: no broken loading spinner when the local module fails.
  const fallback = await browser.newPage({viewport: {width: 1000,height:800}});
  await fallback.route('https://api.github.com/**', route => route.abort());
  await fallback.route('**/assets/vendor/three.module.js', route => route.abort());
  await fallback.goto(origin+'/#sites',{waitUntil:'domcontentloaded'});
  await fallback.locator('#viewAtlas').click();
  await fallback.locator('#atlasCanvas .atlas-fallback-node').first().waitFor({timeout:15000});
  assert.equal(await fallback.locator('.atlas-fallback-node').count(), 8);
  await fallback.locator('.atlas-fallback-node').nth(1).click();
  assert.equal(await fallback.locator('#atlasTitle').innerText(),'MyPixel');
  await fallback.close();

  console.log('PASS: UX audit, offline covers, accessible navigation, profile, pinned projects, source mirrors, 3D texture bounds, keyboard, desktop and mobile');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
