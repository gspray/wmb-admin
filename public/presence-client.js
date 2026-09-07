'use strict';

(function initPresenceClient(global) {
    const HEARTBEAT_MS = 60 * 1000;
    let heartbeatTimer = null;
    let activeSurface = 'admin';
    let getAuthHeaders = null;

    async function sendPresenceHeartbeat() {
        if (document.visibilityState !== 'visible') return;
        if (typeof getAuthHeaders !== 'function') return;

        let headers;
        try {
            headers = await getAuthHeaders();
        } catch (_) {
            return;
        }
        if (!headers || !headers.Authorization) return;

        const base = String(global.__WMB__?.basePath || '');
        try {
            await fetch(`${base}/api/auth/presence`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers,
                },
                body: JSON.stringify({ surface: activeSurface }),
            });
        } catch (_) {
            // Presence is best-effort.
        }
    }

    function start(options = {}) {
        activeSurface = String(options.surface || 'admin').trim() || 'admin';
        getAuthHeaders = options.getAuthHeaders || null;

        if (heartbeatTimer) clearInterval(heartbeatTimer);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') sendPresenceHeartbeat();
        });
        sendPresenceHeartbeat();
        heartbeatTimer = setInterval(sendPresenceHeartbeat, HEARTBEAT_MS);
    }

    global.WmbPresence = { start };
})(window);
