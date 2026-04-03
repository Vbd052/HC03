'use strict';

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── In-memory store ───────────────────────────────────────────────────────────
const requests = [];

// ─── Static receiver lists ─────────────────────────────────────────────────────
const hospitals = [
  { id: 'h1', name: 'City General Hospital',        phone: '+1-555-0101', type: 'hospital' },
  { id: 'h2', name: 'Metro Medical Center',          phone: '+1-555-0102', type: 'hospital' },
  { id: 'h3', name: "St. Mary's Emergency Hospital", phone: '+1-555-0103', type: 'hospital' },
];

const doctors = [
  { id: 'd1', name: 'Dr. James Wilson',    phone: '+1-555-0201', specialty: 'Emergency Medicine', type: 'doctor' },
  { id: 'd2', name: 'Dr. Sarah Chen',      phone: '+1-555-0202', specialty: 'Trauma Surgery',     type: 'doctor' },
  { id: 'd3', name: 'Dr. Michael Torres',  phone: '+1-555-0203', specialty: 'Cardiology',          type: 'doctor' },
];

// ─── Helper ────────────────────────────────────────────────────────────────────
function validateRequestBody(body) {
  const { patientData, senderInfo, receiverId, receiverType, receiverName } = body;
  if (!patientData || !senderInfo || !receiverId || !receiverType || !receiverName) {
    return 'Missing required fields: patientData, senderInfo, receiverId, receiverType, receiverName';
  }
  if (!['hospital', 'doctor'].includes(receiverType)) {
    return 'receiverType must be "hospital" or "doctor"';
  }
  if (!['driver', 'nurse'].includes(senderInfo.role)) {
    return 'senderInfo.role must be "driver" or "nurse"';
  }
  return null;
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// GET /api/hospitals
app.get('/api/hospitals', (_req, res) => res.json(hospitals));

// GET /api/doctors
app.get('/api/doctors', (_req, res) => res.json(doctors));

// POST /api/requests – create a new emergency request
app.post('/api/requests', (req, res) => {
  const error = validateRequestBody(req.body);
  if (error) return res.status(400).json({ error });

  const { patientData, senderInfo, receiverId, receiverType, receiverName } = req.body;

  const newRequest = {
    id: uuidv4(),
    patientData,
    senderInfo,
    receiverId,
    receiverType,
    receiverName,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  requests.push(newRequest);
  res.status(201).json(newRequest);
});

// GET /api/requests/receiver/:receiverId – incoming requests for a receiver
app.get('/api/requests/receiver/:receiverId', (req, res) => {
  const incoming = requests.filter(r => r.receiverId === req.params.receiverId);
  res.json(incoming);
});

// GET /api/requests/sender/:senderId – requests sent by a sender (for polling)
app.get('/api/requests/sender/:senderId', (req, res) => {
  const sent = requests.filter(r => r.senderInfo.id === req.params.senderId);
  res.json(sent);
});

// PATCH /api/requests/:id/status – accept or reject a request
app.patch('/api/requests/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be "accepted" or "rejected"' });
  }

  const request = requests.find(r => r.id === req.params.id);
  if (!request) return res.status(404).json({ error: 'Request not found' });

  request.status = status;
  request.updatedAt = new Date().toISOString();
  res.json(request);
});

// ─── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`HC03 server running → http://localhost:${PORT}`);
  });
}

module.exports = { app, requests, hospitals, doctors };
