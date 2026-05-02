// ===== CrisisSync Admin Dashboard Logic =====

let alertCount = 0;
let mapMarkers = {};
let adminMap = null;

// Hotel room coordinates (simulated floor positions around hotel)
const roomPositions = {
  '101': [18.9218, 72.8343], '102': [18.9219, 72.8345], '103': [18.9220, 72.8343],
  '201': [18.9221, 72.8344], '202': [18.9222, 72.8346], '203': [18.9221, 72.8348],
  '301': [18.9223, 72.8345], '302': [18.9224, 72.8347], '303': [18.9223, 72.8349],
  '401': [18.9225, 72.8346], '402': [18.9226, 72.8348], '403': [18.9225, 72.8350],
};

const typeColors = {
  fire: '#f97316',
  medical: '#3b82f6',
  security: '#a855f7'
};

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  // Auto-set role if missing (allows direct navigation for demo)
  if (!localStorage.getItem('crisisync_role')) {
    localStorage.setItem('crisisync_role', 'admin');
  }

  startClock();
  initAdminMap();
  listenForAlerts();
  initOfflineDetection();

  // --- Bind Mute Button ---
  const muteBtn = document.getElementById('mute-btn');
  if (muteBtn) {
    muteBtn.addEventListener('click', function(e) {
      e.preventDefault();
      toggleMute();
    });
  }

  // --- Bind Logout Button ---
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();
      localStorage.clear();
      window.location.href = 'index.html';
    });
  }

  // --- Bind AI Trigger Buttons (header + panel) ---
  document.querySelectorAll('.ai-trigger-action').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      simulateAIDetection();
    });
  });

  // --- Bind Clear All Button ---
  const clearBtn = document.getElementById('clear-all-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function(e) {
      e.preventDefault();
      clearAllAlerts();
    });
  }

  // --- Delegate Resolve / Delete / Message buttons inside alert cards ---
  document.addEventListener('click', function(e) {
    const resolveBtn = e.target.closest('.resolve-alert-btn');
    if (resolveBtn) {
      e.preventDefault();
      const key = resolveBtn.getAttribute('data-key');
      if (key) resolveAlert(key);
      return;
    }

    const deleteBtn = e.target.closest('.delete-alert-btn');
    if (deleteBtn) {
      e.preventDefault();
      const key = deleteBtn.getAttribute('data-key');
      if (key) deleteAlert(key);
      return;
    }

    // Quick-reply buttons
    const quickBtn = e.target.closest('.quick-reply-btn');
    if (quickBtn) {
      e.preventDefault();
      const key = quickBtn.getAttribute('data-key');
      const msg = quickBtn.getAttribute('data-msg');
      if (key && msg) sendQuickReply(key, msg, quickBtn);
      return;
    }

    // Send custom message button
    const sendBtn = e.target.closest('.send-msg-btn');
    if (sendBtn) {
      e.preventDefault();
      const key = sendBtn.getAttribute('data-key');
      if (key) sendCustomMessage(key);
      return;
    }
  });

  // Allow Enter key to send custom messages
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.classList.contains('custom-msg-input')) {
      e.preventDefault();
      const key = e.target.getAttribute('data-key');
      if (key) sendCustomMessage(key);
    }
  });
});

