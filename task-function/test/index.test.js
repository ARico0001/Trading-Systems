'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createExportNotes } = require('../index');

function createResponse() {
  return {
    headers: {},
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send(value) {
      this.body = value;
      return this;
    }
  };
}

function createHandler({ insert = async () => {}, query = async () => [[]] } = {}) {
  const bigquery = {
    dataset(datasetId) {
      assert.equal(datasetId, 'trading_systems');
      return {
        table(tableId) {
          assert.equal(tableId, 'systems_desk_board');
          return { insert };
        }
      };
    },
    query
  };
  const authClient = {
    async verifyIdToken({ idToken, audience }) {
      assert.equal(idToken, 'valid-token');
      assert.equal(audience, 'test-client-id');
      return { getPayload: () => ({ email: 'Trader@Example.com', email_verified: true }) };
    }
  };
  return createExportNotes({
    bigquery,
    authClient,
    googleClientId: 'test-client-id',
    allowedOrigin: 'https://systems.morninglightsolutions.com',
    createSnapshotId: () => 'snapshot-1'
  });
}

test('allows the configured browser origin to complete CORS preflight', async () => {
  const handler = createHandler();
  const res = createResponse();

  await handler({
    method: 'OPTIONS',
    headers: { origin: 'https://systems.morninglightsolutions.com' }
  }, res);

  assert.equal(res.statusCode, 204);
  assert.equal(res.headers['Access-Control-Allow-Origin'], 'https://systems.morninglightsolutions.com');
  assert.equal(res.headers['Access-Control-Allow-Headers'], 'Authorization, Content-Type');
});

test('rejects a request without a Google ID token', async () => {
  const handler = createHandler();
  const res = createResponse();

  await handler({ method: 'POST', headers: {}, body: { items: [] } }, res);

  assert.equal(res.statusCode, 401);
  assert.match(res.body.error, /ID token/);
});

test('inserts rows for the verified user and groups them into a snapshot', async () => {
  let insertedRows;
  const handler = createHandler({
    insert: async rows => { insertedRows = rows; }
  });
  const res = createResponse();

  await handler({
    method: 'POST',
    headers: {
      origin: 'https://systems.morninglightsolutions.com',
      authorization: 'Bearer valid-token'
    },
    body: {
      user_email: 'forged@example.com',
      items: [{
        id: 'item-1',
        title: 'Review opening range scan',
        category: 'scan',
        status: 'backlog',
        priority: 'high',
        notes: '',
        created: 1763413200000
      }]
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.inserted, 1);
  assert.equal(insertedRows[0].user_email, 'trader@example.com');
  assert.equal(insertedRows[0].metadata.priority, 'high');
  assert.equal(insertedRows[0].metadata.snapshot_id, 'snapshot-1');
});

test('loads items from BigQuery for the authenticated user', async () => {
  let queryOptions;
  const handler = createHandler({
    query: async options => {
      queryOptions = options;
      return [[{
        id: 'item-1',
        title: 'Review opening range scan',
        category: 'scan',
        status: 'backlog',
        notes: '',
        priority: 'high',
        created_at: '2025-11-18T13:00:00.000Z'
      }]];
    }
  });
  const res = createResponse();

  await handler({
    method: 'GET',
    headers: { authorization: 'Bearer valid-token' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(queryOptions.params.userEmail, 'trader@example.com');
  assert.equal(res.body.items[0].priority, 'high');
  assert.equal(res.body.items[0].created, Date.parse('2025-11-18T13:00:00.000Z'));
});
