(() => {
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];
  const PANEL_ID = 'yt-speed-panel';
  const GAP = 8; // px between the player and the panel
  let savedSpeed = 1;
  let boundVideo = null;
  let observedPlayer = null;
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
    },
  };
  const site = /(^|\.)udemy\.com$/.test(location.hostname) ? SITES.udemy : SITES.youtube;
  const getPlayer = site.getPlayer;
  const getVideo = site.getVideo;

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
    savedSpeed = rate;
    try { chrome.storage.local.set({ speed: rate }); } catch (e) { /* extension context invalidated */ }
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

  function buildPanel() {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;

    const label = document.createElement('span');
    label.className = 'ysp-label';
    label.textContent = 'Speed:';
    panel.appendChild(label);

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
    return panel;
  }

  // Place the panel centered right below the player, in viewport coordinates
  // (position: fixed, so it also follows players inside inner scroll containers)
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
    panel.style.top = rect.bottom + GAP + 'px';
    panel.style.left = rect.left + rect.width / 2 + 'px';
  }

  function bindVideo() {
    const video = getVideo();
    if (!video || video === boundVideo) return;
    boundVideo = video;
    video.addEventListener('ratechange', () => highlight(video.playbackRate));
    video.addEventListener('play', () => highlight(video.playbackRate));
    video.addEventListener('pause', () => highlight(video.playbackRate));
    // The site resets the speed when a new video loads, so re-apply the saved one
    video.addEventListener('loadedmetadata', () => {
      if (video.playbackRate !== savedSpeed) video.playbackRate = savedSpeed;
    });
    if (video.playbackRate !== savedSpeed) video.playbackRate = savedSpeed;
  }

  function ensurePanel() {
    const player = getPlayer();
    if (!site.isActive() || !player) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }
    if (!document.getElementById(PANEL_ID)) {
      document.body.appendChild(buildPanel());
    }
    if (player !== observedPlayer) {
      if (observedPlayer) resizeObserver.unobserve(observedPlayer);
      resizeObserver.observe(player);
      observedPlayer = player;
    }
    bindVideo();
    const video = getVideo();
    highlight(video ? video.playbackRate : savedSpeed);
    position();
  }

  function init() {
    ensurePanel();
    document.addEventListener('yt-navigate-finish', ensurePanel);
    window.addEventListener('resize', position);
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

  chrome.storage.local.get({ speed: 1 }, (data) => {
    savedSpeed = Number(data.speed) || 1;
    init();
  });
})();
