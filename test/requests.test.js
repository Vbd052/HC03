'use strict';

/**
 * Basic integration tests for the HC03 Emergency Request API.
 * Uses only built-in Node.js modules (no test-runner required).
 * Run with: npm test
 */

const http = require('http');
const assert = require('assert');
const { app, requests } = require('../server');

let server;
let PORT;

// ─── Helpers ────────────────────────────────────────────────────────────────
function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      const payload = JSON.stringify(body);
      req.write(payload);
    }
    req.end();
  });
}

function get(path) {
  return request({ hostname: 'localhost', port: PORT, path, method: 'GET' });
}

function post(path, body) {
  const payload = JSON.stringify(body);
  return request(
    {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    body
  );
}

function patch(path, body) {
  const payload = JSON.stringify(body);
  return request(
    {
      hostname: 'localhost',
      port: PORT,
      path,
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    },
    body
  );
}

// ─── Test runner ────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ ${name}`);
    console.error(`     ${err.message}`);
    failed++;
  }
}

// ─── Tests ──────────────────────────────────────────────────────────────────
async function runTests() {
  // Clear in-memory store before each run
  requests.length = 0;

  console.log('\n── GET /api/hospitals ──────────────────────────────────────');
  await test('returns array of hospitals', async () => {
    const res = await get('/api/hospitals');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
    assert.ok(res.body[0].id);
    assert.ok(res.body[0].name);
  });

  console.log('\n── GET /api/doctors ────────────────────────────────────────');
  await test('returns array of doctors', async () => {
    const res = await get('/api/doctors');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.ok(res.body.length > 0);
    assert.ok(res.body[0].specialty);
  });

  console.log('\n── POST /api/requests ──────────────────────────────────────');
  let createdId;

  await test('creates a new pending request', async () => {
    const res = await post('/api/requests', {
      patientData: { name: 'Alice', age: 35, emergencyType: 'cardiac', triageLevel: 1, notes: '' },
      senderInfo:  { id: 'sender-test-1', name: 'Bob Driver', phone: '+1-555-9999', role: 'driver' },
      receiverId:   'h1',
      receiverType: 'hospital',
      receiverName: 'City General Hospital',
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id);
    assert.strictEqual(res.body.status, 'pending');
    assert.strictEqual(res.body.patientData.name, 'Alice');
    createdId = res.body.id;
  });

  await test('returns 400 when required fields are missing', async () => {
    const res = await post('/api/requests', { patientData: { name: 'X' } });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  await test('returns 400 for invalid receiverType', async () => {
    const res = await post('/api/requests', {
      patientData:  { name: 'X', age: 20, emergencyType: 'trauma', triageLevel: 2, notes: '' },
      senderInfo:   { id: 'x', name: 'X', phone: '123', role: 'driver' },
      receiverId:   'h1',
      receiverType: 'invalid',
      receiverName: 'Test',
    });
    assert.strictEqual(res.status, 400);
  });

  await test('returns 400 for invalid senderInfo.role', async () => {
    const res = await post('/api/requests', {
      patientData:  { name: 'X', age: 20, emergencyType: 'trauma', triageLevel: 2, notes: '' },
      senderInfo:   { id: 'x', name: 'X', phone: '123', role: 'alien' },
      receiverId:   'h1',
      receiverType: 'hospital',
      receiverName: 'Test',
    });
    assert.strictEqual(res.status, 400);
  });

  console.log('\n── GET /api/requests/receiver/:id ──────────────────────────');
  await test('returns requests for a receiver', async () => {
    const res = await get('/api/requests/receiver/h1');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, createdId);
  });

  await test('returns empty array for receiver with no requests', async () => {
    const res = await get('/api/requests/receiver/h99');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, []);
  });

  console.log('\n── GET /api/requests/sender/:id ────────────────────────────');
  await test('returns requests for a sender', async () => {
    const res = await get('/api/requests/sender/sender-test-1');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.length, 1);
  });

  await test('returns empty array for unknown sender', async () => {
    const res = await get('/api/requests/sender/nobody');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body, []);
  });

  console.log('\n── PATCH /api/requests/:id/status ──────────────────────────');
  await test('accepts a request', async () => {
    const res = await patch(`/api/requests/${createdId}/status`, { status: 'accepted' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'accepted');
  });

  await test('rejects a request', async () => {
    // Create another request to reject
    const cr = await post('/api/requests', {
      patientData:  { name: 'Charlie', age: 50, emergencyType: 'trauma', triageLevel: 2, notes: '' },
      senderInfo:   { id: 'sender-test-2', name: 'Nurse Jane', phone: '+1-555-8888', role: 'nurse' },
      receiverId:   'd1',
      receiverType: 'doctor',
      receiverName: 'Dr. James Wilson',
    });
    const res = await patch(`/api/requests/${cr.body.id}/status`, { status: 'rejected' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'rejected');
  });

  await test('returns 400 for invalid status value', async () => {
    const res = await patch(`/api/requests/${createdId}/status`, { status: 'maybe' });
    assert.strictEqual(res.status, 400);
  });

  await test('returns 404 for unknown request id', async () => {
    const res = await patch('/api/requests/does-not-exist/status', { status: 'accepted' });
    assert.strictEqual(res.status, 404);
  });
}

// ─── Bootstrap ──────────────────────────────────────────────────────────────
server = app.listen(0, async () => {
  PORT = server.address().port;
  console.log(`\nRunning tests against http://localhost:${PORT}`);

  try {
    await runTests();
  } finally {
    server.close();
    const total = passed + failed;
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed}/${total} passed${failed ? `, ${failed} failed` : ''}`);
    if (failed) process.exit(1);
  }
});
