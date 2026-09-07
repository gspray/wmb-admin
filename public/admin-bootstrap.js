'use strict';

const BASE = window.__WMB__?.basePath || '';

function api(path, opts = {}) {
    const headers = {
        Accept: 'application/json',
        ...(opts.headers || {}),
    };
    if (window.__WMB__?.env !== 'production' && !headers.Authorization) {
        headers['X-Dev-Admin'] = '1';
    }
    return fetch(`${BASE}${path}`, { ...opts, headers }).then(async (res) => {
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
            const err = new Error(data?.error || res.statusText);
            err.status = res.status;
            throw err;
        }
        return data;
    });
}

async function boot() {
    const status = document.getElementById('boot-status');
    const providersPanel = document.getElementById('providers-panel');
    const providersList = document.getElementById('providers-list');
    const projectsPanel = document.getElementById('projects-panel');
    const projectsSummary = document.getElementById('projects-summary');
    const projectsList = document.getElementById('projects-list');

    try {
        const bootPayload = await api('/api/admin/boot');
        status.textContent = `Signed in as ${bootPayload.access.role}${bootPayload.access.crossProduct ? ' (cross-product)' : ''}.`;
        status.className = 'ok';

        providersPanel.hidden = false;
        providersList.replaceChildren(...bootPayload.customerProducts.map((provider) => {
            const li = document.createElement('li');
            li.textContent = `${provider.label} → ${provider.providerBaseUrl || '(not configured)'}`;
            return li;
        }));

        const projectsPayload = await api('/api/admin/projects');
        projectsPanel.hidden = false;
        projectsSummary.textContent = `${projectsPayload.total} project(s) across authorized providers.`;
        projectsList.replaceChildren(...projectsPayload.items.slice(0, 20).map((project) => {
            const li = document.createElement('li');
            li.textContent = `[${project.productId}] ${project.workingTitle || project.authorName || project.id}`;
            return li;
        }));
    } catch (err) {
        status.textContent = err.message || 'Boot failed';
        status.className = 'error';
    }
}

boot();
