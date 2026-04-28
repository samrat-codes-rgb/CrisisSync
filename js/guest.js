// ===== CrisisSync Guest Logic =====

// --- Session Data ---
const room = localStorage.getItem('crisisync_room') || '302';
const guestName = localStorage.getItem('crisisync_name') || 'Guest';
let selectedType = 'fire';
let isSending = false;
let guestLat = 18.9220;
let guestLng = 72.8347;
let guestMap = null;
let guestMarker = null;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  // Auto-set role if missing (allows direct navigation for demo)
  if (!localStorage.getItem('crisisync_role')) {
    localStorage.setItem('crisisync_role', 'guest');
    localStorage.setItem('crisisync_room', '302');
    localStorage.setItem('crisisync_name', 'Guest');
  }

  document.getElementById('room-display').textContent = `Room ${room}`;
  document.getElementById('guest-name-display').textContent = guestName;

  // --- Bind type buttons (delegate to parent grid for reliability) ---
  const typeGrid = document.getElementById('type-grid');
  if (typeGrid) {
    typeGrid.addEventListener('click', function(e) {
      // Walk up from the click target to find the .type-btn
      const btn = e.target.closest('.type-btn');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const type = btn.getAttribute('data-type');
      if (type) selectType(type);
    });
  }

  // --- Bind SOS button ---
  const sosBtn = document.getElementById('sos-btn');
  if (sosBtn) {
    sosBtn.addEventListener('click', function(e) {
      e.preventDefault();
      triggerSOS();
    });
  }

  // --- Bind AI trigger button ---
  const aiBtn = document.getElementById('ai-trigger-btn');
  if (aiBtn) {
    aiBtn.addEventListener('click', function(e) {
      e.preventDefault();
      simulateAIDetection();
    });
  }

  // --- Bind Logout button ---
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.clear();
      window.location.href = 'index.html';
    });
  }

  initGeolocation();
  initGuestMap();
  listenForMyAlerts();
  initOfflineDetection();
});

// --- Emergency Type Selection ---
function selectType(type) {
  selectedType = type;
  // Remove active + all type classes from every button
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.classList.remove('active', 'fire', 'medical', 'security');
  });
  // Add active + the selected type class to the matching button
  const active = document.querySelector(`.type-btn[data-type="${type}"]`);
  if (active) {
    active.classList.add('active', type);
  }
}

