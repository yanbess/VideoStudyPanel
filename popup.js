const DEFAULT_HOTKEYS = {
  faster: { key: '+', ctrl: false, alt: false, meta: false, shift: false },
  slower: { key: '-', ctrl: false, alt: false, meta: false, shift: false },
  screenshot: { key: 's', ctrl: false, alt: false, meta: false, shift: false },
};
const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta', 'AltGraph', 'CapsLock', 'OS'];
const KEY_NAMES = {
  ' ': 'Space', '-': '−', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

let hotkeys = structuredClone(DEFAULT_HOTKEYS);
let recording = null; // the hotkey button waiting for a key

const hiddenBox = document.getElementById('hidden');
const hotkeyButtons = document.querySelectorAll('.hotkey');
const positionStatus = document.getElementById('position-status');

// Same rules as in content.js: '=' is the '+' key without Shift, and Shift is
// only stored for keys whose character it does not change (letters, F-keys, arrows).
function normalizeKey(key) {
  if (key === '=') return '+';
  return key.length === 1 ? key.toLowerCase() : key;
}

function describe(hk) {
  if (!hk || !hk.key) return 'None';
  const parts = [];
  if (hk.ctrl) parts.push('Ctrl');
  if (hk.alt) parts.push('Alt');
  if (hk.meta) parts.push('Meta');
  if (hk.shift) parts.push('Shift');
  const key = KEY_NAMES[hk.key] || (hk.key.length === 1 ? hk.key.toUpperCase() : hk.key);
  parts.push(key);
  return parts.join(' + ');
}

function render() {
  hotkeyButtons.forEach((btn) => {
    const action = btn.dataset.action;
    btn.classList.toggle('recording', recording === btn);
    btn.textContent = recording === btn ? 'Press a key…' : describe(hotkeys[action]);
  });
}

function stopRecording() {
  recording = null;
  render();
}

hotkeyButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    recording = recording === btn ? null : btn;
    render();
  });
});

document.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  if (MODIFIERS.includes(e.key)) return; // wait for the actual key
  if (e.key === 'Escape') { stopRecording(); return; }
  const key = normalizeKey(e.key);
  const printable = key.length === 1 && key.toLowerCase() === key.toUpperCase();
  const hk = {
    key,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    meta: e.metaKey,
    shift: printable ? false : e.shiftKey,
  };
  const action = recording.dataset.action;
  // Taking another action's key swaps the two
  Object.keys(hotkeys).forEach((other) => {
    if (other !== action && describe(hotkeys[other]) === describe(hk)) hotkeys[other] = hotkeys[action];
  });
  hotkeys[action] = hk;
  chrome.storage.local.set({ hotkeys });
  stopRecording();
});

document.getElementById('reset-hotkeys').addEventListener('click', () => {
  hotkeys = structuredClone(DEFAULT_HOTKEYS);
  chrome.storage.local.set({ hotkeys });
  stopRecording();
});

hiddenBox.addEventListener('change', () => {
  chrome.storage.local.set({ hidden: hiddenBox.checked });
});

document.getElementById('reset-position').addEventListener('click', () => {
  chrome.storage.local.set({ offsets: {} });
  positionStatus.textContent = 'The panel is back under the video.';
});

const scaleSlider = document.getElementById('scale');
const scaleValue = document.getElementById('scale-value');

function showScale(percent) {
  scaleSlider.value = percent;
  scaleValue.textContent = percent + '%';
}

scaleSlider.addEventListener('input', () => {
  const percent = Number(scaleSlider.value);
  showScale(percent);
  chrome.storage.local.set({ scale: percent / 100 });
});

document.getElementById('reset-scale').addEventListener('click', () => {
  showScale(100);
  chrome.storage.local.set({ scale: 1 });
});

document.getElementById('version').textContent = 'Version ' + chrome.runtime.getManifest().version;

const formatInputs = document.querySelectorAll('input[name="shot-format"]');
formatInputs.forEach((input) => {
  input.addEventListener('change', () => {
    if (input.checked) chrome.storage.local.set({ shotFormat: input.value });
  });
});

chrome.storage.local.get({ hidden: false, scale: 1, shotFormat: 'jpg', hotkeys: DEFAULT_HOTKEYS }, (data) => {
  hiddenBox.checked = !!data.hidden;
  formatInputs.forEach((input) => { input.checked = input.value === data.shotFormat; });
  showScale(Math.round((Number(data.scale) || 1) * 100));
  hotkeys = { ...DEFAULT_HOTKEYS, ...data.hotkeys };
  render();
});
