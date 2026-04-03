'use strict';

// ─── Sender identity (persisted in localStorage) ───────────────────────────
let senderId = localStorage.getItem('hc03_senderId');
if (!senderId) {
  senderId = 'sender-' + Math.random().toString(36).slice(2, 11);
  localStorage.setItem('hc03_senderId', senderId);
}

// Set notified-requests to avoid duplicate popups across refreshes
const notifiedRequests = new Set(
  JSON.parse(localStorage.getItem('hc03_notified') || '[]')
);

let selectedReceiver = null;
let pollingInterval = null;

// ─── Initialise from URL param ──────────────────────────────────────────────
(function init() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (role === 'nurse') {
    document.getElementById('sender-role').value = 'nurse';
  }
  const chip = document.getElementById('role-chip');
  chip.textContent = role === 'nurse' ? '👩‍⚕️ Nurse' : '🚗 Driver';

  // Wire up event listeners (replaces inline onchange / onclick in HTML)
  document.getElementById('receiver-type').addEventListener('change', loadReceivers);
  document.getElementById('send-btn').addEventListener('click', sendRequest);
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);

  loadReceivers();
  loadSentRequests();
  pollingInterval = setInterval(loadSentRequests, 5000);
})();

window.addEventListener('beforeunload', () => {
  if (pollingInterval) clearInterval(pollingInterval);
});

// ─── Load hospitals or doctors ──────────────────────────────────────────────
async function loadReceivers() {
  const type = document.getElementById('receiver-type').value;
  const list = document.getElementById('receiver-list');
  list.innerHTML = '<p class="text-muted">Loading…</p>';
  selectedReceiver = null;

  try {
    const res = await fetch(`/api/${type === 'hospital' ? 'hospitals' : 'doctors'}`);
    const data = await res.json();

    if (!data.length) {
      list.innerHTML = '<p class="text-muted">No options available.</p>';
      return;
    }

    list.innerHTML = data.map(r => `
      <div class="receiver-card"
           data-id="${escHtml(r.id)}"
           data-name="${escHtml(r.name)}"
           data-type="${escHtml(type)}"
           data-phone="${escHtml(r.phone)}">
        <strong>${escHtml(r.name)}</strong>
        ${r.specialty ? `<span class="badge">${escHtml(r.specialty)}</span>` : ''}
        <small>${escHtml(r.phone)}</small>
      </div>
    `).join('');

    list.querySelectorAll('.receiver-card').forEach(card => {
      card.addEventListener('click', () => {
        selectReceiver(
          card.dataset.id,
          card.dataset.name,
          card.dataset.type,
          card.dataset.phone
        );
      });
    });
  } catch {
    list.innerHTML = '<p class="text-muted">⚠️ Could not load receivers. Is the server running?</p>';
  }
}

function selectReceiver(id, name, type, phone) {
  document.querySelectorAll('.receiver-card').forEach(el => el.classList.remove('selected'));
  // Find the card that matches the chosen id
  const card = document.querySelector(`.receiver-card[data-id="${CSS.escape(id)}"]`);
  if (card) card.classList.add('selected');
  selectedReceiver = { id, name, type, phone };
}

// ─── Send request ───────────────────────────────────────────────────────────
async function sendRequest() {
  const senderName  = document.getElementById('sender-name').value.trim();
  const senderPhone = document.getElementById('sender-phone').value.trim();
  const senderRole  = document.getElementById('sender-role').value;
  const patientName = document.getElementById('patient-name').value.trim();
  const patientAge  = document.getElementById('patient-age').value;
  const emergType   = document.getElementById('emergency-type').value;
  const triage      = document.getElementById('triage-level').value;
  const notes       = document.getElementById('patient-notes').value.trim();

  if (!senderName || !senderPhone) {
    alert('Please fill in your name and phone number.');
    return;
  }
  if (!patientName || !patientAge) {
    alert('Please fill in the patient name and age.');
    return;
  }
  if (!selectedReceiver) {
    alert('Please select a hospital or doctor first.');
    return;
  }

  const payload = {
    patientData: {
      name: patientName,
      age: parseInt(patientAge, 10),
      emergencyType: emergType,
      triageLevel: parseInt(triage, 10),
      notes,
    },
    senderInfo: {
      id: senderId,
      name: senderName,
      phone: senderPhone,
      role: senderRole,
    },
    receiverId:   selectedReceiver.id,
    receiverType: selectedReceiver.type,
    receiverName: selectedReceiver.name,
  };

  const btn = document.getElementById('send-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok) {
      await loadSentRequests();
    } else {
      alert('Error sending request: ' + data.error);
    }
  } catch {
    alert('Could not reach server. Please make sure the server is running.');
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Send Emergency Request';
  }
}