// --- Live Clock ---
function startClock() {
  const el = document.getElementById('live-clock');
  if (!el) return;
  function tick() {
    el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  tick();
  setInterval(tick, 1000);
}

// --- Toggle Mute ---
function toggleMute() {
  const muted = AudioAlert.toggle();
  const btn = document.getElementById('mute-btn');
  if (btn) {
    btn.textContent = muted ? '🔕' : '🔔';
    btn.classList.toggle('muted', muted);
  }
  showToast(muted ? '🔕 Audio alerts muted' : '🔔 Audio alerts enabled', 'warning', 2000);
}

// --- Firebase Listener ---
function listenForAlerts() {
  const alertsRef = db.ref('alerts');

  alertsRef.on('value', (snapshot) => {
    const data = snapshot.val();
    const activeContainer = document.getElementById('active-alerts');
    const resolvedContainer = document.getElementById('resolved-alerts');
    if (!activeContainer || !resolvedContainer) return;

    if (!data) {
      activeContainer.innerHTML = '<div class="empty-state" id="empty-active"><div class="empty-icon">✅</div><p>No active emergencies — all clear!</p></div>';
      resolvedContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No resolved alerts yet</p></div>';
      updateStats(0, 0, 0);
      clearMapMarkers();
      return;
    }

    const entries = Object.entries(data);
    const actives = entries.filter(([, a]) => a.status === 'active').sort((a, b) => b[1].timestamp - a[1].timestamp);
    const resolved = entries.filter(([, a]) => a.status === 'resolved').sort((a, b) => b[1].timestamp - a[1].timestamp);

    // Check for new alerts (play sound)
    if (entries.length > alertCount && alertCount > 0) {
      try { AudioAlert.play(); } catch(e) { /* ignore */ }
      const newest = entries.sort((a, b) => b[1].timestamp - a[1].timestamp)[0][1];
      showToast(
        `🚨 NEW: ${newest.type.toUpperCase()} emergency in Room ${newest.room}!${newest.source === 'ai_detection' ? ' (AI Detected)' : ''}`,
        'danger'
      );
    }
    alertCount = entries.length;

    // Render active alerts
    if (actives.length === 0) {
      activeContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">✅</div><p>No active emergencies — all clear!</p></div>';
    } else {
      activeContainer.innerHTML = actives.map(([key, a]) => renderAlertCard(key, a)).join('');
    }

    // Render resolved alerts
    if (resolved.length === 0) {
      resolvedContainer.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>No resolved alerts yet</p></div>';
    } else {
      resolvedContainer.innerHTML = resolved.map(([key, a]) => renderAlertCard(key, a)).join('');
    }

    updateStats(entries.length, actives.length, resolved.length);
    updateMapMarkers(actives);
  });
}

// --- Render Alert Card ---
function renderAlertCard(key, alert) {
  const isActive = alert.status === 'active';
  const sourceTag = alert.source === 'ai_detection'
    ? '<span style="font-size:0.75rem; color:var(--warning); margin-left:8px;">🤖 AI</span>'
    : '';

  // Show admin message history if present
  const msgHistory = alert.adminMessages
    ? Object.values(alert.adminMessages)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(m => `<div class="admin-msg-item">
          <span class="admin-msg-text">${m.message}</span>
          <span class="admin-msg-time">${formatTime(m.timestamp)}</span>
        </div>`).join('')
    : '';

  const lastMsg = alert.adminMessage
    ? `<div class="admin-last-msg">💬 <em>${alert.adminMessage}</em></div>`
    : '';

  // Response panel for active alerts
  const responsePanel = isActive ? `
    <div class="admin-response-panel">
      <div class="response-label">📨 Respond to Guest</div>
      <div class="quick-replies">
        <button class="quick-reply-btn" data-key="${key}" data-msg="🚐 Team dispatched to your location">
          🚐 Dispatched Team
        </button>
        <button class="quick-reply-btn" data-key="${key}" data-msg="🏃 Help is on the way! Stay calm.">
          🏃 On the Way
        </button>
        <button class="quick-reply-btn resolve-quick" data-key="${key}" data-msg="✅ Situation resolved. You are safe.">
          ✅ Resolved
        </button>
      </div>
      <div class="custom-msg-row">
        <input type="text" class="custom-msg-input" data-key="${key}" placeholder="Type a custom message..." maxlength="200" />
        <button class="btn btn-primary btn-sm send-msg-btn" data-key="${key}">Send</button>
      </div>
      ${msgHistory ? `<div class="admin-msg-history">${msgHistory}</div>` : ''}
    </div>
  ` : '';

  return `
    <div class="glass-card alert-card ${alert.status}">
      <div class="alert-card-header">
        <span class="alert-type ${getTypeColor(alert.type)}">
          ${getTypeIcon(alert.type)} ${alert.type}
        </span>
        <span class="alert-status ${alert.status}">${alert.status.toUpperCase()}</span>
      </div>
      <div class="alert-card-body">
        <div class="alert-detail">🚪 Room: <strong>${alert.room}</strong>${sourceTag}</div>
        <div class="alert-detail">👤 Reported by: <strong>${alert.guestName || 'Unknown'}</strong></div>
        <div class="alert-detail">🕐 Time: <strong>${formatDate(alert.timestamp)}</strong></div>
        ${lastMsg}
      </div>
      ${responsePanel}
      <div class="alert-card-actions">
        ${isActive
          ? `<button class="btn btn-success btn-sm resolve-alert-btn" data-key="${key}">✓ Resolve</button>
             <button class="btn btn-outline btn-sm delete-alert-btn" data-key="${key}">🗑️</button>`
          : `<button class="btn btn-outline btn-sm delete-alert-btn" data-key="${key}">🗑️ Remove</button>`
        }
      </div>
    </div>
  `;
}

// --- Update Stats ---
function updateStats(total, active, resolved) {
  animateCounter('stat-total', total);
  animateCounter('stat-active', active);
  animateCounter('stat-resolved', resolved);
}

function animateCounter(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;
  el.textContent = target;
  el.style.animation = 'none';
  el.offsetHeight; // trigger reflow
  el.style.animation = 'countUp 0.3s ease';
}

// --- Resolve Alert ---
function resolveAlert(key) {
  db.ref('alerts/' + key).update({
    status: 'resolved',
    adminMessage: '✅ Situation resolved. You are safe.',
    resolvedAt: Date.now()
  })
    .then(() => showToast('✅ Alert resolved successfully', 'success', 3000))
    .catch(err => showToast('❌ Failed to resolve: ' + err.message, 'danger'));
}

// --- Send Quick Reply ---
function sendQuickReply(key, message, btnEl) {
  // Visual feedback
  const originalText = btnEl.textContent;
  btnEl.textContent = '⏳ Sending...';
  btnEl.disabled = true;

  const msgData = {
    message: message,
    timestamp: Date.now(),
    sender: 'admin'
  };

  // Update the alert's adminMessage (latest) and push to message history
  const updates = {
    adminMessage: message
  };

  db.ref('alerts/' + key).update(updates)
    .then(() => {
      // Also push to adminMessages sub-collection
      db.ref('alerts/' + key + '/adminMessages').push(msgData);
      showToast(`💬 Message sent: "${message}"`, 'success', 3000);
      btnEl.textContent = '✓ Sent';
      btnEl.classList.add('sent');

      // If it's a "Resolved" quick reply, also resolve the alert
      if (btnEl.classList.contains('resolve-quick')) {
        setTimeout(() => {
          resolveAlert(key);
        }, 500);
      }

      setTimeout(() => {
        btnEl.textContent = originalText;
        btnEl.disabled = false;
        btnEl.classList.remove('sent');
      }, 2000);
    })
    .catch(err => {
      showToast('❌ Failed to send message: ' + err.message, 'danger');
      btnEl.textContent = originalText;
      btnEl.disabled = false;
    });
}

// --- Send Custom Message ---
function sendCustomMessage(key) {
  const input = document.querySelector(`.custom-msg-input[data-key="${key}"]`);
  if (!input) return;
  const message = input.value.trim();
  if (!message) {
    showToast('⚠️ Please type a message first', 'warning', 2000);
    input.focus();
    return;
  }

  const sendBtn = document.querySelector(`.send-msg-btn[data-key="${key}"]`);
  if (sendBtn) {
    sendBtn.textContent = '⏳';
    sendBtn.disabled = true;
  }

  const msgData = {
    message: message,
    timestamp: Date.now(),
    sender: 'admin'
  };

  db.ref('alerts/' + key).update({ adminMessage: message })
    .then(() => {
      db.ref('alerts/' + key + '/adminMessages').push(msgData);
      showToast(`💬 Custom message sent to guest`, 'success', 3000);
      input.value = '';
      if (sendBtn) {
        sendBtn.textContent = 'Send';
        sendBtn.disabled = false;
      }
    })
    .catch(err => {
      showToast('❌ Failed to send message: ' + err.message, 'danger');
      if (sendBtn) {
        sendBtn.textContent = 'Send';
        sendBtn.disabled = false;
      }
    });
}

// --- Delete Alert ---
function deleteAlert(key) {
  db.ref('alerts/' + key).remove()
    .then(() => showToast('🗑️ Alert removed', 'warning', 2000))
    .catch(err => showToast('❌ Failed to delete: ' + err.message, 'danger'));
}

// --- Clear All Alerts ---
function clearAllAlerts() {
  // Show a custom confirmation modal instead of browser confirm()
  showConfirmModal('Clear ALL alerts?', 'This action cannot be undone. All active and resolved alerts will be permanently removed.', () => {
    db.ref('alerts').remove()
      .then(() => {
        showToast('🗑️ All alerts cleared', 'warning', 3000);
        alertCount = 0;
      })
      .catch(err => showToast('❌ Failed to clear: ' + err.message, 'danger'));
  });
}

// --- Custom Confirm Modal (replaces browser confirm()) ---
function showConfirmModal(title, message, onConfirm) {
  // Remove existing modal if any
  const existing = document.getElementById('confirm-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'confirm-modal-overlay';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 2000;
    background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #1e293b; border: 1px solid rgba(255,255,255,0.1);
    border-radius: 16px; padding: 32px; max-width: 400px; width: 90%;
    box-shadow: 0 25px 60px rgba(0,0,0,0.5); text-align: center;
    animation: slideIn 0.3s ease;
  `;

  modal.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
    <h3 style="font-size: 1.2rem; font-weight: 700; margin-bottom: 8px; color: #f1f5f9;">${title}</h3>
    <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 24px; line-height: 1.5;">${message}</p>
    <div style="display: flex; gap: 12px; justify-content: center;">
      <button id="confirm-modal-cancel" class="btn btn-outline" style="flex:1; max-width: 150px;">Cancel</button>
      <button id="confirm-modal-ok" class="btn btn-danger" style="flex:1; max-width: 150px;">Clear All</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Bind buttons
  document.getElementById('confirm-modal-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  document.getElementById('confirm-modal-ok').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Close on Escape key
  const onKey = (e) => {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
  };
  document.addEventListener('keydown', onKey);
}

// --- AI Detection Simulation ---
function simulateAIDetection() {
  const indicator = document.getElementById('ai-indicator');
  if (!indicator) return;

  // Phase 1
  indicator.className = 'ai-indicator detecting';
  indicator.innerHTML = '<span class="status-dot" style="background:var(--warning)"></span> 🔍 Analyzing thermal data...';

  setTimeout(() => {
    indicator.innerHTML = '<span class="status-dot" style="background:var(--danger)"></span> 🔥 ANOMALY: Smoke detected in Room 302!';
    showToast('🤖 AI Threat Detection: Smoke anomaly detected in Room 302!', 'warning');

    setTimeout(() => {
      const rooms = ['101', '202', '302', '403'];
      const aiRoom = rooms[Math.floor(Math.random() * rooms.length)];

      db.ref('alerts').push({
        type: 'fire',
        room: aiRoom,
        guestName: 'AI Sensor',
        timestamp: Date.now(),
        status: 'active',
        source: 'ai_detection'
      }).then(() => {
        showToast(`🚨 AI auto-triggered FIRE alert for Room ${aiRoom}!`, 'danger');
      });

      setTimeout(() => {
        indicator.className = 'ai-indicator';
        indicator.innerHTML = '<span class="status-dot"></span> All Sensors Normal';
      }, 5000);
    }, 1500);
  }, 2000);
}

// --- Map ---
function initAdminMap() {
  try {
    if (typeof L === 'undefined') {
      console.log('Leaflet not loaded, skipping map init');
      return;
    }

    const hotelLat = 18.9220;
    const hotelLng = 72.8347;

    adminMap = L.map('map', {
      center: [hotelLat, hotelLng],
      zoom: 17,
      zoomControl: true,
      attributionControl: false
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(adminMap);

    L.marker([hotelLat, hotelLng], {
      icon: L.divIcon({
        html: '<div style="font-size:24px;">🏨</div>',
        iconSize: [30, 30],
        className: ''
      })
    }).addTo(adminMap).bindPopup('<b>Grand Hotel — Main Building</b>');

    setTimeout(() => adminMap.invalidateSize(), 300);
  } catch (e) {
    console.log('Map init error:', e);
  }
}

function clearMapMarkers() {
  Object.values(mapMarkers).forEach(m => adminMap && adminMap.removeLayer(m));
  mapMarkers = {};
}

function updateMapMarkers(activeAlerts) {
  if (!adminMap) return;
  clearMapMarkers();

  activeAlerts.forEach(([key, alert]) => {
    // Use real coordinates from alert if available, otherwise fall back to room positions
    const pos = (alert.lat && alert.lng)
      ? [alert.lat, alert.lng]
      : roomPositions[alert.room] || [18.9220 + Math.random() * 0.001, 72.8347 + Math.random() * 0.001];
    const color = typeColors[alert.type] || '#ef4444';

    const marker = L.circleMarker(pos, {
      radius: 12,
      color: color,
      fillColor: color,
      fillOpacity: 0.7,
      weight: 3
    }).addTo(adminMap);

    marker.bindPopup(`
      <b>${getTypeIcon(alert.type)} ${alert.type.toUpperCase()}</b><br>
      Room ${alert.room}<br>
      ${alert.guestName || 'Unknown'}<br>
      ${formatTime(alert.timestamp)}
    `);

    mapMarkers[key] = marker;
  });

  // Auto-fit map to show all markers
  if (activeAlerts.length > 0) {
    const positions = activeAlerts.map(([, a]) =>
      (a.lat && a.lng) ? [a.lat, a.lng] : roomPositions[a.room] || [18.9220, 72.8347]
    );
    try {
      adminMap.fitBounds(positions, { padding: [40, 40], maxZoom: 18 });
    } catch (e) { /* ignore if bounds invalid */ }
  }
}
