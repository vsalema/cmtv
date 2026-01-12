// Tron Ares IPTV Player — Webtor torrents addon
// Adds a dedicated "Torrents" tab + list, and plays torrents via Webtor inside the existing iframe overlay.

(() => {
  'use strict';

  const LS_KEY = 'tronAresWebtorTorrents.v1';

  // ---- Helpers
  const safeParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
  const nextId = () => 'tw-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);

  const isProbablyMagnetOrTorrentUrl = (s) => {
    const v = (s || '').trim();
    return v.startsWith('magnet:?') || v.endsWith('.torrent') || v.startsWith('http://') || v.startsWith('https://');
  };

  const loadItems = () => {
    const raw = localStorage.getItem(LS_KEY);
    const data = safeParse(raw, []);
    return Array.isArray(data) ? data : [];
  };

  const saveItems = (items) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
  };

  // ---- State
  let torrentItems = loadItems();
  let currentTorrentIndex = -1;

  // ---- DOM hooks
  const tabsEl = document.querySelector('.tabs');
  const listsContainer = document.querySelector('.lists-container');
  const loaderPanel = document.querySelector('.loader-panel');

  if (!tabsEl || !listsContainer || !loaderPanel) return;

  // Create tab (after the base app attached its listeners → no conflicts)
  const torrentTabBtn = document.createElement('button');
  torrentTabBtn.className = 'tab-btn';
  torrentTabBtn.dataset.tab = 'torrents';
  torrentTabBtn.innerHTML = '<span>🧲</span>Torrents';

  // Insert before Favorites if possible
  const favBtn = tabsEl.querySelector('.tab-btn[data-tab="favorites"]');
  if (favBtn) tabsEl.insertBefore(torrentTabBtn, favBtn);
  else tabsEl.appendChild(torrentTabBtn);

  // Create list container
  const torrentListEl = document.createElement('div');
  torrentListEl.className = 'list';
  torrentListEl.id = 'torrentList';
  listsContainer.appendChild(torrentListEl);

  // ---- Loader UI (new section)
  const section = document.createElement('div');
  section.className = 'loader-section open';
  section.dataset.section = 'webtor';

  section.innerHTML = `
    <div class="loader-label collapsible-label">
      <span>Torrents (Webtor)</span>
      <span class="loader-toggle-icon">▸</span>
    </div>

    <div class="loader-section-body">
      <div class="loader-row">
        <input id="twTitleInput" class="input" placeholder="Titre (ex: Mon film…)" />
      </div>
      <div class="loader-row">
        <input id="twSrcInput" class="input" placeholder="magnet:?… ou URL .torrent" />
        <button class="btn btn-accent" id="twAddBtn">+ Ajouter</button>
      </div>
      <div class="loader-subrow" style="justify-content:flex-start;">
        <span style="opacity:.85;">Astuce: encode en MP4 (H.264 + AAC) pour compatibilité.</span>
      </div>
    </div>
  `;

  loaderPanel.appendChild(section);

  // Make its collapsible label behave like existing ones
  const collLabel = section.querySelector('.collapsible-label');
  if (collLabel) {
    collLabel.addEventListener('click', () => section.classList.toggle('open'));
  }

  const titleInput = section.querySelector('#twTitleInput');
  const srcInput = section.querySelector('#twSrcInput');
  const addBtn = section.querySelector('#twAddBtn');

  // ---- Rendering
  const matchesSearchLocal = (entry) => {
    try {
      if (typeof currentSearch === 'string' && currentSearch.trim()) {
        const q = currentSearch.trim().toLowerCase();
        const hay = (String(entry.name || '') + ' ' + String(entry.url || '')).toLowerCase();
        return hay.includes(q);
      }
    } catch {}
    return true;
  };

  const setTabActive = (tabName) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.list').forEach(l => l.classList.toggle('active', l.id === 'torrentList' ? (tabName === 'torrents') : l.classList.contains('active') && tabName !== 'torrents'));
    // Above line preserves existing logic for other tabs; we control torrents list explicitly.
  };

  const activateList = () => {
    // Deactivate all lists, then activate ours
    document.querySelectorAll('.list').forEach(l => l.classList.remove('active'));
    torrentListEl.classList.add('active');
  };

  const deriveLogoSafe = (name) => {
    try {
      if (typeof deriveLogoFromName === 'function') return deriveLogoFromName(name);
    } catch {}
    return { type: 'text', value: (String(name || '?').trim().slice(0, 1) || '?').toUpperCase() };
  };

  const renderTorrentList = () => {
    torrentListEl.innerHTML = '';

    const visible = torrentItems.filter(matchesSearchLocal);
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'torrent-empty';
      empty.textContent = torrentItems.length ? 'Aucun résultat.' : 'Aucun torrent ajouté.';
      torrentListEl.appendChild(empty);
      return;
    }

    visible.forEach((it) => {
      const realIndex = torrentItems.findIndex(x => x && x.id === it.id);
      const li = document.createElement('div');
      li.className = 'channel-item';
      li.dataset.index = String(realIndex);
      li.dataset.type = 'torrents';

      // active
      try {
        if (typeof currentEntry !== 'undefined' && currentEntry && currentEntry.id === it.id) li.classList.add('active');
      } catch {}

      const logoDiv = document.createElement('div');
      logoDiv.className = 'channel-logo';
      const logo = it.logo || deriveLogoSafe(it.name);
      if (logo.type === 'image') {
        const img = document.createElement('img');
        img.src = logo.value;
        img.alt = it.name || '';
        try { img.loading = 'lazy'; } catch {}
        try { img.decoding = 'async'; } catch {}
        logoDiv.appendChild(img);
      } else {
        logoDiv.textContent = logo.value;
      }

      const metaDiv = document.createElement('div');
      metaDiv.className = 'channel-meta';

      const titleRow = document.createElement('div');
      titleRow.className = 'channel-title-row';

      const numDiv = document.createElement('div');
      numDiv.className = 'channel-num';
      numDiv.textContent = String(realIndex + 1);

      const titleDiv = document.createElement('div');
      titleDiv.className = 'channel-title';
      titleDiv.textContent = (typeof normalizeName === 'function') ? normalizeName(it.name) : (it.name || 'Torrent');

      const statusBadge = document.createElement('span');
      statusBadge.className = 'link-status';

      titleRow.appendChild(numDiv);
      titleRow.appendChild(titleDiv);
      titleRow.appendChild(statusBadge);

      const subDiv = document.createElement('div');
      subDiv.className = 'channel-sub';
      subDiv.textContent = 'Torrent (Webtor)';

      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'channel-tags';

      const tagIframe = document.createElement('div');
      tagIframe.className = 'tag-chip tag-chip--iframe';
      tagIframe.textContent = 'IFRAME';

      const tagTorrent = document.createElement('div');
      tagTorrent.className = 'tag-chip tag-chip--torrent';
      tagTorrent.textContent = 'TORRENT';

      tagsDiv.appendChild(tagIframe);
      tagsDiv.appendChild(tagTorrent);

      metaDiv.appendChild(titleRow);
      metaDiv.appendChild(subDiv);
      metaDiv.appendChild(tagsDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'channel-actions';

      const favBtn = document.createElement('button');
      favBtn.className = 'icon-btn';
      favBtn.innerHTML = '★';
      favBtn.title = 'Marquer (local)';

      favBtn.dataset.fav = it.isFavorite ? 'true' : 'false';
      favBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        it.isFavorite = !it.isFavorite;
        favBtn.dataset.fav = it.isFavorite ? 'true' : 'false';
        saveItems(torrentItems);
      });

      const playBtn = document.createElement('button');
      playBtn.className = 'icon-btn';
      playBtn.innerHTML = '⧉';
      playBtn.title = 'Lire en overlay Webtor';
      playBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        playTorrent(realIndex);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.innerHTML = '🗑';
      delBtn.title = 'Supprimer';
      delBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        torrentItems = torrentItems.filter(x => x && x.id !== it.id);
        saveItems(torrentItems);
        if (currentTorrentIndex >= torrentItems.length) currentTorrentIndex = torrentItems.length - 1;
        renderTorrentList();
        try { if (typeof refreshActiveListsUI === 'function') refreshActiveListsUI(); } catch {}
      });

      actionsDiv.appendChild(favBtn);
      actionsDiv.appendChild(playBtn);
      actionsDiv.appendChild(delBtn);

      li.appendChild(logoDiv);
      li.appendChild(metaDiv);
      li.appendChild(actionsDiv);

      li.addEventListener('click', () => playTorrent(realIndex));

      torrentListEl.appendChild(li);
    });
  };

  // ---- Playback
  const webtorOverlayUrlFor = (src) => {
    // Same folder as index.html
    return 'webtor-overlay.html?src=' + encodeURIComponent(String(src || '').trim());
  };

  // Patch playEntryAsOverlay so the top-bar toggle works even if currentEntry is a torrent
  if (typeof playEntryAsOverlay === 'function') {
    const __origPlayEntryAsOverlay = playEntryAsOverlay;
    // eslint-disable-next-line no-global-assign
    playEntryAsOverlay = function(entry) {
      try {
        if (entry && entry.__webtor === true && entry.url) {
          // Use existing iframe overlay
          if (typeof showIframe === 'function') showIframe();
          if (typeof leaveOfflineMode === 'function') leaveOfflineMode();

          try { if (typeof currentEntry !== 'undefined') currentEntry = entry; } catch {}
          try { if (typeof activePlaybackMode !== 'undefined') activePlaybackMode = 'iframe'; } catch {}

          if (typeof iframeEl !== 'undefined' && iframeEl) iframeEl.src = webtorOverlayUrlFor(entry.url);

          if (typeof updateNowPlaying === 'function') updateNowPlaying(entry, 'WEBTOR');
          if (typeof setStatus === 'function') setStatus('Overlay Webtor actif');

          try { if (typeof refreshTrackMenus === 'function') refreshTrackMenus(); } catch {}
          return;
        }
      } catch {}
      return __origPlayEntryAsOverlay(entry);
    };
  }

  const playTorrent = (index) => {
    if (index < 0 || index >= torrentItems.length) return;
    const it = torrentItems[index];
    if (!it || !it.url) return;

    // Track active in this tab
    currentTorrentIndex = index;

    // Mark the entry so the toggle button is safe
    it.__webtor = true;
    it.isIframe = true;
    it.group = it.group || 'Torrent (Webtor)';

    try { currentListType = 'torrents'; } catch {}
    try { currentEntry = it; } catch {}
    try { activePlaybackMode = 'iframe'; } catch {}

    if (typeof showIframe === 'function') showIframe();
    if (typeof iframeEl !== 'undefined' && iframeEl) iframeEl.src = webtorOverlayUrlFor(it.url);

    if (typeof updateNowPlaying === 'function') updateNowPlaying(it, 'WEBTOR');
    if (typeof setStatus === 'function') setStatus('Lecture torrent (Webtor)');

    // Update UI
    renderTorrentList();
    try { if (typeof updateNowPlayingCounter === 'function') updateNowPlayingCounter(); } catch {}
    try { if (typeof scrollToActiveItem === 'function') scrollToActiveItem(); } catch {}
  };

  // Expose for debugging if needed
  window.__tronWebtor = { playTorrent };

  // ---- Hook tab click (we control it entirely)
  torrentTabBtn.addEventListener('click', () => {
    // Stop radio overlay if needed (same idea as base app) — keep it best-effort
    try {
      const radioOverlayOpen = (typeof radioOverlayLayer !== 'undefined') && radioOverlayLayer && radioOverlayLayer.style.display !== 'none';
      const skipAutoplay = radioOverlayOpen || (typeof radioPlaying !== 'undefined' && radioPlaying);
      if (skipAutoplay && typeof stopRadioAndRestore === 'function') stopRadioAndRestore();
    } catch {}

    // Set tab active, activate list
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    torrentTabBtn.classList.add('active');

    activateList();
    try { currentListType = 'torrents'; } catch {}
    renderTorrentList();

    // Autoplay first item (only if nothing playing)
    try {
      if (typeof currentEntry === 'undefined' || !currentEntry) {
        if (torrentItems.length) playTorrent(0);
      }
    } catch {}
  });

  // ---- Extend core functions safely (Next/Prev + counter + scroll + refresh + autoplay)
  const wrap = (name, fn) => {
    try {
      const orig = window[name];
      if (typeof orig !== 'function') return;
      window[name] = fn(orig);
    } catch {}
  };

  wrap('playNext', (orig) => function() {
    try {
      if (typeof currentListType !== 'undefined' && currentListType === 'torrents') {
        if (!torrentItems.length) return;
        if (currentTorrentIndex === -1) currentTorrentIndex = 0;
        else currentTorrentIndex = (currentTorrentIndex + 1) % torrentItems.length;
        playTorrent(currentTorrentIndex);
        return;
      }
    } catch {}
    return orig();
  });

  wrap('playPrev', (orig) => function() {
    try {
      if (typeof currentListType !== 'undefined' && currentListType === 'torrents') {
        if (!torrentItems.length) return;
        if (currentTorrentIndex === -1) currentTorrentIndex = torrentItems.length - 1;
        else currentTorrentIndex = (currentTorrentIndex - 1 + torrentItems.length) % torrentItems.length;
        playTorrent(currentTorrentIndex);
        return;
      }
    } catch {}
    return orig();
  });

  wrap('scrollToActiveItem', (orig) => function() {
    try {
      if (typeof currentListType !== 'undefined' && currentListType === 'torrents') {
        const activeItem = torrentListEl.querySelector('.channel-item.active');
        if (!activeItem) return;
        const listRect = torrentListEl.getBoundingClientRect();
        const itemRect = activeItem.getBoundingClientRect();
        const delta = (itemRect.top - listRect.top) - (listRect.height / 2 - itemRect.height / 2);
        torrentListEl.scrollTop += delta;
        return;
      }
    } catch {}
    return orig();
  });

  wrap('updateNowPlayingCounter', (orig) => function() {
    try {
      if (typeof currentListType !== 'undefined' && currentListType === 'torrents') {
        if (typeof npCounter !== 'undefined' && npCounter) {
          const total = torrentItems.length;
          const pos = currentTorrentIndex >= 0 ? (currentTorrentIndex + 1) : 0;
          const newText = total ? `${pos}/${total}` : '-/-';
          if (npCounter.textContent !== newText) npCounter.textContent = newText;
        }
        return;
      }
    } catch {}
    return orig();
  });

  wrap('refreshActiveListsUI', (orig) => function() {
    try {
      if (typeof currentListType !== 'undefined' && currentListType === 'torrents') {
        renderTorrentList();
        return;
      }
    } catch {}
    return orig();
  });

  wrap('renderLists', (orig) => function() {
    return function() {
      const r = orig();
      try { renderTorrentList(); } catch {}
      return r;
    };
  });

  wrap('autoplayFirstInList', (orig) => function() {
    return function(listType) {
      try {
        if (listType === 'torrents') {
          if (!torrentItems.length) return;
          playTorrent(0);
          return;
        }
      } catch {}
      return orig(listType);
    };
  });

  // ---- Add action
  const addTorrent = () => {
    const title = (titleInput?.value || '').trim() || 'Torrent';
    const src = (srcInput?.value || '').trim();

    if (!src) {
      try { if (typeof setStatus === 'function') setStatus('Colle un magnet (magnet:?) ou une URL .torrent'); } catch {}
      return;
    }
    if (!isProbablyMagnetOrTorrentUrl(src)) {
      try { if (typeof setStatus === 'function') setStatus('Ça ne ressemble pas à un magnet ni à une URL .torrent'); } catch {}
      return;
    }

    const entry = {
      id: nextId(),
      name: title,
      url: src,
      logo: deriveLogoSafe(title),
      group: 'Torrent (Webtor)',
      isIframe: true,
      isFavorite: false,
      __webtor: true
    };

    torrentItems.push(entry);
    saveItems(torrentItems);

    if (titleInput) titleInput.value = '';
    if (srcInput) srcInput.value = '';

    renderTorrentList();
    playTorrent(torrentItems.length - 1);
  };

  addBtn?.addEventListener('click', addTorrent);
  srcInput?.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') addTorrent(); });

  // Initial render
  renderTorrentList();
})();