// ─── Poll & render sent requests ────────────────────────────────────────────
async function loadSentRequests() {
  try {
    const res = await fetch(`/api/requests/sender/${senderId}`);
    const requests = await res.json();
    renderSentRequests(requests);

    // Check for newly accepted requests → show notification
    requests.forEach(r => {
      if (r.status === 'accepted' && !notifiedRequests.has(r.id)) {
        notifiedRequests.add(r.id);
        localStorage.setItem('hc03_notified', JSON.stringify([...notifiedRequests]));
        showNotification(r);
      }
    });
  } catch {
    // Server not reachable; silently skip (don't spam alerts in poll)
  }
}

function renderSentRequests(requests) {
  const container = document.getElementById('sent-requests');
  if (!requests.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No requests sent yet.</p>
      </div>`;
    return;
  }

  const triageLabels = ['', 'Immediate (Critical)', 'Emergent', 'Urgent', 'Less Urgent', 'Non-Urgent'];

  container.innerHTML = requests
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(r => `
      <div class="request-card status-${r.status}">
        <div class="request-header">
          <strong>To: ${escHtml(r.receiverName)}</strong>
          <span class="status-badge ${r.status}">${r.status.toUpperCase()}</span>
        </div>
        <div class="request-body">
          <div class="patient-info">
            <h4>Patient</h4>
            <p><strong>Name:</strong> ${escHtml(r.patientData.name)}</p>
            <p><strong>Age:</strong> ${r.patientData.age}</p>
            <p><strong>Emergency:</strong> ${escHtml(r.patientData.emergencyType)}</p>
            <p><strong>Triage:</strong>
              <span class="triage-${r.patientData.triageLevel}">
                Level ${r.patientData.triageLevel} – ${triageLabels[r.patientData.triageLevel] || ''}
              </span>
            </p>
            ${r.patientData.notes ? `<p><strong>Notes:</strong> ${escHtml(r.patientData.notes)}</p>` : ''}
          </div>
          <div class="sender-info">
            <h4>Request Info</h4>
            <p><strong>Receiver:</strong> ${escHtml(r.receiverName)}</p>
            <p><strong>Type:</strong> ${r.receiverType}</p>
            <p><strong>Sent:</strong> ${new Date(r.createdAt).toLocaleString()}</p>
            <p><strong>Updated:</strong> ${new Date(r.updatedAt).toLocaleString()}</p>
          </div>
        </div>
      </div>
    `).join('');
}

// ─── Notification modal ─────────────────────────────────────────────────────
function showNotification(request) {
  const senderRole   = request.senderInfo.role;   // "driver" | "nurse"
  const receiverName = request.receiverName;

  const modalMsg = `${receiverName} has accepted your emergency request. You can proceed immediately.`;
  const smsText  = `SMS sent to ${senderRole}: ${receiverName} has accepted your emergency request. Please proceed immediately.`;

  document.getElementById('modal-message').textContent = modalMsg;
  document.getElementById('sms-box').textContent = '📱 ' + smsText;
  document.getElementById('notification-modal').classList.remove('hidden');

  // Console simulation
  console.log('[HC03 SMS SIMULATION]', smsText);
}

function closeModal() {
  document.getElementById('notification-modal').classList.add('hidden');
}

// ─── Utility ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
