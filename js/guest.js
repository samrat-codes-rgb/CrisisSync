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
let locationGranted = false;
let locationPushInterval = null;
let lastAlertKey = null; // track the last SOS for cancellation

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

  // --- Bind Cancel SOS Button ---
  const cancelBtn = document.getElementById('cancel-sos-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', function(e) {
      e.preventDefault();
      cancelSOS();
    });
  }

  // --- Bind Enable Location Button ---
  const locBtn = document.getElementById('enable-location-btn');
  if (locBtn) {
    locBtn.addEventListener('click', function(e) {
      e.preventDefault();
      requestLocation();
    });
  }

  // --- Bind Location Banner Button ---
  const bannerLocBtn = document.getElementById('banner-enable-location');
  if (bannerLocBtn) {
    bannerLocBtn.addEventListener('click', function(e) {
      e.preventDefault();
      requestLocation();
    });
  }

  const bannerDismiss = document.getElementById('banner-dismiss');
  if (bannerDismiss) {
    bannerDismiss.addEventListener('click', function(e) {
      e.preventDefault();
      const banner = document.getElementById('location-permission-banner');
      if (banner) banner.classList.remove('show');
    });
  }

  // Check location permission proactively
  checkLocationPermission();
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

// Proactively check if location permission is granted, denied, or needs prompting
async function checkLocationPermission() {
  if (!navigator.geolocation) {
    updateCoordsText('Geolocation not supported by your browser.');
    updateLocationStatus('unsupported');
    return;
  }

  // Use the Permissions API if available
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const result = await navigator.permissions.query({ name: 'geolocation' });

      if (result.state === 'granted') {
        // Already granted — start silently
        onLocationPermissionGranted();
      } else if (result.state === 'denied') {
        // Denied — show banner explaining how to re-enable
        showLocationBanner('denied');
        updateLocationStatus('denied');
      } else {
        // prompt — show banner asking them to enable
        showLocationBanner('prompt');
        updateLocationStatus('prompt');
      }

      // Listen for future changes (user toggles in browser settings)
      result.addEventListener('change', () => {
        if (result.state === 'granted') {
          onLocationPermissionGranted();
        } else if (result.state === 'denied') {
          showLocationBanner('denied');
          updateLocationStatus('denied');
        }
      });
    } catch (e) {
      // Permissions API not available — try requesting silently
      startWatchingLocation();
    }
  } else {
    // Fallback: just try to get location
    startWatchingLocation();
  }
}

function onLocationPermissionGranted() {
  locationGranted = true;
  hideLocationBanner();
  updateLocationStatus('enabled');
  startWatchingLocation();
}

function showLocationBanner(state) {
  const banner = document.getElementById('location-permission-banner');
  if (!banner) return;

  const title = banner.querySelector('.loc-banner-title');
  const desc = banner.querySelector('.loc-banner-desc');
  const actionBtn = document.getElementById('banner-enable-location');

  if (state === 'denied') {
    if (title) title.textContent = '📍 Location Access Blocked';
    if (desc) desc.textContent = 'Location permission was denied. Please enable it in your browser settings (click the lock/site info icon in the address bar) and reload the page.';
    if (actionBtn) {
      actionBtn.textContent = '🔄 Reload Page';
      actionBtn.onclick = () => window.location.reload();
    }
  } else {
    if (title) title.textContent = '📍 Enable Your Location';
    if (desc) desc.textContent = 'CrisisSync needs your location to send accurate emergency alerts and help responders find you quickly.';
    if (actionBtn) {
      actionBtn.textContent = '📍 Enable Location Now';
      actionBtn.onclick = (e) => { e.preventDefault(); requestLocation(); };
    }
  }

  banner.classList.add('show');
}

function hideLocationBanner() {
  const banner = document.getElementById('location-permission-banner');
  if (banner) banner.classList.remove('show');
}

function updateLocationStatus(state) {
  const indicator = document.getElementById('location-status-indicator');
  const statusText = document.getElementById('location-status-text');
  if (!indicator || !statusText) return;

  indicator.className = 'loc-status-dot'; // reset

  switch (state) {
    case 'enabled':
      indicator.classList.add('active');
      statusText.textContent = 'Location Active';
      statusText.style.color = 'var(--success)';
      break;
    case 'denied':
      indicator.classList.add('denied');
      statusText.textContent = 'Location Blocked';
      statusText.style.color = 'var(--danger)';
      break;
    case 'prompt':
      indicator.classList.add('pending');
      statusText.textContent = 'Location Pending';
      statusText.style.color = 'var(--warning)';
      break;
    case 'unsupported':
      indicator.classList.add('denied');
      statusText.textContent = 'Not Supported';
      statusText.style.color = 'var(--text-muted)';
      break;
  }
}

