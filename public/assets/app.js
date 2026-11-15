/* Minimal static directory. No framework, analytics or third-party screenshot API. */
(() => {
  'use strict';
  const OWNER = 'luizbizzio';
  const GITLAB_OWNER = 'luizbizzio1';
  const GH = 'https://github.com/' + OWNER + '/';
  // Add a confirmed mirror here when one is published. Until then the site uses
  // the requested owner/repository path and clearly marks it as unverified.
  const VERIFIED_MIRRORS = {
    gitlab: {},
    codeberg: {}
  };
  const FORGE_HOSTS = {
    github: 'https://github.com/',
    gitlab: 'https://gitlab.com/',
    codeberg: 'https://codeberg.org/'
  };
  const FORGE_OWNERS = {github: OWNER, gitlab: GITLAB_OWNER, codeberg: OWNER};
  const FEATURED = [
    'scandeck', 'mypixel', 'windhawk-inspector', 'windhawk-badges',
    'refreshrate', 'archive-preview', 'taskbar-zones',
    'task-manager-pause-button', 'recycle-bin-file-preview',
    'capybara', 'siteguard', 'BannerlordFG'
  ];
  const KNOWN = [
    ['scandeck', 'Games that live inside QR codes and barcodes.', 'Games'],
    ['mypixel', 'A browser-based pixel art editor and exporter.', 'Tools'],
    ['windhawk-inspector', 'Analyze Windhawk mod source code and compare versions.', 'Windhawk'],
    ['windhawk-badges', 'Create dynamic SVG badges for Windhawk mods.', 'Windhawk'],
    ['archive-preview', 'Browse compressed archives in Windows File Explorer.', 'Windhawk'],
    ['taskbar-zones', 'Arrange Windows taskbar apps into custom zones.', 'Windhawk'],
    ['task-manager-pause-button', 'Pause and resume processes from Task Manager.', 'Windhawk'],
    ['recycle-bin-file-preview', 'Preview deleted files in Windows Recycle Bin.', 'Windhawk'],
    ['refreshrate', 'Measure screen refresh rate and motion.', 'Tools'],
    ['siteguard', 'Browser-side controls for casual content inspection.', 'Tools'],
    ['capybara', 'A small browser click game.', 'Games'],
    ['BannerlordFG', 'Install frame-generation tools for Bannerlord.', 'Tools'],
    ['grafana-all-in-one', 'An all-in-one Grafana monitoring setup.', 'Hardware'],
    ['grafana-wallpaper', 'Display Grafana dashboards on your desktop.', 'Hardware'],
    ['tuya-smart-plug-exporter', 'Export smart plug metrics to Prometheus.', 'Hardware'],
    ['solis-inverter-exporter', 'Export solar inverter metrics to Prometheus.', 'Hardware'],
    ['currency-exchange-exporter', 'Export currency exchange rates to Prometheus.', 'Tools'],
    ['windows-auto-hotspot', 'Manage a Windows Wi-Fi hotspot.', 'Tools'],
    ['tailscale-mtu', 'Manage Tailscale MTU settings.', 'Tools'],
    ['local-https', 'Configure HTTPS for local network services.', 'Tools'],
    ['tailscale-control', 'Control Tailscale from the Windows tray.', 'Tools'],
    ['one-click-bios', 'Open BIOS / UEFI settings in one click.', 'Hardware'],
    ['git-history-reset', 'Reset a Git repository history.', 'Tools'],
    ['silent-chipolo', 'A guide to quieting a Chipolo tracker.', 'Hardware'],
    ['emojis', 'A guide to emoji artwork and licenses.', 'Other'],
    ['lune-bot', 'A WhatsApp bot project.', 'Other', true],
    ['power-alert', 'A system for power outage alerts.', 'Hardware', true],
    ['knight-adventures', 'Game installation and walkthrough.', 'Games', true]
  ];
  const TITLE = {
    scandeck: 'ScanDeck', mypixel: 'MyPixel', refreshrate: 'Refresh Rate Test',
    BannerlordFG: 'BannerlordFG', siteguard: 'SiteGuard'
  };
  const COVER_FILES = {
    mypixel: 'mypixel.jpg', refreshrate:'refreshrate.png',
    'silent-chipolo':'silent-chipolo.jpg',
    'tailscale-control':'tailscale-control.webp',
    'solis-inverter-exporter':'solis-inverter-exporter.png',
    'git-history-reset':'git-history-reset.jpg',
    'local-https':'local-https.jpg',
    capybara:'capybara.jpg', siteguard:'siteguard.jpg',
    BannerlordFG:'BannerlordFG.png',
    'archive-preview':'archive-preview.png',
    'taskbar-zones':'taskbar-zones.png',
    'task-manager-pause-button':'task-manager-pause-button.png',
    'recycle-bin-file-preview':'recycle-bin-file-preview.png'
  };
  const SELECT = id => document.getElementById(id);
  const UI = {
    sitesTab: SELECT('sitesTab'), projectsTab: SELECT('projectsTab'),
    viewGrid: SELECT('viewGrid'), viewAtlas: SELECT('viewAtlas'), atlas: SELECT('atlasView'),
    sitesCount: SELECT('sitesCount'), projectsCount: SELECT('projectsCount'),
    panel: SELECT('directoryPanel'), sitesGrid: SELECT('sitesGrid'),
    projectsGrid: SELECT('projectsGrid'), search: SELECT('searchInput'),
    clearSearch: SELECT('clearSearch'),
    emptyMessage: SELECT('emptyMessage'),
    category: SELECT('categorySelect'), sort: SELECT('sortSelect'),
    empty: SELECT('emptyState'), clear: SELECT('clearButton'),
    dialog: SELECT('previewDialog'), area: SELECT('previewArea'),
    previewTitle: SELECT('previewTitle'), previewEyebrow: SELECT('previewEyebrow'),
    previewDescription: SELECT('previewDescription'), previewLink: SELECT('previewLink'),
    close: SELECT('closePreview')
  };
  const niceName = name => TITLE[name] || name.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());
  const knownRepo = name => KNOWN.find(x => x[0] === name);
  const knownProjects = KNOWN.map(([repo, description, category, archived]) => ({
    kind: 'repo', repo, name: niceName(repo), description, category,
    archived: !!archived, created: '', updated: '', url: GH + encodeURIComponent(repo)
  }));
  const state = {
    tab: location.hash === '#projects' ? 'projects' : 'sites',
    view: 'grid', search: '', category: 'All', sort: 'featured',
    sites: [], projects: knownProjects, shown: [], metadata: {}, coverIndex: {}
  };

  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, x =>
      ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[x]));
  }
  function isHttps(url) {
    try { return new URL(url).protocol === 'https:'; }
    catch { return false; }
  }
  function validId(id) { return /^[a-z0-9-]+$/.test(id || ''); }
  function validRepo(repo) { return /^[a-z0-9._-]+$/i.test(repo || ''); }
  function safeImage(url) {
    return isHttps(url) || /^\.\/previews\/(?:covers\/)?[a-z0-9._-]+\.(jpg|webp|png)$/i.test(url || '');
  }
  function safeIcon(url) {
    return isHttps(url) || /^\.\/icons\/[a-z0-9._-]+\.svg$/i.test(url || '');
  }

  const WEBSITE_COVERS = new Set(['scandeck','windhawk-badges','windhawk-inspector','siteguard']);
  function imageSources(item) {
    const images = [];
    const site = item.kind === 'site' ? item : state.sites.find(s => s.repo === item.repo);
    const cached = state.coverIndex[item.repo] ||
      (COVER_FILES[item.repo] ? './previews/covers/' + COVER_FILES[item.repo] : '');
    const siteId = site?.id || (WEBSITE_COVERS.has(item.repo) ? item.repo : '');
    const screenshot = validId(siteId) ? './previews/' + siteId + '.jpg' : '';
    // Repository entries with live websites use locally captured screenshots,
    // in Grid, detail dialog and Three.js, before any GitHub/README art.
    if (item.kind === 'site' || WEBSITE_COVERS.has(item.repo)) {
      if (screenshot) images.push(screenshot);
      if (cached) images.push(cached);
    } else {
      if (cached) images.push(cached);
      if (screenshot) images.push(screenshot);
    }
    return [...new Set(images.filter(safeImage))];
  }

  function dateLabel(value) {
    if (!value || Number.isNaN(Date.parse(value))) return '';
    return new Intl.DateTimeFormat('en-GB', {year: 'numeric', month: 'short', day: 'numeric'})
      .format(new Date(value));
  }
  function dateMarkup(item) {
    const created = dateLabel(item.created);
    const updated = dateLabel(item.updated);
    return '<div class="card-dates">' +
      '<span>Created <strong>' + escapeHTML(created || '—') + '</strong></span>' +
      '<span>Updated <strong>' + escapeHTML(updated || '—') + '</strong></span></div>';
  }
  function faviconFor(item) {
    // Repository previews show the three source-forge symbols, never a website favicon.
    return item.kind === 'site' && safeIcon(item.icon) ? item.icon : '';
  }

  function previewMarkup(item, index) {
    const src = imageSources(item);
    const name = escapeHTML(item.name);
    // No fake screenshots: image is actual capture / original asset, else a label.
    const img = src.length
      ? '<img src="' + escapeHTML(src[0]) + '" data-sources="' +
        escapeHTML(JSON.stringify(src)) + '" alt="' +
        escapeHTML('Preview of ' + item.name) + '" loading="' +
        (index < 2 ? 'eager' : 'lazy') + '" decoding="async"' +
        (index === 0 ? ' fetchpriority="high"' : '') + '>'
      : '';
    return '<div class="preview-window"><div class="preview-placeholder">' +
      '<strong>' + name + '</strong><span>' +
      (item.kind === 'site' ? 'Website' : 'GitHub project') +
      '</span></div>' + img + '</div>';
  }

  function wireImages(root) {
    root.querySelectorAll('img[data-icon]').forEach(img => {
      img.addEventListener('error', () => img.remove(), {once: true});
    });
    root.querySelectorAll('img[data-sources]').forEach(img => {
      const onLoad = () => {
        const loadedSrc = img.currentSrc || img.src;
        const reveal = () => {
          if (!img.isConnected || !img.naturalWidth ||
              (img.currentSrc || img.src) !== loadedSrc) return;
          img.classList.add('is-loaded');
          img.closest('.preview-window')?.classList.add('has-image');
        };
        // load means bytes arrived, not that the browser has decoded the pixels.
        // Decode before exposing the cover to avoid a black frame on first paint.
        if (typeof img.decode === 'function') img.decode().then(reveal, reveal);
        else reveal();
      };
      img.addEventListener('load', onLoad);
      if (img.complete && img.naturalWidth > 0) onLoad();
      img.addEventListener('error', () => {
        img.classList.remove('is-loaded');
        img.closest('.preview-window')?.classList.remove('has-image');
        let images;
        try { images = JSON.parse(img.dataset.sources); } catch { images = []; }
        const current = images.indexOf(img.getAttribute('src'));
        if (current >= 0 && current + 1 < images.length) {
          img.src = images[current + 1];
        } else {
          img.remove();
        }
      });
    });
  }

  function getForgeTargets(item) {
    const repo = validRepo(item.repo) ? item.repo : validId(item.id) ? item.id : '';
    if (!repo) return [];
    return ['github', 'gitlab', 'codeberg'].map(provider => {
      const override = VERIFIED_MIRRORS[provider]?.[repo];
      const verified = provider === 'github' ||
        (typeof override === 'string' && isHttps(override) &&
         new URL(override).hostname === provider + (provider === 'codeberg' ? '.org' : '.com'));
      const url = verified && override
        ? override
        : FORGE_HOSTS[provider] + FORGE_OWNERS[provider] + '/' + encodeURIComponent(repo);
      return {provider, url, verified, repo};
    });
  }

  function forgeMarkup(item) {
    const entries = getForgeTargets(item);
    if (!entries.length) return '';
    const slug = entries[0].repo;
    const links = entries.map(({provider, url}) => {
      const label = provider === 'github' ? 'GitHub' : provider === 'gitlab' ? 'GitLab' : 'Codeberg';
      return '<a class="forge-link" data-forge="' + provider +
        '" href="' + escapeHTML(url) + '" target="_blank" rel="noopener noreferrer"' +
        ' title="' + label + '" aria-label="Open ' + label + ' for ' + escapeHTML(slug) + '">' +
        '<span class="forge-symbol forge-' + provider + '" aria-hidden="true"></span>' +
        '</a>';
    }).join('');
    return '<div class="forge-strip" role="group" aria-label="Repository hosting for ' +
      escapeHTML(slug) + '">' +
      '<span class="forge-identity" title="' + escapeHTML(OWNER + '/' + slug) +
      '"><span class="forge-identity-prefix">SOURCE / </span>' +
      escapeHTML(OWNER + '/' + slug) + '</span>' +
      '<div class="forge-actions">' + links + '</div></div>';
  }

  function card(item, index) {
    const site = item.kind === 'site';
    const name = escapeHTML(item.name), url = escapeHTML(item.url);
    const previewClass = site ? 'preview-button' : 'project-preview';
    const titleClass = site ? 'site-title-button' : 'project-title';
    const icon = site && safeIcon(item.icon)
      ? '<img class="title-favicon" data-icon alt="" src="' + escapeHTML(item.icon) +
        '" loading="lazy" decoding="async">'
      : '';
    const tag = typeof item.release === 'string' && item.release.trim()
      ? item.release.trim()
      : (item.releaseChecked ? 'No release' : 'Release unavailable');
    const updated = dateLabel(item.updated) || 'Unknown';
    const metadata = site ? '' :
      '<div class="project-meta"><span class="project-release" title="Latest GitHub release">' +
        escapeHTML(tag) + '</span><span class="project-meta-dot" aria-hidden="true">·</span>' +
        '<span class="project-updated">Updated <time' +
        (item.updated && !Number.isNaN(Date.parse(item.updated)) ?
          ' datetime="' + escapeHTML(item.updated) + '"' : '') +
        '>' + escapeHTML(updated) + '</time></span></div>';
    const links = site
      ? '<a class="work-visit" href="' + url +
          '" target="_blank" rel="noopener noreferrer" aria-label="Visit ' +
          name + '">Visit <span aria-hidden="true">↗</span></a>'
      : '<div class="work-source-row">' + forgeMarkup(item) + '</div>';
    return '<article class="work-card ' + (site ? 'site-card' : 'project-row') +
      '" aria-label="' + name + '">' +
      '<div class="work-media"><button class="' + previewClass +
        '" type="button" data-open="' + index +
        '" aria-label="Details for ' + name + '">' + previewMarkup(item, index) +
        '</button></div>' +
      '<div class="work-content ' + (site ? 'site-details' : 'project-data') + '">' +
        '<h2 class="work-name"><button type="button" data-open="' + index +
          '" class="' + titleClass + '">' + icon +
          '<span class="work-title-text">' + name + '</span></button></h2>' +
        '<p class="work-description ' + (site ? 'site-description' : 'project-description') +
          '">' + escapeHTML(item.description) + '</p>' +
        metadata +
        '<div class="work-actions">' + links + '</div>' +
      '</div></article>';
  }
  const sitesCard = card;
  const repoRow = card;

  function sortedFiltered(items) {
    const q = state.search.trim().toLocaleLowerCase();
    return items.filter(item =>
      (state.category === 'All' || state.category === item.category) &&
      (!q || [item.name,item.description,item.category,item.repo,item.url]
        .some(v => String(v ?? '').toLocaleLowerCase().includes(q))))
      .sort((a,b) => {
        if (state.sort === 'name') return a.name.localeCompare(b.name);
        if (state.sort === 'recent' && state.tab === 'projects') {
          return (b.updated || '').localeCompare(a.updated || '') ||
            a.name.localeCompare(b.name);
        }
        if (!!a.archived !== !!b.archived) return a.archived ? 1 : -1;
        const aPos = a.kind === 'site' ? state.sites.indexOf(a) :
          FEATURED.includes(a.repo) ? FEATURED.indexOf(a.repo) : 1000;
        const bPos = b.kind === 'site' ? state.sites.indexOf(b) :
          FEATURED.includes(b.repo) ? FEATURED.indexOf(b.repo) : 1000;
        return aPos - bPos || a.name.localeCompare(b.name);
      });
  }

  function render() {
    const websites = state.tab === 'sites';
    const items = websites ? state.sites : state.projects;
    const categories = ['All', ...new Set(items.map(x => x.category).filter(Boolean))];
    if (!categories.includes(state.category)) state.category = 'All';
    UI.category.innerHTML = categories.map(c =>
      '<option value="' + escapeHTML(c) + '">' +
      escapeHTML(c === 'All' ? 'All categories' : c) + '</option>').join('');
    UI.category.value = state.category;
    const recent = UI.sort.querySelector('[value="recent"]');
    recent.hidden = websites;
    recent.disabled = websites;
    if (websites && state.sort === 'recent') state.sort = 'featured';
    UI.sort.value = state.sort;
    state.shown = sortedFiltered(items);

    UI.sitesTab.classList.toggle('active', websites);
    UI.projectsTab.classList.toggle('active', !websites);
    UI.sitesTab.setAttribute('aria-selected', String(websites));
    UI.projectsTab.setAttribute('aria-selected', String(!websites));
    UI.sitesTab.tabIndex = websites ? 0 : -1;
    UI.projectsTab.tabIndex = websites ? -1 : 0;
    UI.panel.setAttribute('aria-labelledby', websites ? 'sitesTab' : 'projectsTab');
    UI.sitesCount.textContent = String(state.sites.length).padStart(2,'0');
    UI.projectsCount.textContent = String(state.projects.length).padStart(2,'0');
    UI.clearSearch.hidden = !state.search;
    UI.emptyMessage.textContent = state.search.trim()
      ? 'No matches for “' + state.search.trim() + '”.'
      : 'No matching ' + (websites ? 'websites' : 'projects') + '.';
    UI.search.setAttribute('aria-label', websites ? 'Search websites' : 'Search projects');
    UI.search.placeholder = 'Search...';
    const atlasMode = state.view === 'showcase';
    document.body.classList.toggle('atlas-active', atlasMode);
    UI.empty.hidden = state.shown.length !== 0;
    UI.viewGrid.classList.toggle('active', !atlasMode);
    UI.viewAtlas.classList.toggle('active', atlasMode);
    UI.viewGrid.setAttribute('aria-pressed', String(!atlasMode));
    UI.viewAtlas.setAttribute('aria-pressed', String(atlasMode));
    UI.atlas.hidden = !atlasMode || state.shown.length === 0;
    UI.sitesGrid.hidden = atlasMode || !websites;
    UI.projectsGrid.hidden = atlasMode || websites;
    if (websites) {
      UI.sitesGrid.innerHTML = state.shown.map(sitesCard).join('');
      UI.projectsGrid.replaceChildren();
      wireImages(UI.sitesGrid);
    } else {
      UI.projectsGrid.innerHTML = state.shown.map(repoRow).join('');
      UI.sitesGrid.replaceChildren();
      wireImages(UI.projectsGrid);
    }
    window.HubAtlas?.update({
      items: state.shown, tab: state.tab, active: atlasMode && state.shown.length > 0
    });
  }

  function setView(view) {
    if (view !== 'grid' && view !== 'showcase') return;
    state.view = view;
    try { localStorage.setItem('lb-hub-layout-v4', view); } catch {}
    render();
  }

  function setTab(tab, replaceHash = true) {
    if (!['sites','projects'].includes(tab)) return;
    if (tab !== state.tab) { state.category = 'All'; state.sort = 'featured'; }
    state.tab = tab;
    if (replaceHash) history.replaceState(null, '', '#' + tab);
    render();
  }
  function clearFilters() {
    state.search = '';
    state.category = 'All';
    state.sort = 'featured';
    UI.search.value = '';
    render();
  }
  function clearSearch() {
    state.search = '';
    UI.search.value = '';
    render();
    UI.search.focus();
  }
  function openPreview(item) {
    window.HubExplorer?.open(item);
  }

  function handlePreview(event) {
    const button = event.target.closest('[data-open]');
    if (!button) return;
    const i = Number(button.dataset.open);
    if (Number.isInteger(i) && state.shown[i]) openPreview(state.shown[i]);
  }
  async function loadVerifiedForges() {
    try {
      const response = await fetch('./forges.json', {cache: 'no-cache'});
      if (!response.ok) return;
      const manifest = await response.json();
      if (manifest.version !== 1 || !manifest.verified) return;
      for (const forge of ['gitlab', 'codeberg']) {
        const entries = manifest.verified[forge];
        if (!entries || typeof entries !== 'object') continue;
        for (const [repo, url] of Object.entries(entries)) {
          if (!validRepo(repo) || !isHttps(url)) continue;
          const parsed = new URL(url);
          if (parsed.hostname !== (forge === 'gitlab' ? 'gitlab.com' : 'codeberg.org')) continue;
          if (decodeURIComponent(parsed.pathname).replace(/\/$/, '').toLowerCase() !==
              ('/' + FORGE_OWNERS[forge] + '/' + repo).toLowerCase()) continue;
          VERIFIED_MIRRORS[forge][repo] = url;
        }
      }
      render();
      window.HubExplorer?.refresh();
    } catch (error) {
      console.info('Verified forge manifest unavailable. Showing labeled fallback paths.', error);
    }
  }

  async function loadCoverIndex() {
    try {
      const response = await fetch('./previews/covers/index.json');
      if (!response.ok) return;
      const manifest = await response.json();
      if (manifest.version !== 1 || !manifest.covers || typeof manifest.covers !== 'object') return;
      for (const [repo, path] of Object.entries(manifest.covers)) {
        if (validRepo(repo) && typeof path === 'string' &&
            /^\.\/previews\/covers\/[a-z0-9._-]+\.(?:png|jpg|webp)$/i.test(path)) {
          state.coverIndex[repo] = path;
        }
      }
      render();
    } catch (error) {
      console.info('Optional local artwork catalog unavailable:', error);
    }
  }

  function hydrateProject(item) {
    const meta = state.metadata[item.repo] || {};
    const matchingSite = item.kind === 'repo'
      ? state.sites.find(site => site.repo === item.repo) : null;
    return {
      ...item,
      // Paired website and repository cards must show the exact same description.
      description: matchingSite?.description || (item.kind === 'repo'
        ? (meta.description || item.description) : item.description),
      archived: meta.archived ?? item.archived ?? false,
      created: meta.created || item.created || '',
      updated: meta.updated || item.updated || '',
      release: typeof meta.release === 'string' ? meta.release : '',
      releaseChecked: meta.releaseChecked === true,
      releasePublishedAt: meta.releasePublishedAt || ''
    };
  }

  // All public projects, descriptions, and dates come from this local snapshot.
  // Browsers never contact the GitHub API, so GitHub outages do not affect browsing.
  async function loadProjectMetadata() {
    try {
      const response = await fetch('./project-metadata.json');
      if (!response.ok) return;
      const manifest = await response.json();
      if (![1,2,3].includes(manifest.version) || !manifest.repos ||
          typeof manifest.repos !== 'object') return;
      state.metadata = manifest.repos;
      state.sites = state.sites.map(hydrateProject);
      const mapped = new Map(state.projects.map(item => [item.repo,item]));
      for (const [repo, entry] of Object.entries(manifest.repos)) {
        if (repo === 'windhawk-mods' || !validRepo(repo) ||
            !entry || typeof entry !== 'object') continue;
        if (!mapped.has(repo)) {
          mapped.set(repo, {
            kind: 'repo', repo, name:niceName(repo),
            description:entry.description || '',category:'Other',
            archived:!!entry.archived,created:'',updated:'',
            url:GH+encodeURIComponent(repo)
          });
        }
      }
      mapped.delete('windhawk-mods');
      state.projects = [...mapped.values()].map(hydrateProject);
      render();
      window.HubExplorer?.refresh();
    } catch (error) {
      console.info('Local repository catalog unavailable, using bundled fallback.', error);
    }
  }

  async function loadSites() {
    try {
      const response = await fetch('./sites.json', {cache:'no-cache'});
      if (!response.ok) throw new Error('Missing sites.json');
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error('Invalid sites.json');
      state.sites = data.filter(x => x && x.name && isHttps(x.url)).map(x => ({
        kind: 'site', name: String(x.name), id: String(x.id || ''),
        url: String(x.url), repo: validRepo(x.repo) ? x.repo : '',
        image: safeImage(x.image) ? x.image : '',
        icon: safeIcon(x.icon) ? x.icon : '',
        category: String(x.category || 'Tools'),
        description: String(x.description || ''),
        created: state.metadata[x.repo]?.created || x.created || '',
        updated: state.metadata[x.repo]?.updated || x.updated || ''
      }));
      state.projects = state.projects.map(hydrateProject);
      render();
      window.HubExplorer?.refresh();
    } catch(e) {
      console.warn('Site directory unavailable:', e);

    }
  }
  UI.sitesTab.addEventListener('click', () => setTab('sites'));
  UI.projectsTab.addEventListener('click', () => setTab('projects'));
  for (const tab of [UI.sitesTab, UI.projectsTab]) {
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const to = event.key === 'Home' ? 'sites' :
        event.key === 'End' ? 'projects' :
        state.tab === 'sites' ? 'projects' : 'sites';
      setTab(to);
      (to === 'sites' ? UI.sitesTab : UI.projectsTab).focus();
    });
  }
  UI.viewGrid.addEventListener('click', () => setView('grid'));
  UI.viewAtlas.addEventListener('click', () => setView('showcase'));
  window.addEventListener('hashchange', () =>
    setTab(location.hash === '#projects' ? 'projects' : 'sites', false));
  UI.search.addEventListener('input', e => { state.search = e.target.value; render(); });
  UI.search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && UI.search.value) {
      event.preventDefault(); clearSearch();
    } else if (event.key === 'Enter' && state.shown.length) {
      event.preventDefault();
      if (state.shown.length === 1) openPreview(state.shown[0]);
      else {
        const target = state.view === 'showcase'
          ? SELECT('atlasSelect') : (state.tab === 'sites'
            ? UI.sitesGrid : UI.projectsGrid).querySelector('.preview-button,.project-preview');
        target?.focus({preventScroll: false});
      }
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey ||
        event.target.closest('input,textarea,select,[contenteditable="true"],dialog')) return;
    event.preventDefault();
    UI.search.focus();
  });
  UI.category.addEventListener('change', e => { state.category = e.target.value; render(); });
  UI.sort.addEventListener('change', e => { state.sort = e.target.value; render(); });
  UI.sitesGrid.addEventListener('click', handlePreview);
  UI.projectsGrid.addEventListener('click', handlePreview);
  UI.clear.addEventListener('click', () => { clearFilters(); UI.search.focus(); });
  UI.clearSearch.addEventListener('click', clearSearch);
  // The detail dialog is owned by explorer.js (including its keyboard controls).
  window.HubDirectory = Object.freeze({
    sites: () => state.sites,
    projects: () => state.projects,
    images: imageSources,
    // Default, unfiltered ordering for warm Three.js scenes. No public API call.
    catalog: tab => {
      const list=(tab==='sites'?state.sites:state.projects).slice();
      return list.sort((a,b)=>{
        if(!!a.archived!==!!b.archived)return a.archived?1:-1;
        const position=item=>tab==='sites'
          ? state.sites.indexOf(item)
          : FEATURED.includes(item.repo)?FEATURED.indexOf(item.repo):1000;
        return position(a)-position(b)||a.name.localeCompare(b.name);
      });
    },
    favicon: faviconFor,
    date: dateLabel,
    forges: forgeMarkup,
    forgeLinks: getForgeTargets,
    current: () => ({items: state.shown, tab: state.tab, active: state.view === 'showcase'}),
    view: setView,
    navigate: (tab, sort) => {
      setTab(tab);
      if (sort) { state.sort = sort; render(); }
    }
  });

  // Do not place the public email in the HTML or in a readable mailto: URL.
  // Lightweight obfuscation discourages basic address harvesters; it is not
  // a security boundary against crawlers that execute JavaScript.
  const emailButton = SELECT('copyEmailButton');
  const emailStatus = SELECT('emailCopyStatus');
  if (emailButton && emailStatus) {
    const encodedEmail = [86,90,91,65,84,86,65,117,89,64,92,79,87,92,79,79,92,90,27,86,90,88];
    let statusTimer;
    const showEmailStatus = message => {
      clearTimeout(statusTimer);
      emailStatus.textContent = message;
      emailStatus.classList.add('is-visible');
      statusTimer = setTimeout(() => {
        emailStatus.classList.remove('is-visible');
        emailStatus.textContent = '';
      }, 2200);
    };
    emailButton.addEventListener('click', async () => {
      const email = String.fromCharCode(...encodedEmail.map(value => value ^ 0x35));
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(email);
          copied = true;
        }
      } catch {}
      if (!copied) {
        const field = document.createElement('textarea');
        field.value = email;
        field.readOnly = true;
        field.style.position = 'fixed';
        field.style.left = '-9999px';
        document.body.append(field);
        const previous = document.activeElement;
        field.select();
        try { copied = document.execCommand('copy'); } catch {}
        field.remove();
        previous?.focus?.({preventScroll:true});
      }
      showEmailStatus(copied ? 'Email copied!' : 'Could not copy email');
    });
  }

  SELECT('year').textContent = String(new Date().getFullYear());
  // A previous version offered light mode; ignore any stored preference.
  document.documentElement.removeAttribute('data-theme');
  try { localStorage.removeItem('lb-hub-theme'); } catch {}
  // New visual collection starts in Grid. Only this version's choice is kept.
  try {
    state.view = localStorage.getItem('lb-hub-layout-v4') === 'showcase'
      ? 'showcase' : 'grid';
  } catch {}
  render();
  // Pre-warm both scene roots after their local data and image catalogue load.
  // This runs while Grid is visible, so changing tabs never restarts WebGL.
  void Promise.allSettled([
    loadProjectMetadata(),loadSites(),loadCoverIndex()
  ]).then(()=>window.HubAtlas?.prepare());

  void loadVerifiedForges();
})();