(() => {
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const PANEL_ID = 'yt-speed-panel';
  const TOAST_ID = 'yt-speed-toast';
  const GAP = 8; // px between the player and the panel
  const MARGIN = 4; // px the dragged panel keeps from the window edges
  const DEFAULTS = {
    speed: 1,
    hidden: false,
    scale: 1, // panel size, 1 = 100%
    positions: {}, // site name -> { x, y } of the panel's top-left corner, in viewport px
    hotkeys: {
      faster: { key: '+', ctrl: false, alt: false, meta: false, shift: false },
      slower: { key: '-', ctrl: false, alt: false, meta: false, shift: false },
      screenshot: { key: 's', ctrl: false, alt: false, meta: false, shift: false },
    },
    shotFormat: 'jpg', // 'jpg' or 'png'
  };
  let settings = structuredClone(DEFAULTS);
  let boundVideo = null;
  let observedPlayer = null;
  let toastTimer = 0;
  const resizeObserver = new ResizeObserver(() => position());

  // The largest visible <video> on the page (Udemy has no stable player ids)
  function largestVideo() {
    let best = null;
    let bestArea = 0;
    document.querySelectorAll('video').forEach((v) => {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = v; bestArea = area; }
    });
    return best;
  }

  const SITES = {
    youtube: {
      isActive: () => location.pathname === '/watch',
      getPlayer: () => document.querySelector('ytd-watch-flexy #movie_player'),
      getVideo: () => document.querySelector('#movie_player video, video.html5-main-video'),
    },
    udemy: {
      isActive: () => true, // the panel shows up wherever a video exists (course lectures)
      getPlayer: () => {
        const video = largestVideo();
        return video ? video.closest('[class*="video-player--container"]') || video : null;
      },
      getVideo: largestVideo,
      // Udemy's player keeps its own speed (1× unless set in its menu) and puts it
      // back on the video when playback is paused or resumed
      restoresOwnRate: true,
    },
  };
  const siteName = /(^|\.)udemy\.com$/.test(location.hostname) ? 'udemy' : 'youtube';
  const site = SITES[siteName];
  const getPlayer = site.getPlayer;
  const getVideo = site.getVideo;

  function save(data) {
    try { chrome.storage.local.set(data); } catch (e) { /* extension context invalidated */ }
  }

  function highlight(rate) {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const video = getVideo();
    const paused = !!video && video.paused;
    panel.querySelectorAll('button[data-speed]').forEach((btn) => {
      const speed = Number(btn.dataset.speed);
      const active = speed === rate;
      btn.classList.toggle('ysp-active', active);
      // While paused, the current speed button turns into a play button
      const showPlay = active && paused;
      btn.textContent = showPlay ? '▶︎' : speed + '×';
      btn.title = showPlay ? 'Play' : active ? 'Pause' : '';
    });
  }

  function setSpeed(rate) {
    settings.speed = rate;
    save({ speed: rate });
    const video = getVideo();
    if (video) video.playbackRate = rate;
    highlight(rate);
  }

  // Clicking the button of the current speed toggles play/pause
  function onSpeedClick(rate) {
    const video = getVideo();
    if (video && video.playbackRate === rate) {
      if (video.paused) video.play().catch(() => {});
      else video.pause();
      return;
    }
    setSpeed(rate);
  }

  // ---------- Screenshot ----------

  const CAMERA_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>';

  function videoTitle() {
    let title = '';
    if (siteName === 'youtube') {
      title = document.querySelector('ytd-watch-metadata h1')?.textContent || '';
      if (!title.trim()) title = document.title.replace(/\s*-\s*YouTube\s*$/, '');
    } else {
      title = document.title.replace(/\s*\|\s*Udemy\s*$/, '');
    }
    return title;
  }

  // YouTube channel name; Udemy has no channel, so it stays empty there
  function channelName() {
    if (siteName !== 'youtube') return '';
    const el = document.querySelector('ytd-watch-metadata ytd-channel-name a')
      || document.querySelector('ytd-watch-metadata #owner #channel-name #text');
    return el ? el.textContent : '';
  }

  // Video position as 1-02-03 (or 02-03 under an hour): colons are not allowed in file names
  function timeLabel(seconds) {
    const t = Math.floor(seconds || 0);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}-${pad(m)}-${pad(sec)}` : `${pad(m)}-${pad(sec)}`;
  }

  function cleanForFileName(text, maxLength) {
    return text
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ') // characters Windows does not allow
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, maxLength)
      .trim();
  }

  // 12-34 - Video title (Channel).jpg
  function fileName(video) {
    const title = cleanForFileName(videoTitle(), 150) || 'video';
    const channel = cleanForFileName(channelName(), 60);
    const ext = settings.shotFormat === 'png' ? 'png' : 'jpg';
    return `${timeLabel(video.currentTime)} - ${title}${channel ? ` (${channel})` : ''}.${ext}`;
  }

  function takeScreenshot() {
    const video = getVideo();
    if (!video || !video.videoWidth) {
      showToast('No video frame');
      return;
    }
    video.pause();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const name = fileName(video);
    try {
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) { showToast('Screenshot failed'); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showToast('Screenshot saved');
      }, settings.shotFormat === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    } catch (e) {
      // Protected (DRM) videos, e.g. some Udemy courses, do not allow reading their frames
      showToast('This video does not allow screenshots');
    }
  }

  // ---------- Dragging ----------

  function clampToViewport(x, y, panel) {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const maxX = Math.max(MARGIN, window.innerWidth - w - MARGIN);
    const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    return {
      x: Math.min(Math.max(x, MARGIN), maxX),
      y: Math.min(Math.max(y, MARGIN), maxY),
    };
  }

  function startDrag(e, panel) {
    if (e.button !== 0) return;
    e.preventDefault();
    const grip = e.currentTarget;
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    let pos = { x: rect.left, y: rect.top };
    panel.classList.add('ysp-custom', 'ysp-dragging');
    grip.setPointerCapture(e.pointerId);

    const move = (ev) => {
      pos = clampToViewport(ev.clientX - dx, ev.clientY - dy, panel);
      panel.style.left = pos.x + 'px';
      panel.style.top = pos.y + 'px';
    };
    const end = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', end);
      grip.removeEventListener('pointercancel', end);
      panel.classList.remove('ysp-dragging');
      settings.positions = { ...settings.positions, [siteName]: pos };
      save({ positions: settings.positions });
    };
    move(e);
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const grip = document.createElement('div');
    grip.className = 'ysp-grip';
    grip.title = 'Drag to move';
    grip.addEventListener('pointerdown', (e) => startDrag(e, panel));
    panel.appendChild(grip);

    SPEEDS.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.speed = String(s);
      btn.textContent = s + '×';
      btn.addEventListener('click', () => onSpeedClick(s));
      // Keep focus on the player so its keyboard shortcuts (space etc.) keep working
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      panel.appendChild(btn);
    });

    const sep = document.createElement('span');
    sep.className = 'ysp-sep';
    panel.appendChild(sep);

    const shot = document.createElement('button');
    shot.type = 'button';
    shot.className = 'ysp-shot';
    shot.title = 'Screenshot: pause and save the frame';
    shot.innerHTML = CAMERA_SVG;
    shot.addEventListener('click', takeScreenshot);
    shot.addEventListener('mousedown', (e) => e.preventDefault());
    panel.appendChild(shot);
    return panel;
  }

  // By default the panel sits centered right below the player, in viewport coordinates
  // (position: fixed, so it also follows players inside inner scroll containers).
  // Once dragged, it stays where it was dropped.
  function position() {
    const panel = document.getElementById(PANEL_ID);
    const player = getPlayer();
    if (!panel || !player) return;
    const rect = player.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';
    const custom = settings.positions[siteName];
    panel.classList.toggle('ysp-custom', !!custom);
    if (custom) {
      if (panel.classList.contains('ysp-dragging')) return;
      const pos = clampToViewport(custom.x, custom.y, panel);
      panel.style.left = pos.x + 'px';
      panel.style.top = pos.y + 'px';
      return;
    }
    panel.style.top = rect.bottom + GAP + 'px';
    panel.style.left = rect.left + rect.width / 2 + 'px';
  }

  // ---------- Hotkeys ----------

  // Same rules as in the settings popup: '=' counts as '+' (the same key without
  // Shift), and Shift only matters for keys whose character it does not change.
  function normalizeKey(key) {
    if (key === '=') return '+';
    return key.length === 1 ? key.toLowerCase() : key;
  }

  function matches(e, hk) {
    if (!hk || !hk.key) return false;
    const key = normalizeKey(e.key);
    if (key !== normalizeKey(hk.key)) return false;
    if (e.ctrlKey !== !!hk.ctrl || e.altKey !== !!hk.alt || e.metaKey !== !!hk.meta) return false;
    const printable = e.key.length === 1 && e.key.toLowerCase() === e.key.toUpperCase();
    return printable || e.shiftKey === !!hk.shift;
  }

  function isTyping(e) {
    const el = e.composedPath ? e.composedPath()[0] : e.target;
    if (!el || !el.tagName) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName.toLowerCase();
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag !== 'input') return false;
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(el.type);
  }

  function showToast(text) {
    const player = getPlayer();
    if (!player) return;
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement('div');
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    const rect = player.getBoundingClientRect();
    toast.textContent = text;
    toast.style.left = rect.left + rect.width / 2 + 'px';
    toast.style.top = rect.top + Math.min(60, rect.height / 4) + 'px';
    toast.classList.add('ysp-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('ysp-show'), 700);
  }

  function stepSpeed(dir) {
    const video = getVideo();
    const current = video ? video.playbackRate : settings.speed;
    let next;
    if (dir > 0) next = SPEEDS.find((s) => s > current + 1e-9) ?? SPEEDS[SPEEDS.length - 1];
    else next = [...SPEEDS].reverse().find((s) => s < current - 1e-9) ?? SPEEDS[0];
    setSpeed(next);
    showToast(next + '×');
  }

  function onKeyDown(e) {
    if (!site.isActive() || !getVideo() || isTyping(e)) return;
    let action = null;
    if (matches(e, settings.hotkeys.faster)) action = () => stepSpeed(1);
    else if (matches(e, settings.hotkeys.slower)) action = () => stepSpeed(-1);
    else if (matches(e, settings.hotkeys.screenshot)) action = takeScreenshot;
    if (!action) return;
    // Take the key away from the site (YouTube uses +/- for caption size)
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat || action !== takeScreenshot) action();
  }

  // ---------- Wiring ----------

  function bindVideo() {
    const video = getVideo();
    if (!video || video === boundVideo) return;
    boundVideo = video;
    // When the site changes the speed by itself right after play/pause/seek
    // (Udemy does), put the chosen speed back
    let guardUntil = 0;
    const guard = () => {
      if (!site.restoresOwnRate) return;
      guardUntil = performance.now() + 2000;
      if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
    };
    video.addEventListener('ratechange', () => {
      if (performance.now() < guardUntil && video.playbackRate !== settings.speed) {
        video.playbackRate = settings.speed;
        return;
      }
      highlight(video.playbackRate);
    });
    video.addEventListener('play', () => { guard(); highlight(video.playbackRate); });
    video.addEventListener('pause', () => { guard(); highlight(video.playbackRate); });
    video.addEventListener('seeked', guard);
    // The site resets the speed when a new video loads, so re-apply the saved one
    video.addEventListener('loadedmetadata', () => {
      if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
    });
    if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
  }

  function ensurePanel() {
    const player = getPlayer();
    if (!site.isActive() || !player) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    bindVideo();
    if (settings.hidden) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = buildPanel();
      document.body.appendChild(panel);
    }
    const scale = String(settings.scale);
    if (panel.style.getPropertyValue('--ysp-scale') !== scale) {
      panel.style.setProperty('--ysp-scale', scale);
    }
    if (player !== observedPlayer) {
      if (observedPlayer) resizeObserver.unobserve(observedPlayer);
      resizeObserver.observe(player);
      observedPlayer = player;
    }
    const video = getVideo();
    highlight(video ? video.playbackRate : settings.speed);
    position();
  }

  // Settings changed in the popup (or in another tab)
  function onStorageChanged(changes, area) {
    if (area !== 'local') return;
    if (changes.hidden) settings.hidden = !!changes.hidden.newValue;
    if (changes.shotFormat) settings.shotFormat = changes.shotFormat.newValue || 'jpg';
    if (changes.scale) settings.scale = Number(changes.scale.newValue) || 1;
    if (changes.positions) settings.positions = changes.positions.newValue || {};
    if (changes.hotkeys) settings.hotkeys = { ...DEFAULTS.hotkeys, ...changes.hotkeys.newValue };
    if (changes.speed) {
      settings.speed = Number(changes.speed.newValue) || 1;
      const video = getVideo();
      if (video && video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
    }
    ensurePanel();
  }

  function init() {
    ensurePanel();
    document.addEventListener('yt-navigate-finish', ensurePanel);
    window.addEventListener('resize', position);
    window.addEventListener('keydown', onKeyDown, true);
    chrome.storage.onChanged.addListener(onStorageChanged);
    let posScheduled = false;
    document.addEventListener('scroll', () => {
      if (posScheduled) return;
      posScheduled = true;
      requestAnimationFrame(() => { posScheduled = false; position(); });
    }, { capture: true, passive: true });
    let scheduled = false;
    new MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; ensurePanel(); });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  chrome.storage.local.get(DEFAULTS, (data) => {
    settings = {
      speed: Number(data.speed) || 1,
      hidden: !!data.hidden,
      scale: Number(data.scale) || 1,
      shotFormat: data.shotFormat || 'jpg',
      positions: data.positions || {},
      hotkeys: { ...DEFAULTS.hotkeys, ...data.hotkeys },
    };
    init();
  });
})();
