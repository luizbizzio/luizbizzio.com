/* Simple project details and keyboard command search. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const e = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const URL_SAFE = url => {
    try { return new URL(url, location.href).protocol === 'https:' || String(url).startsWith('./'); }
    catch { return false; }
  };
  const directory = () => window.HubDirectory;
  const ui = {
    preview: $('previewDialog'), title: $('previewTitle'), icon: $('detailIcon'),
    eyebrow: $('previewEyebrow'), description: $('previewDescription'),
    area: $('previewArea'), category: $('detailCategory'),
    platform: $('detailPlatform'), status: $('detailStatus'),
    created: $('detailCreated'), updated: $('detailUpdated'),
    release: $('detailRelease'), links: $('detailLinks'),
    close: $('closePreview'),
    command: $('commandDialog'), commandInput: $('commandInput'),
    commandResults: $('commandResults'), commandClose: $('commandClose'),
    commandButton: $('commandButton')
  };
  const state = {
    active: null, palette: [], selected: 0, previousFocus: null
  };

  const prettyDate = date => {
    if (!date) return '';
    const timestamp = new Date(date);
    return Number.isFinite(timestamp.valueOf()) ?
      new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}).format(timestamp) : '';
  };
  const projectFor = item =>
    (directory()?.projects() || []).find(project => project.repo === item.repo);
  const siteFor = item => item.kind === 'site' ? item :
    (directory()?.sites() || []).find(site => site.repo === item.repo);
  const imageSources = item => directory()?.images(item) || [];

  function showImage(item) {
    ui.area.replaceChildren();
    const frame = document.createElement('div');
    frame.className = 'preview-window detail-image-frame';
    const fallback = document.createElement('div');
    fallback.className = 'preview-placeholder';
    const label = document.createElement('strong');
    label.textContent = item?.name || 'Project';
    fallback.append(label);
    frame.append(fallback);
    const sources = imageSources(item).filter(URL_SAFE);
    if (sources.length) {
      const image = document.createElement('img');
      image.alt = 'Preview of ' + item.name;
      image.loading = 'eager';
      image.decoding = 'async';
      let index = 0;
      image.onerror = () => {
        if (++index < sources.length) image.src = sources[index];
        else image.remove();
      };
      image.src = sources[0];
      frame.append(image);
    }
    ui.area.append(frame);
  }

  function open(item) {
    if (!item) return;
    if (ui.command.open) ui.command.close();
    const site = siteFor(item);
    const repo = projectFor(item);
    state.active = item;
    const website = item.kind === 'site';

    ui.title.textContent = item.name;
    ui.icon.hidden = !(website && site?.icon && URL_SAFE(site.icon));
    if (!ui.icon.hidden) {
      ui.icon.onerror = () => { ui.icon.hidden = true; };
      ui.icon.src = site.icon;
    } else {
      ui.icon.removeAttribute('src');
    }
    ui.eyebrow.textContent = website ? 'WEBSITE / SOURCE' : 'GITHUB PROJECT';
    ui.description.textContent = item.description || 'Open-source project';
    ui.category.textContent = item.category || 'Project';
    ui.platform.textContent = website ? 'Web browser' : 'GitHub repository';
    ui.status.textContent = repo?.archived ? 'Archived' : (repo || item.kind === 'repo' ? 'Public' : 'Not linked');
    ui.created.textContent = prettyDate(repo?.created || item.created) || 'Not available';
    ui.updated.textContent = prettyDate(repo?.updated || item.updated) || 'Not available';
    const latest = repo || item;
    ui.release.textContent = latest.release || (latest.releaseChecked ?
      'No release' : 'Release unavailable');

    const links = [];
    if (site?.url && URL_SAFE(site.url)) links.push(
      '<a href="' + e(site.url) + '" target="_blank" rel="noopener noreferrer" class="detail-primary">' +
      'Visit website <span aria-hidden="true">↗</span></a>'
    );
    if (repo?.url && URL_SAFE(repo.url)) links.push(
      '<a href="' + e(repo.url) + '" target="_blank" rel="noopener noreferrer" class="detail-secondary">' +
      'View source on GitHub <span aria-hidden="true">↗</span></a>'
    );
    if (!repo && item.kind === 'repo' && URL_SAFE(item.url)) links.push(
      '<a href="' + e(item.url) + '" target="_blank" rel="noopener noreferrer" class="detail-secondary">' +
      'View on GitHub <span aria-hidden="true">↗</span></a>'
    );
    ui.links.innerHTML = links.join('') +
      '<div class="detail-forges">' + (directory()?.forges(item) || '') + '</div>';

    showImage(item);
    if (!ui.preview.open) ui.preview.showModal();
  }

  function unifiedItems() {
    const sites = directory()?.sites() || [];
    const repos = directory()?.projects() || [];
    const attached = new Set(sites.map(s => s.repo).filter(Boolean));
    return [...sites, ...repos.filter(repo => !attached.has(repo.repo))];
  }
  function recent() {
    if (ui.command.open) ui.command.close();
    directory()?.navigate('projects', 'recent');
    $('directoryPanel')?.focus({preventScroll: true});
    $('directoryPanel')?.scrollIntoView({behavior: 'smooth', block: 'start'});
  }
  function random() {
    const all = unifiedItems();
    if (!all.length) return;
    open(all[Math.floor(Math.random() * all.length)]);
  }
  function commands(q) {
    const text = q.trim().replace(/^>\s*/, '').toLocaleLowerCase();
    const forgeCommand = text.match(/^(github|gitlab|codeberg)\s+/);
    const forge = forgeCommand ? forgeCommand[1] : '';
    const needle = forge ? text.slice(forgeCommand[0].length).trim() : text;
    const all = unifiedItems();
    const repoOnly = (directory()?.projects() || []);
    const entries = (forge ? repoOnly : all)
      .filter(item => !needle || [item.name, item.repo, item.category, item.description]
        .some(v => String(v || '').toLocaleLowerCase().includes(needle)))
      .slice(0, 12)
      .map(item => ({
        kind: forge || 'project',
        title: item.name,
        detail: forge ?
          ('Open ' + forge[0].toUpperCase() + forge.slice(1) +
            (forge === 'github' ? ' repository' : ' path (not verified)')) :
          (item.kind === 'site' ? 'Website + source' : 'GitHub project'),
        item
      }));

    const actions = [
      {kind: 'recent', title: 'Recent projects', detail: 'Sort GitHub repositories by last update'},
      {kind: 'random', title: 'Random project', detail: 'Explore a random project'}
    ].filter(x => !needle || (x.title + ' ' + x.detail).toLowerCase().includes(needle));
    if (forge) return entries;
    if (!q.trim() || q.trim() === '>') return [...actions, ...entries.slice(0, 6)];
    const exactCommands = text === 'recent' || text === 'random' ?
      actions : (q.trim().startsWith('>') ? actions : []);
    return [...exactCommands, ...entries];
  }
  function renderPalette() {
    state.palette = commands(ui.commandInput.value);
    if (state.selected >= state.palette.length) state.selected = Math.max(0, state.palette.length - 1);
    ui.commandResults.innerHTML = state.palette.length
      ? state.palette.map((entry, i) =>
        '<button class="command-item' + (i === state.selected ? ' selected' : '') +
        '" id="command-option-' + i + '" type="button" role="option" data-command-index="' + i + '"' +
        ' aria-selected="' + (i === state.selected ? 'true' : 'false') + '">' +
        '<span class="command-kind">' + e(entry.kind === 'project' ? 'OPEN' :
          ['github', 'gitlab', 'codeberg'].includes(entry.kind) ? 'CODE' : 'GO') + '</span>' +
        '<span class="command-info"><strong>' + e(entry.title) +
        '</strong><small>' + e(entry.detail) + '</small></span>' +
        '<span class="command-arrow" aria-hidden="true">↗</span>' +
        '</button>'
      ).join('')
      : '<div class="command-empty" role="status">No matches. Try a project name or <code>&gt; recent</code>.</div>';
    if (state.palette.length) {
      ui.commandInput.setAttribute('aria-activedescendant','command-option-' + state.selected);
    } else {
      ui.commandInput.removeAttribute('aria-activedescendant');
    }
  }
  function choose(index) {
    const choice = state.palette[index];
    if (!choice) return;
    if (choice.kind === 'recent') recent();
    else if (choice.kind === 'random') random();
    else if (['github', 'gitlab', 'codeberg'].includes(choice.kind)) {
      const target = directory()?.forgeLinks(choice.item)?.find(link => link.provider === choice.kind);
      if (target && URL_SAFE(target.url)) {
        window.open(target.url, '_blank', 'noopener,noreferrer');
        ui.command.close();
      }
    } else if (choice.kind === 'project') open(choice.item);
  }
  function showPalette() {
    if (ui.preview.open) ui.preview.close();
    if (!ui.command.open) {
      state.previousFocus = document.activeElement;
      ui.commandInput.value = '';
      state.selected = 0;
      renderPalette();
      ui.command.showModal();
      ui.commandInput.focus();
    } else {
      ui.commandInput.focus();
      ui.commandInput.select();
    }
  }
  ui.close.addEventListener('click', () => ui.preview.close());
  ui.preview.addEventListener('click', ev => {
    if (ev.target === ui.preview) ui.preview.close();
  });
  ui.commandButton.addEventListener('click', showPalette);
  ui.commandClose.addEventListener('click', () => ui.command.close());
  ui.command.addEventListener('click', ev => {
    if (ev.target === ui.command) ui.command.close();
  });
  ui.command.addEventListener('close', () => {
    if (state.previousFocus?.isConnected && !ui.preview.open) state.previousFocus.focus();
  });
  ui.commandInput.addEventListener('input', () => { state.selected = 0; renderPalette(); });
  ui.commandInput.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!state.palette.length) return;
      state.selected = (state.selected + (ev.key === 'ArrowDown' ? 1 : -1) +
        state.palette.length) % state.palette.length;
      renderPalette();
      ui.commandResults.querySelector('.selected')?.scrollIntoView({block: 'nearest'});
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      choose(state.selected);
    }
  });
  ui.commandResults.addEventListener('click', ev => {
    const button = ev.target.closest('[data-command-index]');
    if (button) choose(Number(button.dataset.commandIndex));
  });

  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape') return; // Native modal handling
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      showPalette();
    }
  });

  const isMac = /Mac|iPhone|iPad/i.test(navigator.platform || '');
  document.querySelectorAll('.command-trigger kbd').forEach(kbd => {
    kbd.textContent = isMac ? '⌘ K' : 'Ctrl K';
  });

  window.HubExplorer = Object.freeze({
    open, showPalette,
    refresh() {
      if (ui.preview.open && state.active) {
        const site = siteFor(state.active);
        const project = projectFor(state.active);
        if (site || project) open(site || project);
      }
      if (ui.command.open) renderPalette();
    }
  });
})();
