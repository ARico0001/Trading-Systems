'use strict';

const { BigQuery } = require('@google-cloud/bigquery');
const { OAuth2Client } = require('google-auth-library');
const { randomUUID } = require('node:crypto');

const PROJECT_ID = 'ops-board-506600';
const DATASET_ID = 'trading_systems';
const TABLE_ID = 'systems_desk_board';
const ALLOWED_CATEGORIES = new Set(['scan', 'tool', 'collab']);
const ALLOWED_STATUSES = new Set(['backlog', 'progress', 'testing', 'done']);
const ALLOWED_PRIORITIES = new Set(['low', 'med', 'high']);

function createExportNotes({
  bigquery,
  authClient,
  googleClientId,
  allowedOrigin = 'https://systems.morninglightsolutions.com',
  createSnapshotId = randomUUID
}) {
  const table = bigquery.dataset(DATASET_ID).table(TABLE_ID);

  return async function exportNotes(req, res) {
    const origin = req.headers.origin;
    if (origin && origin !== allowedOrigin) {
      return res.status(403).json({ error: 'Origin not allowed.' });
    }

    if (origin === allowedOrigin) {
      res.set('Access-Control-Allow-Origin', allowedOrigin);
      res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).send('');
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.set('Allow', 'GET, POST, OPTIONS');
      return res.status(405).json({ error: 'Method not allowed.' });
    }
    if (!googleClientId) {
      return res.status(500).json({ error: 'Google sign-in is not configured on the server.' });
    }

    const authorization = req.headers.authorization || '';
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) return res.status(401).json({ error: 'A Google ID token is required.' });

    let userEmail;
    try {
      const ticket = await authClient.verifyIdToken({
        idToken: tokenMatch[1],
        audience: googleClientId
      });
      const claims = ticket.getPayload();
      if (!claims || claims.email_verified !== true || typeof claims.email !== 'string') {
        return res.status(401).json({ error: 'The Google ID token has no verified email.' });
      }
      userEmail = claims.email.toLowerCase();
    } catch {
      return res.status(401).json({ error: 'The Google ID token is invalid or expired.' });
    }

    if (req.method === 'GET') {
      try {
        const [rows] = await bigquery.query({
          query: `
            WITH latest_snapshot AS (
              SELECT JSON_VALUE(metadata, '$.snapshot_id') AS snapshot_id
              FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
              WHERE user_email = @userEmail
                AND JSON_VALUE(metadata, '$.snapshot_id') IS NOT NULL
              ORDER BY exported_at DESC
              LIMIT 1
            )
            SELECT
              id,
              title,
              category,
              status,
              notes,
              JSON_VALUE(metadata, '$.priority') AS priority,
              created_at
            FROM \`${PROJECT_ID}.${DATASET_ID}.${TABLE_ID}\`
            WHERE user_email = @userEmail
              AND JSON_VALUE(metadata, '$.snapshot_id') = (
                SELECT snapshot_id FROM latest_snapshot
              )
            ORDER BY created_at
          `,
          params: { userEmail }
        });

        const items = rows.map(row => {
          const createdValue = row.created_at && row.created_at.value !== undefined
            ? row.created_at.value
            : row.created_at;
          const created = new Date(createdValue).getTime();
          if (!Number.isFinite(created)) throw new Error('Invalid timestamp returned by BigQuery.');
          return {
            id: row.id,
            title: row.title,
            category: row.category,
            status: row.status,
            notes: row.notes || '',
            priority: row.priority,
            created
          };
        });

        return res.status(200).json({ items });
      } catch (error) {
        console.error('BigQuery load failed:', error.code || error.name);
        return res.status(500).json({ error: 'Could not load the saved board from BigQuery.' });
      }
    }

    const items = req.body && req.body.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > 1000) {
      return res.status(400).json({ error: 'Provide between 1 and 1000 board items to sync.' });
    }

    const exportedAt = new Date().toISOString();
    const snapshotId = createSnapshotId();
    let rows;
    try {
      rows = items.map(item => toBigQueryRow(item, userEmail, exportedAt, snapshotId));
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      await table.insert(rows);
      return res.status(201).json({ inserted: rows.length });
    } catch (error) {
      console.error('BigQuery insert failed:', error.code || error.name);
      return res.status(500).json({ error: 'Could not save the board to BigQuery.' });
    }
  };
}

function toBigQueryRow(item, userEmail, exportedAt, snapshotId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error('Each item must be a JSON object.');
  }
  if (typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200) {
    throw new Error('Each item must have a valid ID.');
  }
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) {
    throw new Error('Each item must have a valid title (up to 500 characters).');
  }
  if (!ALLOWED_CATEGORIES.has(item.category) || !ALLOWED_STATUSES.has(item.status) ||
      !ALLOWED_PRIORITIES.has(item.priority)) {
    throw new Error('An item has an invalid category, status, or priority.');
  }
  if (typeof item.notes !== 'string' || item.notes.length > 20000) {
    throw new Error('Each item must have notes no longer than 20000 characters.');
  }
  if (typeof item.created !== 'number' || !Number.isFinite(item.created) ||
      !Number.isFinite(new Date(item.created).getTime())) {
    throw new Error('Each item must have a valid creation timestamp.');
  }

  const timestamp = new Date(item.created).toISOString();
  return {
    id: item.id.trim(),
    user_email: userEmail,
    title: item.title.trim(),
    category: item.category,
    status: item.status,
    notes: item.notes,
    snippet: typeof item.snippet === 'string' ? item.snippet : null,
    metadata: {
      priority: item.priority,
      snapshot_id: snapshotId
    },
    created_at: timestamp,
    updated_at: exportedAt,
    exported_at: exportedAt
  };
}

const bigquery = new BigQuery({ projectId: PROJECT_ID });
const authClient = new OAuth2Client();

exports.exportNotes = createExportNotes({
  bigquery,
  authClient,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'https://systems.morninglightsolutions.com'
});
exports.createExportNotes = createExportNotes;
