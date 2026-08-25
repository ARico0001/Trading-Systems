const BASE_URL = "https://us-central1-ops-board-506600.cloudfunctions.net";

async function loadAllData() {
    try {
        const [notes, tasks, study, coding] = await Promise.all([
            fetch(`${BASE_URL}/getNotes`).then(res => res.json()),
            fetch(`${BASE_URL}/getTasks`).then(res => res.json()),
            fetch(`${BASE_URL}/getStudyItems`).then(res => res.json()),
            fetch(`${BASE_URL}/getCodingNotes`).then(res => res.json())
        ]);

        renderList('notes-container', notes, n => `
            <h4>User: ${n.user}</h4>
            <p>${n.content}</p>
            <small>${formatDate(n.created_at)}</small>
        `);

        renderList('tasks-container', tasks, t => `
            <span class="status-badge">${t.status}</span>
            <h4>${t.title}</h4>
            <p>${t.description}</p>
            <small>Assigned to: ${t.user} • ${formatDate(t.created_at)}</small>
        `);

        renderList('study-container', study, s => `
            <h4>Topic: ${s.topic || 'General'}</h4>
            <p>${s.details || s.content || ''}</p>
            <small>${formatDate(s.created_at)}</small>
        `);

        renderList('coding-container', coding, c => `
            <p><code>${c.snippet || c.content || ''}</code></p>
            <p>${c.note || ''}</p>
            <small>${formatDate(c.created_at)}</small>
        `);
    } catch (err) {
        console.error("Failed to load data from BigQuery:", err);
    }
}

function renderList(id, items, template) {
    const el = document.getElementById(id);
    if (!items || !items.length) {
        el.innerHTML = '<p style="color: #999; font-style: italic;">No items found.</p>';
        return;
    }
    el.innerHTML = items.map(item => `<div class="card">${template(item)}</div>`).join('');
}

function formatDate(ts) {
    if (!ts) return '';
    const dateStr = ts.value || ts;
    return new Date(dateStr).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

window.onload = loadAllData;