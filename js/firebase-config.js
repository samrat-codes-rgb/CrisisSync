// ===== CrisisSync Firebase Configuration =====
// Replace the config below with your own Firebase project credentials.
// Until then, the app uses a local in-memory database that works instantly!

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "YOUR_APP_ID"
};

// ===== Smart Database Layer =====
// Detects if Firebase is configured. If not, uses localStorage-based fallback
// so the app works immediately without any setup.

const USE_FIREBASE = firebaseConfig.apiKey !== "YOUR_API_KEY";
let db;

if (USE_FIREBASE) {
  // Real Firebase mode
  firebase.initializeApp(firebaseConfig);
  db = firebase.database();
  console.log('🔥 CrisisSync: Connected to Firebase');
} else {
  // Local fallback mode — fully functional without Firebase
  console.log('💾 CrisisSync: Running in local demo mode (no Firebase configured)');
  db = createLocalDB();
}

// ===== Local Database (BroadcastChannel + localStorage) =====
// Syncs across multiple tabs in real-time using BroadcastChannel API
function createLocalDB() {
  const STORAGE_KEY = 'crisisync_alerts';
  const channel = new BroadcastChannel('crisisync_sync');
  const listeners = {};

  function getData() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch { return {}; }
  }

  function setData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    channel.postMessage({ type: 'update' });
  }

  function generateId() {
    return '-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  // Notify all listeners for a given path
  function notifyListeners(path) {
    const data = getData();
    Object.keys(listeners).forEach(listenPath => {
      // Match exact or parent path
      if (path.startsWith(listenPath) || listenPath.startsWith(path) || listenPath === 'alerts') {
        listeners[listenPath].forEach(cb => {
          const snap = createSnapshot(listenPath, data);
          cb(snap);
        });
      }
    });
  }

  function createSnapshot(path, data) {
    let val = data;
    if (path === 'alerts') {
      val = data;
    } else if (path === '.info/connected') {
      val = true;
    }
    return {
      val() { return val && Object.keys(val).length > 0 ? val : null; },
      exists() { return val !== null && val !== undefined; }
    };
  }

  // Cross-tab sync
  channel.onmessage = () => {
    notifyListeners('alerts');
  };

  // Also poll for changes from same tab
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      notifyListeners('alerts');
    }
  });

  // Build the db interface matching Firebase's API
  return {
    ref(path) {
      return {
        push(value) {
          const data = getData();
          const id = generateId();
          data[id] = value;
          setData(data);
          notifyListeners(path);
          return Promise.resolve({ key: id });
        },
        update(value) {
          // path is like 'alerts/-abc123'
          const parts = path.split('/');
          if (parts.length >= 2) {
            const data = getData();
            const key = parts[1];
            if (data[key]) {
              Object.assign(data[key], value);
              setData(data);
              notifyListeners('alerts');
            }
          }
          return Promise.resolve();
        },
        remove() {
          const parts = path.split('/');
          if (parts.length >= 2) {
            const data = getData();
            delete data[parts[1]];
            setData(data);
          } else if (path === 'alerts') {
            setData({});
          }
          notifyListeners('alerts');
          return Promise.resolve();
        },
        on(event, callback) {
          const listenPath = path;
          if (!listeners[listenPath]) listeners[listenPath] = [];
          listeners[listenPath].push(callback);
          // Fire immediately with current data
          const data = path === '.info/connected' ? null : getData();
          const snap = createSnapshot(path, data);
          callback(snap);
        },
        off() {
          delete listeners[path];
        },
        orderByChild(child) {
          // Return a query-like object that filters on 'on'
          return {
            equalTo(value) {
              return {
                on(event, callback) {
                  const listenPath = 'alerts';
                  const wrappedCb = () => {
                    const allData = getData();
                    const filtered = {};
                    Object.entries(allData).forEach(([k, v]) => {
                      if (v[child] === value) filtered[k] = v;
                    });
                    callback(createSnapshot(listenPath, filtered));
                  };
                  if (!listeners[listenPath]) listeners[listenPath] = [];
                  listeners[listenPath].push(wrappedCb);
                  wrappedCb(); // fire immediately
                }
              };
            }
          };
        }
      };
    }
  };
}

// ===== Audio Alert System =====
const AudioAlert = {
  ctx: null,
  muted: false,

  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  },

  play() {
    if (this.muted) return;
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const now = this.ctx.currentTime;
    // Three-tone urgent alarm
    [880, 1100, 880].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.14);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.15);
    });
  },

  toggle() {
    this.muted = !this.muted;
    return this.muted;
  }
};

// ===== Toast Notifications =====
function showToast(message, type = 'danger', duration = 5000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ===== Offline Detection =====
function initOfflineDetection() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  if (USE_FIREBASE) {
    const connRef = db.ref('.info/connected');
    connRef.on('value', (snap) => {
      const dot = document.querySelector('.status-dot');
      if (snap.val() === true) {
        banner.classList.remove('show');
        if (dot) { dot.classList.remove('offline'); dot.title = 'Connected'; }
      } else {
        banner.classList.add('show');
        if (dot) { dot.classList.add('offline'); dot.title = 'Offline'; }
      }
    });
  } else {
    // In local mode, always show as connected
    const dot = document.querySelector('.status-dot');
    if (dot) { dot.classList.remove('offline'); dot.title = 'Connected (Local)'; }
  }

  window.addEventListener('online', () => banner.classList.remove('show'));
  window.addEventListener('offline', () => banner.classList.add('show'));
}

// ===== Utility Functions =====
function formatTime(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDate(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + formatTime(timestamp);
}

function getTypeIcon(type) {
  const icons = { fire: '🔥', medical: '🏥', security: '🔒' };
  return icons[type] || '⚠️';
}

function getTypeColor(type) {
  const colors = { fire: 'fire', medical: 'medical', security: 'security' };
  return colors[type] || 'fire';
}