function requestLocation() {
  const btn = document.getElementById('enable-location-btn');
  const bannerBtn = document.getElementById('banner-enable-location');

  if (btn) {
    btn.textContent = 'Requesting...';
    btn.disabled = true;
  }
  if (bannerBtn) {
    bannerBtn.textContent = '⏳ Requesting...';
    bannerBtn.disabled = true;
  }
  updateCoordsText('Requesting location permissions...');
  updateLocationStatus('prompt');

  if (!navigator.geolocation) {
    updateCoordsText('Geolocation not supported.');
    if (btn) btn.textContent = 'Unsupported';
    updateLocationStatus('unsupported');
    return;
  }

  // Force a single request to trigger the browser prompt
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      onLocationPermissionGranted();
      handleLocationUpdate(pos);

      if (btn) {
        btn.textContent = 'Enabled ✅';
        btn.classList.add('btn-success');
        btn.classList.remove('btn-outline');
        btn.disabled = true;
      }
      showToast('✅ Location enabled! Responders can now locate you.', 'success');
    },
    (err) => {
      updateCoordsText('Location access denied or failed: ' + err.message);
      updateLocationStatus('denied');

      if (err.code === 1) {
        // PERMISSION_DENIED
        showLocationBanner('denied');
      }

      if (btn) {
        btn.textContent = 'Retry Location';
        btn.disabled = false;
      }
      if (bannerBtn) {
        bannerBtn.textContent = '📍 Enable Location Now';
        bannerBtn.disabled = false;
      }

      showToast('⚠️ Location access was denied. Your SOS alerts won\'t include precise coordinates.', 'warning', 6000);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

let watchId = null;
function startWatchingLocation() {
  if (!navigator.geolocation || watchId) return;

  watchId = navigator.geolocation.watchPosition(
    handleLocationUpdate,
    (err) => {
      console.log('Geolocation watch error:', err.message);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function handleLocationUpdate(pos) {
  guestLat = pos.coords.latitude;
  guestLng = pos.coords.longitude;
  const acc = Math.round(pos.coords.accuracy || 0);

  locationGranted = true;
  updateCoordsText(`Lat: ${guestLat.toFixed(5)}, Lng: ${guestLng.toFixed(5)} · Accuracy: ~${acc}m`);
  updateLocationStatus('enabled');
  updateGuestMapPosition();
  hideLocationBanner();

  // Visually activate the location card
  const locCard = document.querySelector('.location-card');
  if (locCard) locCard.classList.add('loc-active');

  const btn = document.getElementById('enable-location-btn');
  if (btn && btn.textContent !== 'Enabled ✅') {
    btn.textContent = 'Enabled ✅';
    btn.disabled = true;
    btn.classList.add('btn-success');
    btn.classList.remove('btn-outline');
  }

  // Push location to Firebase so admin can track
  pushLocationToFirebase(guestLat, guestLng, acc);
}

function pushLocationToFirebase(lat, lng, accuracy) {
  try {
    db.ref(`locations/${room}`).update({
      lat: lat,
      lng: lng,
      accuracy: accuracy,
      guestName: guestName,
      room: room,
      lastUpdated: Date.now()
    });
  } catch (e) {
    console.log('Location push error:', e);
  }
}

function updateCoordsText(text) {
  const el = document.getElementById('location-coords');
  if (el) el.textContent = text;
}

function updateGuestMapPosition() {
  if (!guestMap || !guestMarker) return;
  guestMarker.setLatLng([guestLat, guestLng]);
  guestMarker.setPopupContent(`<b>🏨 Your Live Location</b><br>Room ${room}<br>Lat: ${guestLat.toFixed(4)}, Lng: ${guestLng.toFixed(4)}`);
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
    .then((ref) => {
      // Store the key so we can cancel it
      lastAlertKey = ref.key;

      btn.classList.remove('sending');
      btn.classList.add('sent');
      btn.innerHTML = '✓<span class="sos-sub">ALERT SENT</span>';
      showToast(`🚨 ${selectedType.toUpperCase()} alert sent from Room ${room}!`, 'success');

      // Show cancel button
      showCancelButton();

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

// --- Cancel SOS ---
function cancelSOS() {
  if (!lastAlertKey) {
    showToast('⚠️ No active alert to cancel.', 'warning', 3000);
    return;
  }

  const cancelBtn = document.getElementById('cancel-sos-btn');
  if (cancelBtn) {
    cancelBtn.textContent = '⏳ Cancelling...';
    cancelBtn.disabled = true;
  }

  db.ref('alerts/' + lastAlertKey).update({
    status: 'cancelled',
    cancelledAt: Date.now()
  })
    .then(() => {
      showToast('✅ SOS alert cancelled successfully.', 'success', 4000);
      lastAlertKey = null;
      hideCancelButton();
    })
    .catch((err) => {
      console.error('Failed to cancel alert:', err);
      showToast('❌ Failed to cancel alert: ' + err.message, 'danger');
      if (cancelBtn) {
        cancelBtn.textContent = '✕ Cancel SOS Alert';
        cancelBtn.disabled = false;
      }
    });
}

function showCancelButton() {
  const wrapper = document.getElementById('cancel-sos-wrapper');
  if (wrapper) {
    wrapper.style.display = 'flex';
    wrapper.style.animation = 'fadeSlideUp 0.4s ease';
  }
}

function hideCancelButton() {
  const wrapper = document.getElementById('cancel-sos-wrapper');
  if (wrapper) {
    wrapper.style.display = 'none';
  }
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
    const msgsCard = document.getElementById('admin-msgs-card');
    const msgsList = document.getElementById('admin-msgs-list');
    if (!list) return;
    const data = snapshot.val();

    if (!data) {
      list.innerHTML = '<li style="color: var(--text-muted); justify-content: center;">No alerts sent yet</li>';
      if (msgsCard) msgsCard.style.display = 'none';
      hideCancelButton();
      return;
    }

    const entries = Object.entries(data);
    const alerts = entries
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.timestamp - a.timestamp);

    // Check if there are any active alerts — show/hide cancel button
    const hasActiveAlert = alerts.some(a => a.status === 'active');
    if (hasActiveAlert) {
      // Find the most recent active alert key
      const activeAlert = alerts.find(a => a.status === 'active');
      if (activeAlert) lastAlertKey = activeAlert.key;
      showCancelButton();
    } else {
      hideCancelButton();
    }

    // Render alert history (top 5)
    const recentAlerts = alerts.slice(0, 5);
    list.innerHTML = recentAlerts.map(a => {
      const statusColor = a.status === 'active' ? 'var(--danger)' : a.status === 'cancelled' ? 'var(--warning)' : 'var(--success)';
      const statusBg = a.status === 'active' ? 'var(--danger-bg)' : a.status === 'cancelled' ? 'var(--warning-bg)' : 'var(--success-bg)';
      return `
        <li>
          <span>
            <span class="alert-type-tag tag-${a.type}">${getTypeIcon(a.type)} ${a.type}</span>
          </span>
          <span style="color: var(--text-muted); font-size: 0.8rem;">${formatTime(a.timestamp)}</span>
          <span class="alert-type-tag" style="background: ${statusBg}; color: ${statusColor};">
            ${a.status}
          </span>
        </li>
      `;
    }).join('');

    // Collect all admin messages from all alerts
    const allMessages = [];
    alerts.forEach(a => {
      if (a.adminMessage) {
        allMessages.push({
          message: a.adminMessage,
          timestamp: a.resolvedAt || a.timestamp,
          alertType: a.type,
          room: a.room
        });
      }
      if (a.adminMessages) {
        Object.values(a.adminMessages).forEach(m => {
          if (m.message) {
            allMessages.push({
              message: m.message,
              timestamp: m.timestamp,
              alertType: a.type,
              room: a.room
            });
          }
        });
      }
    });

    // Deduplicate by message+timestamp and sort
    const uniqueMsgs = [];
    const seen = new Set();
    allMessages.forEach(m => {
      const key = m.message + m.timestamp;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueMsgs.push(m);
      }
    });
    uniqueMsgs.sort((a, b) => b.timestamp - a.timestamp);

    // Render admin messages
    if (uniqueMsgs.length > 0 && msgsCard && msgsList) {
      msgsCard.style.display = 'block';
      msgsCard.style.animation = 'fadeSlideUp 0.4s ease';
      msgsList.innerHTML = uniqueMsgs.slice(0, 8).map(m => `
        <div class="guest-admin-msg">
          <div class="guest-admin-msg-icon">👨‍✈️</div>
          <div class="guest-admin-msg-body">
            <p class="guest-admin-msg-text">${m.message}</p>
            <span class="guest-admin-msg-time">${formatTime(m.timestamp)}</span>
          </div>
        </div>
      `).join('');

      // Show a toast for the latest message if it's new
      const latestMsg = uniqueMsgs[0];
      const lastSeenMsgTime = parseInt(localStorage.getItem('crisisync_last_msg_time') || '0');
      if (latestMsg.timestamp > lastSeenMsgTime) {
        localStorage.setItem('crisisync_last_msg_time', latestMsg.timestamp.toString());
        showToast(`💬 Staff: "${latestMsg.message}"`, 'success', 6000);
        try { AudioAlert.play(); } catch(e) { /* ignore */ }
      }
    } else if (msgsCard) {
      msgsCard.style.display = 'none';
    }
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
