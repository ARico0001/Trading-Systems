const BASE_URL = "https://us-central1-ops-board-506600.cloudfunctions.net";

// --- SECURITY FIX: escape all untrusted data before it touches innerHTML ---
// Without this, any string stored in BigQuery (title, notes, snippet, etc.)
// can contain HTML/JS that executes in every visitor's browser (stored XSS).
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadAllData() {
    try {
        // Guard: getIdToken() must exist (wire up Firebase Auth / Google
        // Identity Services and expose it globally, or import it here)
        // before this fires, otherwise every fetch below throws unhandled.
        if (typeof getIdToken !== 'function') {
            throw new Error('getIdToken() is not defined — auth is not wired up yet.');
        }

        // SECURITY FIX: send the signed-in user's ID token so the backend
        // can actually verify who is calling — right now these are public,
        // unauthenticated requests. See note at bottom of file.
        const idToken = await getIdToken();
        const authHeaders = { Authorization: `Bearer ${idToken}` };

        const [notes, tasks, study, coding] = await Promise.all([
            fetch(`${BASE_URL}/getNotes`, { headers: authHeaders }).then(res => res.json()),
            fetch(`${BASE_URL}/getTasks`, { headers: authHeaders }).then(res => res.json()),
            fetch(`${BASE_URL}/getStudyItems`, { headers: authHeaders }).then(res => res.json()),
            fetch(`${BASE_URL}/getCodingNotes`, { headers: authHeaders }).then(res => res.json())
        ]);

        renderList('notes-container', notes, n => `
            <h4>User: ${escapeHtml(n.user)}</h4>
            <p>${escapeHtml(n.content)}</p>
            <small>${formatDate(n.created_at)}</small>
        `);

        renderList('tasks-container', tasks, t => `
            <span class="status-badge">${escapeHtml(t.status)}</span>
            <h4>${escapeHtml(t.title)}</h4>
            <p>${escapeHtml(t.description)}</p>
            <small>Assigned to: ${escapeHtml(t.user)} • ${formatDate(t.created_at)}</small>
        `);

        renderList('study-container', study, s => `
            <h4>Topic: ${escapeHtml(s.topic || 'General')}</h4>
            <p>${escapeHtml(s.details || s.content || '')}</p>
            <small>${formatDate(s.created_at)}</small>
        `);

        renderList('coding-container', coding, c => `
            <p><code>${escapeHtml(c.snippet || c.content || '')}</code></p>
            <p>${escapeHtml(c.note || '')}</p>
            <small>${formatDate(c.created_at)}</small>
        `);
    } catch (err) {
        console.error("Failed to load data from BigQuery:", err);
        // UX FIX: show a real fallback instead of leaving containers stuck
        // on a stale/loading state when auth or the network fails.
        ['notes-container', 'tasks-container', 'study-container', 'coding-container']
            .forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<p style="color:#c00;">Couldn\'t load data. Please sign in and try again.</p>';
            });
    }
}

function renderList(id, items, template) {
    const el = document.getElementById(id);
    // ROBUSTNESS FIX: a Cloud Function returning an error object
    // (e.g. { error: "Unauthorized" }) instead of an array would otherwise
    // throw inside .map() below. Treat anything non-array as empty/error.
    if (!Array.isArray(items) || !items.length) {
        el.innerHTML = '<p style="color: #999; font-style: italic;">No items found.</p>';
        return;
    }
    el.innerHTML = items.map(item => `<div class="card">${template(item)}</div>`).join('');
}

function formatDate(ts) {
    if (!ts) return '';
    const dateStr = ts.value || ts;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return ''; // guard against malformed/malicious date strings
    return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

window.onload = loadAllData;

/*
NEXT STEPS (backend — cannot be fixed from this file alone):
1. Each Cloud Function (getNotes, getTasks, getStudyItems, getCodingNotes,
   and especially any write/import endpoints) must verify the Authorization
   Bearer token server-side (e.g. Firebase Admin SDK verifyIdToken) and
   reject unauthenticated or unauthorized requests with 401/403.
2. On any write endpoint (import JSON, add item, send to BigQuery), validate
   the incoming JSON against a strict schema server-side before it ever
   reaches a BigQuery insert/load job — reject unknown fields, wrong types,
   oversized strings, and enforce a max request size.
3. Use parameterized queries / the BigQuery client library's insert methods
   — never string-concatenate user data into SQL.
4. Restrict CORS on the Cloud Functions to your actual domain
   (systems.morninglightsolutions.com) instead of allowing all origins.
*/