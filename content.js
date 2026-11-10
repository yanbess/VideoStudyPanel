(() => {
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const PANEL_ID = 'yt-speed-panel';
  const TOAST_ID = 'yt-speed-toast';
  const GAP = 8; // px between the player and the panel
  const MARGIN = 4; // px the dragged panel keeps from the window edges
  const MIN_VIDEO_AREA = 200 * 112; // smaller videos are previews and thumbnails, not lessons
  const MSG = '__videoStudyPanel'; // marks our messages between the page and its video frames
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

  // ================= Shared by the page and its video frames =================

  function save(data) {
    try { chrome.storage.local.set(data); } catch (e) { /* extension context invalidated */ }
  }

  // The largest visible <video> on the page (most course sites have no stable player ids)
  function largestVideo() {
    let best = null;
    let bestArea = MIN_VIDEO_AREA - 1;
    document.querySelectorAll('video').forEach((v) => {
      const r = v.getBoundingClientRect();
      const area = r.width * r.height;
      if (area > bestArea) { best = v; bestArea = area; }
    });
    return best;
  }

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

  // 'faster', 'slower', 'screenshot', or null
  function hotkeyAction(e) {
    if (isTyping(e)) return null;
    if (matches(e, settings.hotkeys.faster)) return 'faster';
    if (matches(e, settings.hotkeys.slower)) return 'slower';
    if (matches(e, settings.hotkeys.screenshot)) return 'screenshot';
    return null;
  }

  // Keeps the chosen speed on a <video>. Many players (Udemy, and others) keep
  // their own speed and put it back on play, pause, or seek: right after those,
  // the chosen speed is restored.
  function bindVideo(video, { guardOwnRate, onChange }) {
    let guardUntil = 0;
    const guard = () => {
      if (!guardOwnRate) return;
      guardUntil = performance.now() + 2000;
      if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
    };
    video.addEventListener('ratechange', () => {
      if (performance.now() < guardUntil && video.playbackRate !== settings.speed) {
        video.playbackRate = settings.speed;
        return;
      }
      onChange();
    });
    video.addEventListener('play', () => { guard(); onChange(); });
    video.addEventListener('pause', () => { guard(); onChange(); });
    video.addEventListener('seeked', guard);
    // Sites reset the speed when a new video loads, so re-apply the saved one
    video.addEventListener('loadedmetadata', () => {
      if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
    });
    if (video.playbackRate !== settings.speed) video.playbackRate = settings.speed;
  }

  function togglePlay(video) {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  // Pauses the video and returns its current frame as an image Blob.
  // Throws on protected (DRM) videos, whose frames cannot be read.
  function captureFrame(video, format) {
    if (!video.videoWidth) return Promise.reject(new Error('no-frame'));
    video.pause();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('failed'))),
        format === 'png' ? 'image/png' : 'image/jpeg',
        0.92,
      );
    });
  }

  function onSettingsChanged(changes) {
    if (changes.hidden) settings.hidden = !!changes.hidden.newValue;
    if (changes.shotFormat) settings.shotFormat = changes.shotFormat.newValue || 'jpg';
    if (changes.scale) settings.scale = Number(changes.scale.newValue) || 1;
    if (changes.positions) settings.positions = changes.positions.newValue || {};
    if (changes.hotkeys) settings.hotkeys = { ...DEFAULTS.hotkeys, ...changes.hotkeys.newValue };
    if (changes.speed) settings.speed = Number(changes.speed.newValue) || 1;
  }

  // ================= Inside a video frame (Vimeo, Wistia, YouTube embeds…) =================
  // The panel lives on the page itself; the frame only reports its video and
  // follows the page's commands. It does nothing until the page answers, so
  // embeds on sites the extension does not cover are left alone.

  function runInFrame() {
    let video = null;
    let welcomed = false;

    const post = (data) => window.top.postMessage({ [MSG]: true, ...data }, '*');

    function report() {
      if (!video || !video.isConnected) return;
      const r = video.getBoundingClientRect();
      post({
        type: 'state',
        rate: video.playbackRate,
        paused: video.paused,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
      });
    }

    function findVideo() {
      const v = largestVideo();
      if (v && v !== video) {
        video = v;
        if (welcomed) {
          bindVideo(video, { guardOwnRate: true, onChange: report });
        }
      }
      report();
    }

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (e.source !== window.top || !d || !d[MSG]) return;
      if (d.type === 'welcome' && !welcomed) {
        welcomed = true;
        if (video) bindVideo(video, { guardOwnRate: true, onChange: report });
        report();
      }
      if (!welcomed || !video) return;
      if (d.type === 'setRate' && SPEEDS.includes(d.rate)) {
        settings.speed = d.rate;
        video.playbackRate = d.rate;
      } else if (d.type === 'toggle') {
        togglePlay(video);
      } else if (d.type === 'shot') {
        const time = video.currentTime;
        captureFrame(video, d.format)
          .then((blob) => post({ type: 'shotResult', id: d.id, blob, time }))
          .catch((err) => post({ type: 'shotResult', id: d.id, error: err.message || 'drm' }));
      }
    });

    window.addEventListener('keydown', (e) => {
      if (!welcomed || !video) return;
      const action = hotkeyAction(e);
      if (!action) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat || action !== 'screenshot') post({ type: 'hotkey', action });
    }, true);

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      onSettingsChanged(changes);
      if (changes.speed && welcomed && video && video.playbackRate !== settings.speed) {
        video.playbackRate = settings.speed;
      }
    });

    // Light polling: frames are small documents, and this also re-sends the
    // video's place when the frame scrolls or resizes
    findVideo();
    setInterval(findVideo, 1000);
    window.addEventListener('resize', report);
  }

  // ================= On the page itself: the panel =================

  // Site name suffixes to strip from the tab title when naming screenshots
  const TITLE_SUFFIX = new RegExp(
    '\\s*[|–—-]\\s*(Udemy|Coursera|edX|LinkedIn( Learning)?|Pluralsight|Skillshare|Domestika|MasterClass'
    + '|Khan Academy|Frontend Masters|egghead(\\.io)?|Stepik|Skillbox|Нетология|Netology'
    + '|Яндекс Практикум|Yandex Practicum|Practicum|Teachable|Thinkific|Kajabi|GetCourse)\\s*$', 'i');

  const SITES = {
    youtube: {
      test: /(^|\.)youtube\.com$/,
      isActive: () => location.pathname === '/watch',
      getPlayer: () => document.querySelector('ytd-watch-flexy #movie_player'),
      getVideo: () => document.querySelector('#movie_player video, video.html5-main-video'),
      title: () => document.querySelector('ytd-watch-metadata h1')?.textContent
        || document.title.replace(/\s*-\s*YouTube\s*$/, ''),
      channel: () => (document.querySelector('ytd-watch-metadata ytd-channel-name a')
        || document.querySelector('ytd-watch-metadata #owner #channel-name #text'))?.textContent || '',
      guardOwnRate: false, // YouTube keeps the speed; its own menu must keep working
      ownsVideoFrames: false, // youtube.com pages do not embed lessons in frames
    },
    udemy: {
      test: /(^|\.)udemy\.com$/,
      getPlayer: (video) => video.closest('[class*="video-player--container"]') || video,
    },
  };
  // Every other course site uses the generic behavior: the largest video on
  // the page or in one of its frames, the tab title for screenshot names
  const GENERIC = {
    isActive: () => true,
    getPlayer: (video) => video,
    getVideo: largestVideo,
    title: () => document.title.replace(TITLE_SUFFIX, ''),
    channel: () => '',
    guardOwnRate: true,
    ownsVideoFrames: true,
  };

  function runOnPage() {
    const known = Object.entries(SITES).find(([, s]) => s.test.test(location.hostname));
    const siteName = known ? known[0] : location.hostname.replace(/^www\./, '');
    const site = { ...GENERIC, ...(known ? known[1] : {}) };

    let target = null; // what the panel controls now, see localTarget/frameTarget
    let boundVideo = null;
    let observedEl = null;
    let toastTimer = 0;
    let shotId = 0;
    const pendingShots = new Map(); // id -> resolve
    const videoFrames = new Map(); // frame window -> { state, seen }
    const resizeObserver = new ResizeObserver(() => position());

    // ---------- Targets: a video on the page, or one inside a frame ----------

    function localTarget(video) {
      const player = site.getPlayer(video) || video;
      return {
        key: video,
        el: player,
        rate: () => video.playbackRate,
        paused: () => video.paused,
        rect: () => player.getBoundingClientRect(),
        setRate: (r) => { video.playbackRate = r; },
        toggle: () => togglePlay(video),
        shot: () => {
          const time = video.currentTime;
          return captureFrame(video, settings.shotFormat).then((blob) => ({ blob, time }));
        },
      };
    }

    // The <iframe> on this page that holds the frame window `win` (directly or deeper)
    function frameElementOf(win) {
      let w = win;
      try {
        while (w && w.parent !== window) {
          if (w.parent === w) return null;
          w = w.parent;
        }
      } catch (e) { return null; }
      if (!w) return null;
      for (const el of document.querySelectorAll('iframe')) {
        if (el.contentWindow === w) return { el, direct: w === win };
      }
      return null;
    }

    function frameTarget(win, info) {
      const send = (data) => win.postMessage({ [MSG]: true, ...data }, '*');
      const rect = () => {
        const r = info.el.getBoundingClientRect();
        const v = videoFrames.get(win)?.state.rect;
        // The video's place inside the frame is known only for frames placed right on the page
        if (!info.direct || !v || !v.width) return r;
        return new DOMRect(r.left + v.left, r.top + v.top, v.width, v.height);
      };
      return {
        key: win,
        el: info.el,
        rate: () => videoFrames.get(win)?.state.rate ?? settings.speed,
        paused: () => !!videoFrames.get(win)?.state.paused,
        rect,
        setRate: (r) => send({ type: 'setRate', rate: r }),
        toggle: () => send({ type: 'toggle' }),
        shot: () => new Promise((resolve, reject) => {
          const id = ++shotId;
          pendingShots.set(id, { resolve, reject });
          send({ type: 'shot', id, format: settings.shotFormat });
          setTimeout(() => {
            if (pendingShots.delete(id)) reject(new Error('timeout'));
          }, 5000);
        }),
      };
    }

    function area(r) {
      const w = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      // Off-screen players still count, a little, so the panel does not flicker while scrolling
      return w * h || (r.width * r.height) / 1000;
    }

    function pickTarget() {
      if (!site.isActive()) return null;
      let best = null;
      let bestArea = 0;
      const video = site.getVideo();
      if (video) {
        const t = target && target.key === video ? target : localTarget(video);
        best = t;
        bestArea = area(t.rect());
      }
      if (site.ownsVideoFrames) {
        const now = Date.now();
        videoFrames.forEach((f, win) => {
          const info = now - f.seen < 3000 ? frameElementOf(win) : null;
          if (!info) { videoFrames.delete(win); return; }
          const t = target && target.key === win ? target : frameTarget(win, info);
          const a = area(t.rect());
          if (a > bestArea) { best = t; bestArea = a; }
        });
      }
      return best;
    }

    window.addEventListener('message', (e) => {
      const d = e.data;
      if (!d || !d[MSG] || !site.ownsVideoFrames || !e.source || e.source === window) return;
      if (!frameElementOf(e.source)) return; // only frames of this page
      if (d.type === 'state') {
        const isNew = !videoFrames.has(e.source);
        videoFrames.set(e.source, {
          seen: Date.now(),
          state: { rate: Number(d.rate) || 1, paused: !!d.paused, rect: d.rect || null },
        });
        if (isNew) e.source.postMessage({ [MSG]: true, type: 'welcome' }, '*');
        scheduleEnsure();
      } else if (d.type === 'hotkey' && target && target.key === e.source) {
        runAction(d.action);
      } else if (d.type === 'shotResult') {
        const p = pendingShots.get(d.id);
        if (!p) return;
        pendingShots.delete(d.id);
        if (Object.prototype.toString.call(d.blob) === '[object Blob]') p.resolve({ blob: d.blob, time: Number(d.time) || 0 });
        else p.reject(new Error(d.error || 'failed'));
      }
    });

    // ---------- Panel ----------

    function highlight() {
      const panel = document.getElementById(PANEL_ID);
      if (!panel || !target) return;
      const rate = target.rate();
      const paused = target.paused();
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
      if (target) target.setRate(rate);
      highlight();
    }

    // Clicking the button of the current speed toggles play/pause
    function onSpeedClick(rate) {
      if (target && target.rate() === rate) {
        target.toggle();
        return;
      }
      setSpeed(rate);
    }

    function stepSpeed(dir) {
      const current = target ? target.rate() : settings.speed;
      let next;
      if (dir > 0) next = SPEEDS.find((s) => s > current + 1e-9) ?? SPEEDS[SPEEDS.length - 1];
      else next = [...SPEEDS].reverse().find((s) => s < current - 1e-9) ?? SPEEDS[0];
      setSpeed(next);
      showToast(next + '×');
    }

    // ---------- Screenshot ----------

    const CAMERA_SVG =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>';

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
      return (text || '')
        .replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ') // characters Windows does not allow
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/, '')
        .slice(0, maxLength)
        .trim();
    }

    // 12-34 - Video title (Channel).jpg; sites without channels end with the title
    function fileName(time) {
      const title = cleanForFileName(site.title(), 150) || 'video';
      const channel = cleanForFileName(site.channel(), 60);
      const ext = settings.shotFormat === 'png' ? 'png' : 'jpg';
      return `${timeLabel(time)} - ${title}${channel ? ` (${channel})` : ''}.${ext}`;
    }

    function download(blob, name) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function takeScreenshot() {
      if (!target) return;
      let shot;
      try {
        shot = target.shot();
      } catch (e) {
        shot = Promise.reject(e);
      }
      shot.then(({ blob, time }) => {
        download(blob, fileName(time));
        showToast('Screenshot saved');
      }).catch((e) => {
        // Protected (DRM) videos, e.g. some paid courses, do not allow reading their frames
        showToast(e && e.message === 'no-frame' ? 'No video frame' : 'This video does not allow screenshots');
      });
    }

    // ---------- Hotkeys ----------

    function runAction(action) {
      if (action === 'faster') stepSpeed(1);
      else if (action === 'slower') stepSpeed(-1);
      else if (action === 'screenshot') takeScreenshot();
    }

    function onKeyDown(e) {
      if (!target) return;
      const action = hotkeyAction(e);
      if (!action) return;
      // Take the key away from the site (YouTube uses +/- for caption size)
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat || action !== 'screenshot') runAction(action);
    }

    function showToast(text) {
      if (!target) return;
      let toast = document.getElementById(TOAST_ID);
      if (!toast) {
        toast = document.createElement('div');
        toast.id = TOAST_ID;
        document.body.appendChild(toast);
      }
      const rect = target.rect();
      toast.textContent = text;
      toast.style.left = rect.left + rect.width / 2 + 'px';
      toast.style.top = rect.top + Math.min(60, rect.height / 4) + 'px';
      toast.classList.add('ysp-show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toast.classList.remove('ysp-show'), 700);
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
      if (!panel || !target) return;
      const rect = target.rect();
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

    // ---------- Wiring ----------

    function ensurePanel() {
      target = pickTarget();
      if (!target) {
        document.getElementById(PANEL_ID)?.remove();
        return;
      }
      if (target.key instanceof HTMLVideoElement && target.key !== boundVideo) {
        boundVideo = target.key;
        bindVideo(boundVideo, { guardOwnRate: site.guardOwnRate, onChange: highlight });
      }
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
      if (target.el !== observedEl) {
        if (observedEl) resizeObserver.unobserve(observedEl);
        resizeObserver.observe(target.el);
        observedEl = target.el;
      }
      highlight();
      position();
    }

    let scheduled = false;
    function scheduleEnsure() {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => { scheduled = false; ensurePanel(); });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      onSettingsChanged(changes);
      if (changes.speed && target && target.rate() !== settings.speed) target.setRate(settings.speed);
      ensurePanel();
    });

    ensurePanel();
    document.addEventListener('yt-navigate-finish', ensurePanel);
    window.addEventListener('resize', position);
    window.addEventListener('keydown', onKeyDown, true);
    let posScheduled = false;
    document.addEventListener('scroll', () => {
      if (posScheduled) return;
      posScheduled = true;
      requestAnimationFrame(() => { posScheduled = false; position(); });
    }, { capture: true, passive: true });
    new MutationObserver(scheduleEnsure)
      .observe(document.documentElement, { childList: true, subtree: true });
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
    if (window === window.top) runOnPage();
    else runInFrame();
  });
})();
