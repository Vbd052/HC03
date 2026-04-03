# HC03 – Emergency Request System

A Node.js/Express web application that enables **Drivers and Nurses** to send emergency requests to **Hospitals and Doctors**, who can then accept or reject them in real time (via polling).

---

## Features

| Role | What they can do |
|------|-----------------|
| 🚗 Driver | Fill in patient data, select a hospital/doctor, send an emergency request, poll for status updates, receive an in-app notification + on-screen SMS simulation when accepted |
| 👩‍⚕️ Nurse | Same as Driver |
| 🏥 Hospital | View all incoming requests with patient details & triage info, accept or reject |
| 👨‍⚕️ Doctor | Same as Hospital |

---

## Tech Stack

- **Backend**: Node.js + Express (in-memory request store)
- **Frontend**: Plain HTML / CSS / JavaScript (no framework required)
- **IDs**: UUID v4 via the `uuid` package

---

## Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Start the server
npm start
# → HC03 server running → http://localhost:3000
```

Then open **http://localhost:3000** in your browser.

For auto-restart on file changes during development:

```bash
npm run dev
```

---

## Application Pages

| URL | Description |
|-----|-------------|
| `/` or `/index.html` | Role selection landing page |
| `/sender.html?role=driver` | Driver dashboard (send requests) |
| `/sender.html?role=nurse` | Nurse dashboard (send requests) |
| `/receiver.html?role=hospital` | Hospital dashboard (incoming requests) |
| `/receiver.html?role=doctor` | Doctor dashboard (incoming requests) |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/hospitals` | List available hospitals |
| `GET` | `/api/doctors` | List available doctors |
| `POST` | `/api/requests` | Create a new emergency request |
| `GET` | `/api/requests/receiver/:receiverId` | Get incoming requests for a receiver |
| `GET` | `/api/requests/sender/:senderId` | Get requests sent by a sender (for polling) |
| `PATCH` | `/api/requests/:id/status` | Accept or reject a request |

### POST `/api/requests` – Request body

```json
{
  "patientData": {
    "name": "Alice",
    "age": 35,
    "emergencyType": "cardiac",
    "triageLevel": 1,
    "notes": "Chest pain, BP 90/60"
  },
  "senderInfo": {
    "id": "sender-unique-id",
    "name": "Bob Driver",
    "phone": "+1-555-9999",
    "role": "driver"
  },
  "receiverId": "h1",
  "receiverType": "hospital",
  "receiverName": "City General Hospital"
}
```

### PATCH `/api/requests/:id/status` – Body

```json
{ "status": "accepted" }
```

or

```json
{ "status": "rejected" }
```

---

## Testing

### Run automated API tests

```bash
npm test
```

All 14 tests cover:
- `GET /api/hospitals` and `GET /api/doctors`
- `POST /api/requests` (success + validation errors)
- `GET /api/requests/receiver/:id` and `GET /api/requests/sender/:id`
- `PATCH /api/requests/:id/status` (accept, reject, invalid status, not found)

### Manual end-to-end test (curl)

```bash
# 1. Start the server
npm start &

# 2. Get available hospitals
curl http://localhost:3000/api/hospitals

# 3. Create an emergency request (Driver → Hospital)
curl -s -X POST http://localhost:3000/api/requests \
  -H 'Content-Type: application/json' \
  -d '{
    "patientData":  {"name":"Alice","age":35,"emergencyType":"cardiac","triageLevel":1,"notes":"Chest pain"},
    "senderInfo":   {"id":"driver-abc","name":"Bob Driver","phone":"+1-555-9999","role":"driver"},
    "receiverId":   "h1",
    "receiverType": "hospital",
    "receiverName": "City General Hospital"
  }'
# → Returns JSON with id and status: "pending"

# 4. Hospital views incoming requests
curl http://localhost:3000/api/requests/receiver/h1

# 5. Hospital accepts the request (replace <id> with the id from step 3)
curl -X PATCH http://localhost:3000/api/requests/<id>/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"accepted"}'

# 6. Driver polls for status update
curl http://localhost:3000/api/requests/sender/driver-abc
# → status is now "accepted"
```

### Manual browser test

1. Open two browser tabs:
   - Tab 1: `http://localhost:3000/sender.html?role=driver` (Driver)
   - Tab 2: `http://localhost:3000/receiver.html?role=hospital` (Hospital)
2. In Tab 1, fill in your name, phone, patient details, select a hospital, and click **Send Emergency Request**.
3. In Tab 2, select the same hospital from the dropdown. The request appears automatically (polls every 5 s).
4. Click **✅ Accept** in Tab 2.
5. Within 5 seconds, Tab 1 shows:
   - A **notification popup**: "✅ [Hospital Name] has accepted your request. You can proceed."
   - An **on-screen SMS simulation**: "📱 SMS sent to driver: [Hospital Name] has accepted your emergency request…"
   - The SMS message is also logged in the browser console.

---

## Project Structure

```
HC03/
├── server.js              # Express server + all API routes
├── package.json
├── public/
│   ├── index.html         # Role selection landing page
│   ├── sender.html        # Driver / Nurse UI
│   ├── sender.js          # Sender-side logic (send, poll, notification)
│   ├── receiver.html      # Hospital / Doctor UI
│   ├── receiver.js        # Receiver-side logic (view, accept/reject)
│   └── style.css          # Shared styles
└── test/
    └── requests.test.js   # API integration tests (Node built-ins only)
```

---

## Data Model

Each request stored in memory:

```json
{
  "id":           "uuid-v4",
  "patientData":  { "name": "", "age": 0, "emergencyType": "", "triageLevel": 1, "notes": "" },
  "senderInfo":   { "id": "", "name": "", "phone": "", "role": "driver|nurse" },
  "receiverId":   "h1|d1|…",
  "receiverType": "hospital|doctor",
  "receiverName": "…",
  "status":       "pending|accepted|rejected",
  "createdAt":    "ISO-8601",
  "updatedAt":    "ISO-8601"
}
```

> **Note**: Data is stored in memory and resets when the server restarts. This is by design for this demonstration.
