'use strict';

let receiverInterval = null;

// ─── Initialise from URL param ──────────────────────────────────────────────
(function init() {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');
  if (role === 'doctor') {
    document.getElementById('receiver-type').value = 'doctor';
  }
  const chip = document.getElementById('role-chip');
  chip.textContent = role === 'doctor' ? '👨‍⚕️ Doctor' : '🏥 Hospital';

  // Wire up event listeners (replaces inline onchange in HTML)
  document.getElementById('receiver-type').addEventListener('change', onTypeChange);
  document.getElementById('receiver-id').addEventListener('change', loadIncomingRequests);

  // Event delegation for Accept/Reject buttons inside #incoming-requests
  document.getElementById('incoming-requests').addEventListener('click', e => {
    const btn = e.target.closest('button[data-request-id]');
    if (!btn) return;
    updateStatus(btn.dataset.requestId, btn.dataset.action);
  });

  onTypeChange();
})();

window.addEventListener('beforeunload', () => {
  if (receiverInterval) clearInterval(receiverInterval);
});

// ─── Populate the identity dropdown when type changes ───────────────────────
async function onTypeChange() {
  const type = document.getElementById('receiver-type').value;
  const select = document.getElementById('receiver-id');
  select.innerHTML = '<option value="">— loading —</option>';

  try {
    const res = await fetch(`/api/${type === 'hospital' ? 'hospitals' : 'doctors'}`);
    const data = await res.json();
    select.innerHTML = data.map(r =>
      `<option value="${escHtml(r.id)}">${escHtml(r.name)}</option>`
    ).join('');
    loadIncomingRequests();
  } catch {
    select.innerHTML = '<option value="">⚠️ Server unreachable</option>';
  }
}

// ─── Load & render incoming requests ────────────────────────────────────────
async function loadIncomingRequests() {
  const receiverId = document.getElementById('receiver-id').value;
  if (!receiverId) return;

  try {
    const res = await fetch(`/api/requests/receiver/${receiverId}`);
    const requests = await res.json();
    renderIncoming(requests);
  } catch {
    document.getElementById('incoming-requests').innerHTML =
      '<p class="text-muted">⚠️ Could not load requests. Is the server running?</p>';
  }
}

function renderIncoming(requests) {
  const container = document.getElementById('incoming-requests');

  if (!requests.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>No incoming requests yet.</p>
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
          <strong>From: ${escHtml(r.senderInfo.name)}
            <span class="badge">${r.senderInfo.role}</span>
          </strong>
          <span class="status-badge ${r.status}">${r.status.toUpperCase()}</span>
        </div>
        <div class="request-body">
          <div class="patient-info">
            <h4>🩺 Patient Details</h4>
            <p><strong>Name:</strong> ${escHtml(r.patientData.name)}</p>
            <p><strong>Age:</strong> ${r.patientData.age}</p>
            <p><strong>Emergency:</strong> ${escHtml(r.patientData.emergencyType)}</p>
            <p><strong>Triage:</strong>
              <span class="triage-${r.patientData.triageLevel}">
                Level ${r.patientData.triageLevel} – ${triageLabels[r.patientData.triageLevel] || ''}
              </span>
            </p>
            ${r.patientData.notes
              ? `<p><strong>Notes:</strong> ${escHtml(r.patientData.notes)}</p>`
              : ''}
          </div>
          <div class="sender-info">
            <h4>📞 Sender Information</h4>
            <p><strong>Name:</strong>  ${escHtml(r.senderInfo.name)}</p>
            <p><strong>Phone:</strong> ${escHtml(r.senderInfo.phone)}</p>
            <p><strong>Role:</strong>  ${r.senderInfo.role}</p>
            <p><strong>Received:</strong> ${new Date(r.createdAt).toLocaleString()}</p>
          </div>
          <small>Request ID: ${r.id}</small>
        </div>
        ${r.status === 'pending' ? `
          <div class="request-actions">
            <button class="btn btn-success" data-request-id="${escHtml(r.id)}" data-action="accepted">
              ✅ Accept
            </button>
            <button class="btn btn-danger" data-request-id="${escHtml(r.id)}" data-action="rejected">
              ❌ Reject
            </button>
          </div>
        ` : ''}
      </div>
    `).join('');
}

// ─── Accept / Reject ────────────────────────────────────────────────────────
async function updateStatus(requestId, status) {
  try {
    const res = await fetch(`/api/requests/${requestId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert('Error: ' + data.error);
      return;
    }
    await loadIncomingRequests();
  } catch {
    alert('Could not reach server.');
  }
}

// Start polling
receiverInterval = setInterval(loadIncomingRequests, 5000);

// ─── Utility ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