// --- Geolocation ---
function initGeolocation() {
  if (!navigator.geolocation) return;

  // Watch position for real-time updates
  navigator.geolocation.watchPosition(
    (pos) => {
      guestLat = pos.coords.latitude;
      guestLng = pos.coords.longitude;
      updateGuestMapPosition();
    },
    (err) => {
      console.log('Geolocation error (using default hotel location):', err.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function updateGuestMapPosition() {
  if (!guestMap || !guestMarker) return;
  guestMarker.setLatLng([guestLat, guestLng]);
  guestMap.setView([guestLat, guestLng], guestMap.getZoom());
}

// --- SOS Trigger ---
function triggerSOS() {
  if (isSending) return;
  isSending = true;

  const btn = document.getElementById('sos-btn');
  if (!btn) { isSending = false; return; }
  btn.classList.add('sending');

  // Play audio
  try { AudioAlert.play(); } catch(e) { console.log('Audio not available:', e); }

  const alertData = {
    type: selectedType,
    room: room,
    guestName: guestName,
    timestamp: Date.now(),
    status: 'active',
    source: 'manual',
    lat: guestLat,
    lng: guestLng
  };

  // Check online status
  if (!navigator.onLine) {
    showToast('⚠️ You are offline. Alert queued — SMS fallback simulated.', 'warning', 6000);
    saveOfflineAlert(alertData);
    resetSOSButton(btn);
    return;
  }

  db.ref('alerts').push(alertData)
    .then(() => {
      btn.classList.remove('sending');
      btn.classList.add('sent');
      btn.innerHTML = '✓<span class="sos-sub">ALERT SENT</span>';
      showToast(`🚨 ${selectedType.toUpperCase()} alert sent from Room ${room}!`, 'success');

      setTimeout(() => {
        btn.classList.remove('sent');
        btn.innerHTML = 'SOS<span class="sos-sub">PRESS FOR HELP</span>';
        isSending = false;
      }, 3000);
    })
    .catch((err) => {
      console.error('Failed to send alert:', err);
      showToast('❌ Failed to send alert. Please try again.', 'danger');
      resetSOSButton(btn);
    });
}

function resetSOSButton(btn) {
  btn.classList.remove('sending', 'sent');
  btn.innerHTML = 'SOS<span class="sos-sub">PRESS FOR HELP</span>';
  isSending = false;
}

// --- Offline Queue ---
function saveOfflineAlert(data) {
  const queue = JSON.parse(localStorage.getItem('crisisync_queue') || '[]');
  queue.push(data);
  localStorage.setItem('crisisync_queue', JSON.stringify(queue));
}

window.addEventListener('online', () => {
  const queue = JSON.parse(localStorage.getItem('crisisync_queue') || '[]');
  if (queue.length === 0) return;
  queue.forEach(alert => {
    db.ref('alerts').push(alert);
  });
  localStorage.removeItem('crisisync_queue');
  showToast(`✅ ${queue.length} queued alert(s) synced!`, 'success');
});

// --- Listen for My Alerts ---
function listenForMyAlerts() {
  db.ref('alerts').orderByChild('room').equalTo(room).on('value', (snapshot) => {
    const list = document.getElementById('alert-history');
    if (!list) return;
    const data = snapshot.val();

    if (!data) {
      list.innerHTML = '<li style="color: var(--text-muted); justify-content: center;">No alerts sent yet</li>';
      return;
    }

    const alerts = Object.values(data).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5);
    list.innerHTML = alerts.map(a => `
      <li>
        <span>
          <span class="alert-type-tag tag-${a.type}">${getTypeIcon(a.type)} ${a.type}</span>
        </span>
        <span style="color: var(--text-muted); font-size: 0.8rem;">${formatTime(a.timestamp)}</span>
        <span class="alert-type-tag" style="background: ${a.status === 'active' ? 'var(--danger-bg)' : 'var(--success-bg)'}; color: ${a.status === 'active' ? 'var(--danger)' : 'var(--success)'};">
          ${a.status}
        </span>
      </li>
    `).join('');
  });
}

// --- AI Detection Simulation ---
function simulateAIDetection() {
  const indicator = document.getElementById('ai-indicator');
  const triggerBtn = document.getElementById('ai-trigger-btn');
  if (!indicator || !triggerBtn) return;

  // Phase 1: Detecting
  indicator.className = 'ai-indicator detecting';
  indicator.innerHTML = '<span class="status-dot" style="background: var(--warning)"></span> 🔍 Analyzing sensor data...';
  triggerBtn.disabled = true;
  triggerBtn.textContent = '⏳ Processing...';

  setTimeout(() => {
    // Phase 2: Threat detected
    indicator.innerHTML = '<span class="status-dot" style="background: var(--danger)"></span> 🔥 SMOKE DETECTED — Triggering alert!';
    showToast('🤖 AI System: Smoke detected in Room ' + room + '!', 'warning');

    setTimeout(() => {
      // Phase 3: Auto-send alert
      const aiAlert = {
        type: 'fire',
        room: room,
        guestName: 'AI Sensor',
        timestamp: Date.now(),
        status: 'active',
        source: 'ai_detection',
        lat: guestLat,
        lng: guestLng
      };

      db.ref('alerts').push(aiAlert).then(() => {
        showToast('🚨 AI auto-generated FIRE alert sent!', 'danger');
        try { AudioAlert.play(); } catch(e) { /* ignore */ }
      });

      // Reset after a bit
      setTimeout(() => {
        indicator.className = 'ai-indicator';
        indicator.innerHTML = '<span class="status-dot"></span> Sensors Normal';
        triggerBtn.disabled = false;
        triggerBtn.textContent = '🔬 Simulate Fire Detection';
      }, 4000);
    }, 1500);
  }, 2000);
}

// --- Map ---
function initGuestMap() {
  try {
    if (typeof L === 'undefined') {
      console.log('Leaflet not loaded, skipping map init');
      return;
    }

    guestMap = L.map('guest-map', {
      center: [guestLat, guestLng],
      zoom: 17,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(guestMap);

    guestMarker = L.marker([guestLat, guestLng]).addTo(guestMap)
      .bindPopup(`<b>🏨 Grand Hotel</b><br>Your Location: Room ${room}`);

    // Fix map rendering
    setTimeout(() => guestMap.invalidateSize(), 300);
  } catch (e) {
    console.log('Map init error:', e);
    const mapContainer = document.getElementById('guest-map-container');
    if (mapContainer) {
      mapContainer.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);">📍 Map unavailable offline</div>';
    }
  }
}
