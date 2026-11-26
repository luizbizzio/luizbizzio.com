/* Minimal static directory. No framework, analytics or third-party screenshot API. */
(() => {
  'use strict';
  const OWNER = 'luizbizzio';
  const GITLAB_OWNER = 'luizbizzio';
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
  const FORGE_LABELS = {github: 'GitHub', gitlab: 'GitLab', codeberg: 'Codeberg'};
  const FORGE_OWNERS = {github: OWNER, gitlab: GITLAB_OWNER, codeberg: OWNER};
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
    ['knight-adventures', 'Game installation and walkthrough.', 'Games', true],
    ['codepuff', 'A pixel-art coding pet that reacts to your coding agent.', 'Tools'],
    ['voicebuffer', 'Adjust the incoming voice buffer in Discord Desktop.', 'Tools'],
    ['uninstall-here', 'Open app uninstallers directly from the Windows 11 Start menu.', 'Windhawk'],
    ['urlforge', 'Compress long URLs into self-contained links in your browser.', 'Tools']
  ];
  const TITLE = {
    scandeck: 'ScanDeck', mypixel: 'MyPixel', refreshrate: 'Refresh Rate Test',
    BannerlordFG: 'BannerlordFG', siteguard: 'SiteGuard',
    codepuff: 'CodePuff', voicebuffer: 'VoiceBuffer', urlforge: 'URLForge'
  };
  const COVER_FILES = {
    mypixel: 'mypixel.jpg', refreshrate:'refreshrate.png',
    codepuff: 'codepuff.png', voicebuffer: 'voicebuffer.png',
    'uninstall-here': 'uninstall-here.png',
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
  const INLINE_PREVIEWS = new Set([
    'codepuff', 'voicebuffer', 'uninstall-here', 'urlforge',
    'scandeck', 'mypixel', 'windhawk-inspector'
  ]);
  const SELECT = id => document.getElementById(id);
  const UI = {
    sitesTab: SELECT('sitesTab'), projectsTab: SELECT('projectsTab'),
    releasesSection: SELECT('recentReleases'), releasesList: SELECT('releasesList'),
    sitesCount: SELECT('sitesCount'), projectsCount: SELECT('projectsCount'),
    panel: SELECT('directoryPanel'), projectsList: SELECT('projectsList'), search: SELECT('searchInput'),
    clearSearch: SELECT('clearSearch'),
    emptyMessage: SELECT('emptyMessage'),
    category: SELECT('categorySelect'), sort: SELECT('sortSelect'),
    empty: SELECT('emptyState'), clear: SELECT('clearButton')
  };
  const niceName = name => TITLE[name] || name.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase());
  const knownProjects = KNOWN.map(([repo, description, category, archived]) => ({
    kind: 'repo', repo, name: niceName(repo), description, category,
    archived: !!archived, created: '', updated: '', url: GH + encodeURIComponent(repo)
  }));
  const state = {
    tab: location.hash === '#sites' ? 'sites' : 'projects',
    search: '', category: 'All', sort: 'recent',
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
    return isHttps(url) || /^\.\/icons\/[a-z0-9._-]+\.(svg|png)$/i.test(url || '');
  }

  const WEBSITE_COVERS = new Set([
    'scandeck', 'mypixel', 'windhawk-badges', 'windhawk-inspector', 'siteguard', 'urlforge'
  ]);
  function imageSources(item) {
    const images = [];
    const site = websiteFor(item);
    const cached = state.coverIndex[item.repo] ||
      (COVER_FILES[item.repo] ? './previews/covers/' + COVER_FILES[item.repo] : '');
    const siteId = site?.id || (WEBSITE_COVERS.has(item.repo) ? item.repo : '');
    const screenshot = validId(siteId) ? './previews/' + siteId + '.jpg' : '';
    // Prefer a local screenshot for the websites curated for screenshots.
    if (item.kind === 'site' || WEBSITE_COVERS.has(item.repo)) {
      if (screenshot) images.push(screenshot);
      if (cached) images.push(cached);
    } else {
      if (cached) images.push(cached);
      if (screenshot) images.push(screenshot);
    }
    return [...new Set(images.filter(safeImage))];
  }

  function websiteFor(item) {
    return item.kind === 'site' ? item : state.sites.find(site => site.repo === item.repo);
  }
  function getForgeTargets(item) {
    const repo = validRepo(item.repo) ? item.repo : '';
    if (!repo) return [];
    return ['github', 'gitlab', 'codeberg'].map(provider => {
      const override = VERIFIED_MIRRORS[provider]?.[repo];
      const verified = provider === 'github' ||
        (typeof override === 'string' && isHttps(override) &&
         new URL(override).hostname === provider + (provider === 'codeberg' ? '.org' : '.com'));
      const url = verified && override
        ? override
        : FORGE_HOSTS[provider] + FORGE_OWNERS[provider] + '/' + encodeURIComponent(repo);
      return {provider, label: FORGE_LABELS[provider], url, verified, repo};
    });
  }

  function forgeMarkup(item) {
    const links = getForgeTargets(item).map(({provider, label, url, verified}) => {
      const icon = '<span class="forge-symbol forge-' + provider + '" aria-hidden="true"></span>';
      if (!verified) return '<span class="source-link source-unavailable" title="' +
        label + ' mirror unavailable">' + icon + label + '<span class="sr-only"> mirror unavailable</span></span>';
      return '<a class="source-link" data-forge="' + provider + '" href="' + escapeHTML(url) +
        '" target="_blank" rel="noopener noreferrer" aria-label="' + label + ' for ' +
        escapeHTML(item.name) + '">' + icon + label + '</a>';
    });
    return links.length ? '<div class="repository-sources" role="group" aria-label="Source repositories">' +
      links.join('') + '</div>' : '';
  }

  function repositoryName(item) {
    return item.repo || item.name;
  }

  function projectHeading(item) {
    return '<h3 class="repository-title"><button type="button" data-project="' +
      escapeHTML(item.repo || item.id) + '">' + escapeHTML(repositoryName(item)) + '</button></h3>';
  }

  function liveLink(item) {
    const site = websiteFor(item);
    return site ? '<a class="repository-visit" href="' + escapeHTML(site.url) +
      '" target="_blank" rel="noopener noreferrer" aria-label="Visit ' +
      escapeHTML(item.name) + ' website">Visit site <span aria-hidden="true">↗</span></a>' : '';
  }

  const releaseDateFormat = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'
  });

  function renderReleases() {
    const releases = state.projects
      .filter(item => item.release && Number.isFinite(Date.parse(item.releasePublishedAt)))
      .sort((a, b) => Date.parse(b.releasePublishedAt) - Date.parse(a.releasePublishedAt) ||
        repositoryName(a).localeCompare(repositoryName(b)))
      .slice(0, 3);

    UI.releasesSection.hidden = !releases.length;
    UI.releasesList.innerHTML = releases.map(item => {
      const tag = item.release;
      const href = item.url + '/releases/tag/' + encodeURIComponent(tag);
      const date = item.releasePublishedAt;
      return '<li><a class="release-link" href="' + escapeHTML(href) +
        '" target="_blank" rel="noopener noreferrer"><span class="release-repo">' +
        escapeHTML(repositoryName(item)) + '</span><span class="release-meta"><span class="release-tag">' +
        escapeHTML(tag) + '</span><time datetime="' + escapeHTML(date) + '">' +
        escapeHTML(releaseDateFormat.format(new Date(date))) + '</time></span>' +
        '<span class="release-external" aria-hidden="true">↗</span></a></li>';
    }).join('');
  }

  function repositoryPreview(item) {
    if (item.kind !== 'site' && !INLINE_PREVIEWS.has(item.repo)) return '';
    const images = imageSources(item);
    if (!images.length) return '';
    return '<button type="button" class="repository-preview" data-project="' +
      escapeHTML(item.repo) + '" aria-label="Open preview for ' + escapeHTML(item.name) + '">' +
      '<img src="' + escapeHTML(images[0]) + '" data-preview-sources="' +
      escapeHTML(JSON.stringify(images)) + '" alt="" loading="lazy" decoding="async">' +
      '<span class="preview-expand" aria-hidden="true">⤢</span></button>';
  }

  function repositoryRow(item) {
    const status = item.archived ? 'Archived' : item.release;
    const preview = repositoryPreview(item);
    return '<article class="repository-entry' + (preview ? ' has-preview' : '') +
      '" aria-label="' + escapeHTML(item.name) + '">' +
      '<div class="repository-info"><div class="repository-heading">' + projectHeading(item) +
      '<span class="repository-category">' + escapeHTML(item.category) + '</span></div>' +
      '<p class="repository-description">' + escapeHTML(item.description) + '</p>' +
      '<div class="repository-meta">' + liveLink(item) +
      (status ? '<span class="repository-version">' + escapeHTML(status) + '</span>' : '') +
      '</div>' + forgeMarkup(item) + '</div>' + preview + '</article>';
  }

  let listMarkup = '';
  function sortedFiltered(items) {
    const q = state.search.trim().toLocaleLowerCase();
    return items.filter(item =>
      (state.category === 'All' || state.category === item.category) &&
      (!q || [item.name,item.description,item.category,item.repo,item.url,websiteFor(item)?.url]
        .some(v => String(v ?? '').toLocaleLowerCase().includes(q))))
      .sort((a, b) => {
        const byName = repositoryName(a).localeCompare(repositoryName(b));
        return state.sort === 'recent'
          ? (b.updated || '').localeCompare(a.updated || '') || byName
          : byName;
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
    UI.sort.value = state.sort;
    state.shown = sortedFiltered(items);

    UI.sitesTab.classList.toggle('active', websites);
    UI.projectsTab.classList.toggle('active', !websites);
    UI.sitesTab.setAttribute('aria-selected', String(websites));
    UI.projectsTab.setAttribute('aria-selected', String(!websites));
    UI.sitesTab.tabIndex = websites ? 0 : -1;
    UI.projectsTab.tabIndex = websites ? -1 : 0;
    UI.panel.setAttribute('aria-labelledby', websites ? 'sitesTab' : 'projectsTab');
    UI.sitesCount.textContent = state.sites.length;
    UI.projectsCount.textContent = state.projects.length;
    UI.clearSearch.hidden = !state.search;
    UI.emptyMessage.textContent = state.search.trim()
      ? 'No matches for “' + state.search.trim() + '”.'
      : 'No matching ' + (websites ? 'websites' : 'projects') + '.';
    UI.search.setAttribute('aria-label', websites ? 'Search websites' : 'Search projects');
    UI.search.placeholder = websites ? 'Find a website…' : 'Find a repository…';
    UI.empty.hidden = state.shown.length !== 0;
    UI.projectsList.hidden = state.shown.length === 0;
    const nextList = state.shown.map(repositoryRow).join('');
    if (nextList !== listMarkup) {
      listMarkup = nextList;
      UI.projectsList.innerHTML = listMarkup;
    }
  }

  function setTab(tab, replaceHash = true) {
    if (!['sites','projects'].includes(tab)) return;
    if (tab !== state.tab) state.category = 'All';
    state.tab = tab;
    if (replaceHash) history.replaceState(null, '', '#' + tab);
    render();
  }
  function clearFilters() {
    state.search = '';
    state.category = 'All';
    state.sort = 'recent';
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
    const button = event.target.closest('[data-project]');
    if (!button) return;
    const project = state.shown.find(item => (item.repo || item.id) === button.dataset.project);
    if (project) openPreview(project);
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
      renderReleases();
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
      })).map(hydrateProject);
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
      const to = event.key === 'Home' ? 'projects' :
        event.key === 'End' ? 'sites' :
        state.tab === 'sites' ? 'projects' : 'sites';
      setTab(to);
      (to === 'sites' ? UI.sitesTab : UI.projectsTab).focus();
    });
  }
  window.addEventListener('hashchange', () =>
    setTab(location.hash === '#sites' ? 'sites' : 'projects', false));
  UI.search.addEventListener('input', e => { state.search = e.target.value; render(); });
  UI.search.addEventListener('keydown', event => {
    if (event.key === 'Escape' && UI.search.value) {
      event.preventDefault(); clearSearch();
    } else if (event.key === 'Enter' && state.shown.length) {
      event.preventDefault();
      if (state.shown.length === 1) openPreview(state.shown[0]);
      else UI.projectsList.querySelector('[data-project]')?.focus();
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
  UI.projectsList.addEventListener('click', handlePreview);
  UI.projectsList.addEventListener('error', event => {
    const img = event.target;
    if (!img.matches('img[data-preview-sources]')) return;
    const images = JSON.parse(img.dataset.previewSources);
    const next = images.indexOf(img.getAttribute('src')) + 1;
    if (next < images.length) {
      img.src = images[next];
    } else {
      const preview = img.closest('.repository-preview');
      const repository = preview.closest('.repository-entry');
      repository.classList.remove('has-preview');
      if (document.activeElement === preview) {
        repository.querySelector('.repository-title button').focus();
      }
      preview.remove();
    }
  }, true);
  UI.clear.addEventListener('click', () => { clearFilters(); UI.search.focus(); });
  UI.clearSearch.addEventListener('click', clearSearch);
  // The detail dialog is owned by explorer.js (including its keyboard controls).
  window.HubDirectory = Object.freeze({
    sites: () => state.sites,
    projects: () => state.projects,
    images: imageSources,
    website: websiteFor,
    forges: forgeMarkup,
    forgeLinks: getForgeTargets,
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
  const releasesPanel = SELECT('releasesPanel');
  const narrowProfile = matchMedia('(max-width: 760px)');
  releasesPanel.open = !narrowProfile.matches;
  narrowProfile.addEventListener('change', event => { releasesPanel.open = !event.matches; });
  // A previous version offered light mode; ignore any stored preference.
  document.documentElement.removeAttribute('data-theme');
  try { localStorage.removeItem('lb-hub-theme'); } catch {}
  render();
  void loadProjectMetadata();
  void loadSites();
  void loadCoverIndex();
  void loadVerifiedForges();
})();
