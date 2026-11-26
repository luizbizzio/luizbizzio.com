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
    await page.waitForFunction(() => document.querySelector('#sitesCount')?.textContent === '08');
    return {page, failures, apiCalls};
  }

  const desktop = await setup(1440, 900);
  const {page} = desktop;
  assert(await page.locator('.directory').evaluate(el=>
    el.getBoundingClientRect().width>=1320),
    'The expanded desktop catalog must fill more of the available screen');
  assert.equal((await page.locator('#viewGrid').innerText()).trim(), 'Grid');
  assert.equal((await page.locator('#viewAtlas').innerText()).trim(), '3D');
  assert.equal(await page.locator('#sitesGrid .site-card').count(), 8, 'Expected eight live websites');
  const urlforge = page.locator('#sitesGrid .site-card').filter({hasText: 'URLForge'});
  assert.equal(await urlforge.locator('a').getAttribute('href'), 'https://uf.do/');
  assert.equal(await urlforge.locator('.title-favicon').getAttribute('src'), './icons/urlforge.png');
  assert.equal(await urlforge.locator('img[data-sources]').getAttribute('src'), './previews/urlforge.jpg');
  assert.equal(await page.locator('#resultCount, #resetFilters, .section-meta').count(), 0,
    'Remove the redundant counter and clear-filter row from the DOM');
  assert.equal(await page.locator('#clearButton').innerText(), 'Show all',
    'Empty-state recovery stays available without the removed label');
  assert.equal(await page.locator('#projectsGrid .project-row').count(), 0, 'Project tab must be hidden initially');
  assert.equal(await page.locator('.portfolio-lead, .app-shell, .workspace-sidebar').count(), 0,
    'No old editorial or dashboard shell is allowed');
  assert.equal(await page.locator('main h1').count(), 1);
  assert.equal((await page.locator('main h1').innerText()).trim(), 'Index.');
  assert.equal(await page.locator('#themeToggle, .theme-toggle').count(), 0,
    'Dark-only site must have no light-mode toggle');
  assert(await page.evaluate(() =>
    getComputedStyle(document.documentElement).colorScheme === 'dark'),
    'The single supported color scheme is dark');
  assert(await page.locator('main h1').evaluate(node =>
    Number.parseFloat(getComputedStyle(node).fontSize) >= 40),
    'The enlarged Index heading should be readable on desktop');
  assert.equal(await page.locator('main .page-intro p').count(), 0,
    'Minimal work index has no redundant introductory copy');
  assert(await page.locator('#sitesGrid').isVisible(), 'Grid is the default experience');
  assert.equal(await page.locator('#viewGrid').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.header-links a.social-link').count(), 2,
    'Header should link directly to LinkedIn and GitHub');
  assert.equal(await page.locator('.linkedin-link').getAttribute('href'),
    'https://www.linkedin.com/in/luizbizzio/');
  assert.equal(await page.locator('.github-link').getAttribute('href'),
    'https://github.com/luizbizzio');
  assert.equal(await page.locator('#copyEmailButton').count(), 1);
  assert.equal(await page.locator('#copyEmailButton').getAttribute('type'), 'button');
  assert.equal(await page.locator('a[href^="mailto:"]').count(), 0,
    'Email must not be placed in a readable mailto link');
  assert.equal((await page.content()).includes(['contact','@','luizbizzio','.com'].join('')), false,
    'The full contact email must not appear in HTML source');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{writeText:async value=>{window.__copiedEmailTest=value;}}
    });
  });
  await page.locator('#copyEmailButton').click();
  assert.equal(await page.evaluate(() => window.__copiedEmailTest),
    ['contact','@','luizbizzio','.com'].join(''),
    'Clicking Email must copy the decoded address');
  assert.equal(await page.locator('#emailCopyStatus').innerText(), 'Email copied!',
    'Email copy must show clear confirmation');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'copyEmailButton',
    'Email copy must not open another page or change keyboard focus');
  assert.equal(await page.locator('#atlasView').isVisible(), false);
  assert(await page.locator('#sitesGrid .work-card .work-name button').first().isVisible(),
    'Each work item has one clear project title');
  assert.equal(await page.locator('#sitesGrid .work-eyebrow').count(), 0,
    'Categories are available in filters and details, not repeated on each card');
  assert.equal(await page.locator('main').getByText('DRAG TO BROWSE').count(), 0,
    'Do not put navigation instructions on the actual artwork');
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
  await page.locator('#viewGrid').click();
  assert(await page.locator('#sitesGrid').isVisible(), 'Gallery remains an option');
  assert(await page.locator('#atlasPagination').isHidden(),
    'Outside dots should hide when the Grid is selected');
  assert.equal(await page.locator('#sitesGrid .work-title-text').count(), 8,
    'Website names have one readable text label');
  assert.equal(await page.locator('#sitesGrid .title-favicon').count(), 8,
    'Every website must show its favicon immediately before the title');
  assert.equal(await page.locator('#sitesGrid .media-favicon').count(), 0,
    'Favicons no longer overlap Grid screenshots');
  assert.equal(await page.locator('#sitesGrid .work-sequence').count(), 0,
    'Minimal catalog must not show decorative index numbers');
  assert(await page.locator('#sitesGrid .site-card').first().evaluate(node =>
    parseFloat(getComputedStyle(node).borderTopWidth) === 1 &&
    node.querySelector('.work-media').getBoundingClientRect().right <
      node.querySelector('.work-content').getBoundingClientRect().right),
    'Compact cards use a single understated border and horizontal image/text layout');
  await page.waitForFunction(() => document.querySelector('#sitesGrid .site-card img[data-sources]')?.classList.contains('is-loaded'));
  assert.equal(await page.locator('#sitesGrid .site-card img[data-sources]').first().getAttribute('loading'),
    'eager', 'First screenshot should load eagerly when switching to Grid');
  assert(await page.locator('#sitesGrid .preview-window.has-image').first().evaluate(node =>
    getComputedStyle(node.querySelector('.preview-placeholder')).display === 'none'),
    'Loaded screenshots must hide the fallback title layer');
  await page.evaluate(() => window.scrollTo(0, 0));
  assert(await page.locator('#sitesGrid .site-card').first().evaluate(card => {
    const photo=card.querySelector('.work-media').getBoundingClientRect();
    const content=card.querySelector('.work-content').getBoundingClientRect();
    return photo.right <= content.left + 2 && photo.height >= 95 &&
      card.getBoundingClientRect().height >= 208 && 
      card.getBoundingClientRect().height <= 215;
  }), 'Windhawk-like entries need a compact horizontal thumbnail next to the title');
  assert.equal(await page.locator('#sitesGrid').evaluate(el =>
    getComputedStyle(el).gridTemplateColumns.trim().split(/\s+/).length), 2,
    'Desktop Grid should use two large media columns');
  assert(await page.locator('#sitesGrid .site-card').first().evaluate(card => {
    const icon = card.querySelector('.title-favicon').getBoundingClientRect();
    const name = card.querySelector('.work-title-text').getBoundingClientRect();
    return icon.right <= name.left + 1 &&
      Math.abs((icon.top + icon.bottom)/2 - (name.top + name.bottom)/2) < 12;
  }), 'Website favicon must sit directly to the left of its name');
  assert.equal(await page.locator('#sitesGrid .work-actions .work-detail').count(), 0,
    'No duplicate details button when title and image already open details');
  assert(await page.locator('#sitesGrid .work-actions .work-visit').first().evaluate(node =>
    node.textContent.trim().startsWith('Visit') &&
    node.getBoundingClientRect().height >= 29),
    'Website has one direct visit link');
  assert.equal(await page.locator('#sitesGrid .card-dates').count(), 0,
    'Dense project dates belong in the detail view instead of the Grid');
  const galleryHeights = await page.locator('#sitesGrid .site-card').evaluateAll(nodes =>
    nodes.map(node => Math.round(node.getBoundingClientRect().height)));
  assert(galleryHeights.every(h => h === galleryHeights[0]),
    'Every website card must remain exactly the same height');
  assert.equal(await page.locator('#sitesGrid .site-card .forge-link').count(), 0,
    'Website cards should not repeat repository links, available in details');
  assert.equal(await page.locator('#sitesGrid .work-media').count(), 8,
    'Grid must show eight real screenshot thumbnails');
  assert.equal(await page.locator('#sitesGrid .work-name button').count(), 8,
    'Each website should have one title that opens details');
  assert.equal(await page.locator('#sitesGrid .work-name .work-title-text').count(), 8,
    'Readable website titles must remain paired with the icon');
  await page.locator('#sitesTab').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#projectsTab').getAttribute('aria-selected'), 'true',
    'Tab arrows should switch between Websites and Projects');
  await page.keyboard.press('Home');
  assert.equal(await page.locator('#sitesTab').getAttribute('aria-selected'), 'true');
  await page.keyboard.press('/');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'searchInput',
    'Slash must focus the directory search');
  await page.locator('#searchInput').fill('not-a-real-project');
  assert(await page.locator('#emptyState').isVisible(), 'Missing result should show an empty state');
  assert.match(await page.locator('#emptyMessage').innerText(), /not-a-real-project/);
  assert(await page.locator('#clearSearch').isVisible(), 'Search clear must be visible with text');
  await page.locator('#clearButton').click();
  assert.equal(await page.locator('#sitesGrid .site-card').count(), 8);
  await page.locator('#searchInput').fill('MyPixel');
  await page.keyboard.press('Enter');
  assert(await page.locator('#previewDialog').isVisible(),
    'Enter should open the only exact search match');
  await page.keyboard.press('Escape');
  await page.locator('#clearSearch').click();
  await page.locator('#categorySelect').selectOption('Windhawk');
  assert.equal(await page.locator('#resetFilters, #resultCount, .section-meta').count(), 0,
    'Do not show duplicate result counts or clear-filter actions');
  await page.locator('#categorySelect').selectOption('All');
  assert.equal(await page.locator('#categorySelect').inputValue(), 'All');
  assert.equal(await page.locator('#sitesGrid .site-card').count(), 8);
  await page.locator('#projectsTab').click();
  const scandeck = page.locator('#projectsGrid .project-row').filter({hasText: 'ScanDeck'});
  const manifest = await page.evaluate(async () =>
    (await fetch('./forges.json')).json());
  const expectedForges = [
    ['github', 'https://github.com/luizbizzio/scandeck', 'true'],
    ['gitlab', manifest.verified.gitlab.scandeck ||
      'https://gitlab.com/luizbizzio/scandeck',
      String(Boolean(manifest.verified.gitlab.scandeck))],
    ['codeberg', manifest.verified.codeberg.scandeck ||
      'https://codeberg.org/luizbizzio/scandeck',
      String(Boolean(manifest.verified.codeberg.scandeck))]
  ];
  for (const [forge, expectedUrl] of expectedForges) {
    const icon = scandeck.locator('[data-forge="' + forge + '"]');
    assert.equal(await icon.count(), 1, 'Missing ' + forge + ' icon');
    await page.waitForFunction(({forge,expectedUrl}) =>
      document.querySelector('#projectsGrid [data-forge="' + forge + '"]')?.getAttribute('href') === expectedUrl,
      {forge,expectedUrl});
    assert.equal(await icon.getAttribute('href'), expectedUrl, forge + ' link was incorrect');
    assert.equal(await icon.getAttribute('data-confirmed'), null,
      'Do not show or expose verification statuses on forge links');
    assert(!(await icon.getAttribute('title') || '').toLowerCase().includes('verified'));
    const mask = await icon.locator('.forge-symbol').evaluate(el => getComputedStyle(el).maskImage);
    assert(mask && mask !== 'none', forge + ' logo should be visible');
  }
  assert.equal(await page.locator('.source-note').count(), 0, 'The forge status paragraph must be removed');
  await page.locator('#sitesTab').click();

  // Switching between Gallery and Atlas reuses the self-hosted WebGL renderer.
  await page.locator('#viewAtlas').click();
  assert(await page.locator('#atlasView').isVisible(), 'Atlas mode should be visible');
  assert.equal(await page.locator('#viewAtlas').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#atlasSelect option').count(), 9);
  await page.locator('#atlasSelect').selectOption('1');
  assert.equal(await page.locator('#atlasTitle').innerText(), 'MyPixel');
  await page.locator('#atlasExplore').click();
  assert(await page.locator('#previewDialog').isVisible(), 'Atlas selection opens real project details');
  await page.keyboard.press('Escape');
  await page.locator('#viewGrid').click();
  assert(await page.locator('#atlasView').isHidden(), 'Gallery switch hides Atlas');
  assert(await page.locator('#sitesGrid').isVisible(), 'Gallery is still usable');

  await page.locator('#sitesGrid .preview-button').first().click();
  assert(await page.locator('#previewDialog').isVisible(), 'Clicking a screenshot must show project details');
  assert.equal((await page.locator('#detailLinks > a').count()), 2, 'A website with source needs a website and GitHub link');
  assert.equal(await page.locator('#detailLinks .forge-link').count(), 3, 'Project detail needs all three forge icons');
  assert.equal(await page.locator('#historySection, #relatedSection').count(), 0,
    'Remove visual history and related work from the details DOM');
  assert(await page.locator('#detailRelease').count() === 1,
    'Details must show the latest release state');
  assert((await page.locator('#detailCategory').innerText()).length > 0);
  await page.keyboard.press('Escape');
  assert(!(await page.locator('#previewDialog').isVisible()), 'Escape must close project details');

  assert(await page.locator('.title-favicon').count() >= 5,
    'Official favicon artwork is shown beside website titles');
  await page.locator('#sitesGrid .site-card').filter({hasText: 'Refresh Rate Test'})
    .locator('.preview-button').click();
  assert(await page.locator('#previewArea img').isVisible(),
    'Details should show the current high-quality local preview, not a history rail');
  await page.keyboard.press('Escape');

  await page.locator('#commandButton').click();
  assert(await page.locator('#commandDialog').isVisible(), 'Command palette must open');
  await page.locator('#commandInput').fill('> scandeck');
  assert(await page.locator('#commandResults button').count() >= 1, 'Project command must match a project');
  await page.keyboard.press('Enter');
  assert(await page.locator('#previewDialog').isVisible(), 'Palette must open matched project details');
  await page.keyboard.press('Control+k');
  assert(await page.locator('#commandDialog').isVisible(), 'Ctrl+K must open command palette from details');
  assert(!(await page.locator('#previewDialog').isVisible()));
  await page.locator('#commandInput').fill('> recent');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#projectsTab').getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#sortSelect').inputValue(), 'recent');

  assert.equal(await page.locator('#projectsGrid .project-row').count(), 32);
  for (const [slug, title] of Object.entries({
    codepuff: 'CodePuff', voicebuffer: 'VoiceBuffer', 'uninstall-here': 'Uninstall Here', urlforge: 'URLForge'
  })) {
    const project = page.locator('#projectsGrid .project-row').filter({
      has: page.getByText(title, {exact: true})
    });
    const gitlab = project.locator('[data-forge="gitlab"]');
    assert.equal(await gitlab.getAttribute('href'), 'https://gitlab.com/luizbizzio/' + slug);
    await page.waitForFunction(repo => {
      const project = window.HubDirectory.projects().find(item => item.repo === repo);
      return project && window.HubDirectory.forgeLinks(project)
        .some(link => link.provider === 'gitlab' && link.verified);
    }, slug);
  }
  assert.equal(await page.locator('#projectsGrid .work-name').getByText('Gitmirror',{exact:true}).count(), 0);
  assert.equal(await page.locator('#projectsGrid .work-name').getByText('Windhawk Mods',{exact:true}).count(), 0,
    'Removed project must not come back from cached metadata');
  assert.equal(await page.locator('#projectsGrid .project-meta').count(), 32,
    'Every repository displays release and last push date');
  assert.equal(await page.locator('#projectsGrid .project-updated time').count(), 32,
    'Every repository must have a local update date');
  assert.equal(await page.locator('#projectsGrid .project-row .forge-link').count(), 96,
    'Every saved public GitHub project should have three forge icons');
  await page.waitForFunction(() => window.HubDirectory.projects()
    .find(project => project.repo === 'scandeck')?.description ===
    window.HubDirectory.sites().find(site => site.repo === 'scandeck')?.description);
  assert(await page.evaluate(() => window.HubDirectory.sites()
    .every(site => window.HubDirectory.projects().find(repo => repo.repo === site.repo)
      ?.description === site.description)), 'Website and repository descriptions must match');
  assert.equal(await page.locator('#projectsGrid .media-forges').count(), 0,
    'GitHub project photos must have no floating or overlaid forge logos');
  assert.equal(await page.locator('#projectsGrid .work-source-row .forge-link').count(), 96,
    'GitHub, GitLab and Codeberg icons belong below the project photo');
  assert.equal(await page.locator('#projectsGrid .project-row .title-favicon').count(), 0,
    'Repository cards must never display website icons');
  assert(await page.locator('#projectsGrid .project-row').first()
    .locator('.preview-window img').evaluate(image =>
      getComputedStyle(image).objectFit === 'contain'),
    'README artwork must be shown in full rather than cropped');
  assert.equal(await page.locator('#projectsGrid .title-favicon').count(), 0,
    'No website favicons belong in the repository collection');
  const repoHeights = await page.locator('#projectsGrid .project-row').evaluateAll(nodes =>
    nodes.map(node => Math.round(node.getBoundingClientRect().height)));
  assert(repoHeights.every(h => h === repoHeights[0]), 'Repository rows must have a consistent height');
  const localArtwork = {
    'Silent Chipolo': 'silent-chipolo.jpg',
    'Solis Inverter Exporter': 'solis-inverter-exporter.png',
    'Refresh Rate Test': 'refreshrate.png'
  };
  for (const [name, filename] of Object.entries(localArtwork)) {
    const row = page.locator('#projectsGrid .project-row').filter({hasText:name});
    const sources = await row.locator('img[data-sources]').first().getAttribute('data-sources');
    assert(sources.includes('./previews/covers/' + filename),
      name + ' must use its locally stored curated source image');
  }
  for (const repo of ['scandeck','windhawk-badges','windhawk-inspector','siteguard']) {
    const project = await page.evaluate(slug =>
      window.HubDirectory.projects().find(item => item.repo === slug), repo);
    assert(project, repo + ' must exist in Projects');
    const sources = await page.evaluate(slug => {
      const item = window.HubDirectory.projects().find(x => x.repo === slug);
      return window.HubDirectory.images(item);
    }, repo);
    assert.equal(sources[0], './previews/' + repo + '.jpg',
      repo + ' must show the self-hosted WEBSITE screenshot, not README art');
    const file = await page.request.get(origin + '/previews/' + repo + '.jpg');
    assert(file.ok(), 'Local website screenshot should be available for ' + repo);
  }
  const archiveCover = await page.locator('#projectsGrid .project-row')
    .filter({hasText: 'Archive Preview'}).locator('img[data-sources]').first().getAttribute('data-sources');
  assert(archiveCover.includes('./previews/covers/archive-preview.png'),
    'Local copy of the README cover must be used without contacting GitHub');
  await page.locator('#viewAtlas').click();
  assert(await page.locator('#atlasView').isVisible(),
    'Atlas mode should work for all GitHub projects');
  assert.equal(await page.evaluate(() => window.HubAtlas.debug().sceneStyle),
    'rounded-arc','Websites and repositories must share the same 3D carousel');
  await page.locator('#atlasCanvas canvas.atlas-webgl').waitFor({
    state: 'visible', timeout: 12000
  });
  await page.waitForFunction(() =>
    window.HubAtlas.debug().selectedFrame?.imageWidth>=2000,
    null,{timeout:15000});
  assert(await page.evaluate(() => window.HubAtlas.debug().selectedFrame.reflectionVisible),
    'The project screenshot must have its subtle floor reflection');
  assert.equal(await page.locator('#atlasCanvas .atlas-fallback').count(), 0,
    'Switching to 32 projects must not lose WebGL and show a static list');
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
  assert(await page.locator('#atlasFavicon').isHidden(), 'Repository inspector favicon must be hidden');
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
  assert.equal(await page.locator('#atlasIdentityForges .forge-link').count(), 0,
    '3D view shows project identity and links only once');
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
  await page.locator('#viewGrid').click();
  assert(await page.locator('#projectsGrid').isVisible());
  const archive = page.locator('#projectsGrid .project-row').filter({hasText: 'Archive Preview'});
  assert.equal(await archive.locator('[data-forge="gitlab"]').getAttribute('href'),
    'https://gitlab.com/luizbizzio/archive-preview');
  assert.equal(await archive.locator('[data-forge="codeberg"]').getAttribute('href'),
    'https://codeberg.org/luizbizzio/archive-preview');

  await page.locator('#projectsGrid .project-preview').first().click();
  assert(await page.locator('#previewDialog').isVisible(), 'Repository preview must open project details');
  await page.keyboard.press('Escape');
  await page.locator('#projectsGrid .project-row').filter({hasText: 'Archive Preview'})
    .locator('.project-preview').click();
  assert(await page.locator('#previewDialog').isVisible(), 'GitHub-only project details must open');
  assert.equal(await page.locator('#historySection, #relatedSection').count(), 0,
    'Repository details should have neither visual history nor related work');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.locator('#commandInput').fill('> github scandeck');
  assert((await page.locator('#commandResults button').count()) >= 1, 'GitHub command must find repositories');
  await page.locator('#commandInput').fill('> gitlab scandeck');
  assert((await page.locator('#commandResults button').count()) >= 1, 'GitLab command must find repositories');
  await page.locator('#commandInput').fill('> codeberg scandeck');
  assert((await page.locator('#commandResults button').count()) >= 1, 'Codeberg command must find repositories');
  await page.keyboard.press('Escape');
  assert.deepEqual(desktop.apiCalls, [],
    'The hub must never depend on the GitHub API or raw GitHub image URLs');
  assert.deepEqual(desktop.failures, [], 'Desktop runtime errors');
  await page.close();

  const mobile = await setup(390, 844);
  const m = mobile.page;
  assert(await m.locator('.toolbar .search-field').isVisible());
  assert(await m.locator('.header .social-link').count()===3,
    'LinkedIn, GitHub and copy-email links stay available on mobile');
  assert(await m.locator('.header .social-link').first().evaluate(node =>
    node.getBoundingClientRect().width>=32 &&
    getComputedStyle(node.querySelector('svg')).display!=='none'),
    'Mobile header uses compact, visible social icons');
  assert(await m.evaluate(() =>
    document.documentElement.scrollWidth<=innerWidth+2),
    'Social header must not cause horizontal overflow');
  assert(await m.locator('#categorySelect').evaluate(node =>
    getComputedStyle(node).height !== '0px'), 'Filters remain usable on mobile');
  assert.equal(await m.locator('#sitesGrid .site-card').count(), 8);
  assert(await m.locator('#sitesGrid').isVisible(), 'Mobile opens in the photo Grid');
  assert(await m.locator('#atlasView').isHidden());
  await m.locator('#viewAtlas').click();
  assert(await m.locator('#atlasView').isVisible());
  assert(await m.locator('#atlasPagination').isVisible(),
    'Mobile 3D also needs outside position dots');
  assert(await m.locator('#atlasPagination').evaluate(nav => {
    const panel = document.querySelector('#directoryPanel').getBoundingClientRect();
    const stage = document.querySelector('#atlasStage').getBoundingClientRect();
    const dots = nav.getBoundingClientRect();
    return nav.parentElement?.classList.contains('directory') &&
      dots.top >= panel.bottom + 3 &&
      Math.abs((dots.left + dots.right - stage.left - stage.right) / 2) < 2;
  }), 'Mobile dots must remain centered below the full-width 3D stage');
  await m.locator('#atlasCanvas canvas.atlas-webgl').waitFor({state:'visible', timeout:18000});
  assert(await m.locator('#atlasView').evaluate(el =>
    el.getBoundingClientRect().height>=540),
    'The mobile 3D view should be bigger instead of being squeezed into one screen');
  assert(await m.evaluate(() => 
    document.documentElement.scrollWidth<=innerWidth+2),
    'Expanded mobile showcase must not create horizontal overflow');
  assert(await m.locator('#atlasTitle').evaluate(node =>
    node.getBoundingClientRect().top < 730),
    'Mobile 3D view must show the selected title without excessive blank space');
  assert(await m.locator('#atlasView').evaluate(node =>
    node.getBoundingClientRect().height < 690),
    'Mobile 3D view must be compact enough to browse comfortably');
  assert(await m.locator('#atlasExplore').isVisible(),
    'Mobile 3D view offers a single details action');
  await m.locator('#atlasExplore').click();
  assert(await m.locator('#previewDialog').isVisible(), 'Mobile quick details should open the selected item');
  await m.keyboard.press('Escape');
  const mobileHeight = await m.locator('#atlasView').evaluate(node => node.getBoundingClientRect().height);
  await m.locator('#atlasSelect').selectOption('3');
  assert.equal(await m.locator('#atlasView').evaluate(node => node.getBoundingClientRect().height),
    mobileHeight, 'Mobile Atlas must never jump in height between projects');
  await m.locator('#viewGrid').click();
  assert.equal(await m.locator('#sitesGrid .forge-link').count(), 0,
    'Website card links stay uncluttered on mobile');
  await m.locator('#projectsTab').click();
  assert(await m.locator('#projectsGrid .work-source-row .forge-link').first()
    .evaluate(el => el.getBoundingClientRect().width >= 29),
    'Project source icons are still tappable on mobile');
  await m.locator('#sitesTab').click();
  await m.locator('#searchInput').fill('scandeck');
  assert(await m.locator('#clearSearch').isVisible());
  await m.locator('#clearSearch').click();
  assert.equal(await m.locator('#searchInput').inputValue(), '');
  await m.locator('#viewAtlas').click();
  assert(await m.locator('#atlasView').isVisible(), 'Mobile Atlas must be available');
  assert.equal(await m.locator('#atlasSelect option').count(), 9);
  await m.locator('#projectsTab').click();
  assert.equal(await m.locator('#atlasSelect option').count(), 33);
  assert.equal(await m.locator('#atlasPagination .atlas-marker').count(), 32,
    'Mobile must show an indicator for each of the 32 repositories');
  assert.equal(await m.locator('#atlasPagination button').count(),0,
    'Dense mobile dots are feedback, not undersized touch targets');
  assert.equal(await m.locator('#atlasPagination').getAttribute('aria-hidden'),'true',
    'Mobile dots stay decorative while arrows and dropdown provide navigation');
  assert(await m.locator('#atlasPagination').evaluate(nav => {
    const rail = nav.getBoundingClientRect();
    const stage = document.querySelector('#atlasStage').getBoundingClientRect();
    const markers = [...nav.querySelectorAll('.atlas-marker')]
      .map(marker => marker.getBoundingClientRect());
    return Math.abs((rail.left + rail.right - stage.left - stage.right) / 2) < 2 &&
      markers.every(box =>
        Math.abs(box.top - markers[0].top) < 1 &&
        box.left >= rail.left - 1 && box.right <= rail.right + 1) &&
      document.documentElement.scrollWidth <= innerWidth + 2;
  }), 'Mobile project markers must stay centered in one row without overflow');
  assert(await m.evaluate(() =>
    document.documentElement.scrollWidth<=innerWidth+2),
    'Projects 3D must not cause horizontal scroll on mobile');
  await m.locator('#atlasCanvas canvas.atlas-webgl').waitFor({
    state: 'visible', timeout: 12000
  });
  assert.equal(await m.locator('#atlasCanvas .atlas-fallback').count(), 0,
    'Mobile must render actual Three.js project cards for all repositories');
  await m.locator('#sitesTab').click();
  await m.locator('#viewGrid').click();
  const overflow = await m.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth, width: window.innerWidth
  }));
  assert(overflow.scrollWidth <= overflow.width + 2, 'Mobile document has horizontal overflow');
  await m.locator('#sitesGrid .preview-button').first().click();
  assert(await m.locator('#previewDialog').isVisible(), 'Mobile project details must open');
  await m.keyboard.press('Escape');
  await m.locator('#commandButton').click();
  assert(await m.locator('#commandDialog').isVisible(), 'Mobile palette button must open');
  assert.deepEqual(mobile.apiCalls, [], 'The mobile hub must work independently of GitHub API availability');
  assert.deepEqual(mobile.failures, [], 'Mobile runtime errors');
  await m.close();

  // Graceful non-WebGL path: no broken loading spinner when the local module fails.
  const fallback = await browser.newPage({viewport: {width: 1000,height:800}});
  await fallback.route('https://api.github.com/**', route => route.abort());
  await fallback.route('**/assets/vendor/three.module.js', route => route.abort());
  await fallback.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await fallback.locator('#viewAtlas').click();
  await fallback.locator('#atlasCanvas .atlas-fallback-node').first().waitFor({timeout:15000});
  assert.equal(await fallback.locator('.atlas-fallback-node').count(), 8);
  await fallback.locator('.atlas-fallback-node').nth(1).click();
  assert.equal(await fallback.locator('#atlasTitle').innerText(),'MyPixel');
  await fallback.close();

  console.log('PASS: UX audit, offline covers, accessible navigation, Grid, 3D texture bounds, keyboard, desktop and mobile');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
