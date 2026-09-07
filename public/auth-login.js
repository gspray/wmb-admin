'use strict';

(function () {
    const __WMB__ = window.__WMB__ || {};
    const BASE = __WMB__.basePath || '';
    const TOKEN_KEY = 'wmb-admin-token';
    const EMAIL_KEY = 'wmb-signin-email';
    const VALIDATE_TOKEN_KEY = TOKEN_KEY;
    const mode = document.body.dataset.loginMode || 'admin';
    const auth = firebase.auth();
    const productHome = mode === 'admin' ? '/admin' : '/pet';

    function $(id) { return document.getElementById(id); }
    function productJoinPath() {
        return `${productHome}/join`;
    }
    function productAppUrl() {
        return `${BASE}${productHome}`;
    }
    function showLoginUi() {
        const checking = $('login-checking') || $('state-checking');
        const ui = $('login-ui') || $('state-form');
        if (checking) checking.style.display = 'none';
        if (ui) ui.style.display = '';
    }
    function setError(message) { $('login-error').textContent = message || ''; }
    function authErrorMessage(err) {
        const code = String(err?.code || '').toLowerCase();
        const message = String(err?.message || '').trim();
        if (code.includes('too-many-requests')) {
            return 'Too many attempts. Please wait a few minutes and try again.';
        }
        return message || 'Sign-in failed. Please try again.';
    }
    function isEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()); }
    function code() {
        return Array.from(document.querySelectorAll('[data-otp-digit]')).map(input => input.value.trim()).join('');
    }
    function clearCode() { document.querySelectorAll('[data-otp-digit]').forEach(input => { input.value = ''; }); }
    function showVerify(show) {
        $('verify-wrap').hidden = !show;
        if (!show) clearCode();
    }
    function setBusy(busy) {
        const sendBtn = $('btn-send');
        if (sendBtn) sendBtn.disabled = busy;
        document.querySelectorAll('[data-otp-digit]').forEach((input) => {
            input.disabled = busy;
        });
    }
    function rememberToken(token, identifier) {
        localStorage.setItem(TOKEN_KEY, token);
        if (identifier && identifier.includes('@')) localStorage.setItem(EMAIL_KEY, identifier);
    }
    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    function isAdminReturnPath(returnPath) {
        if (!returnPath) return false;
        try {
            const url = new URL(returnPath, window.location.origin);
            const path = url.pathname || '/';
            return path === '/admin' || path.startsWith('/admin/');
        } catch (_) {
            return false;
        }
    }
    async function fetchAuthRole(token) {
        const roleRes = await fetch(`${BASE}/api/auth/role`, { headers: { Authorization: `Bearer ${token}` } });
        const roleData = await roleRes.json().catch(() => ({}));
        return { ok: roleRes.ok, role: roleData.role || null };
    }
    /** Resolve role with one retry when the first lookup fails or returns no role. */
    async function resolveAuthRoleWithRetry(token) {
        let result = await fetchAuthRole(token);
        if (result.ok && result.role) return result;
        await sleep(400);
        try {
            const user = auth.currentUser;
            const refreshed = user ? await user.getIdToken(true) : token;
            if (refreshed) rememberToken(refreshed, auth.currentUser?.email || '');
            result = await fetchAuthRole(refreshed || token);
        } catch (_) {
            /* keep first result */
        }
        return result;
    }
    async function finishRedirect() {
        const user = auth.currentUser;
        if (!user) throw new Error('Sign-in did not complete.');
        const token = await user.getIdToken(true);
        rememberToken(token, user.email || '');
        const params = new URLSearchParams(window.location.search);
        const returnPath = resolveLoginReturnPath(params.get('return'));
        // Admins land on Admin Books first from either local login surface.
        const { role } = await resolveAuthRoleWithRetry(token);
        if (role === 'admin') {
            const adminDest = isAdminReturnPath(returnPath) ? returnPath : `${BASE}/admin`;
            window.location.replace(adminDest);
            return;
        }
        // Admin login page must never fall through into Call / author product.
        if (mode === 'admin') {
            showLoginUi();
            setError('Admin access required. This account is not an admin.');
            $('login-status').textContent = '';
            setBusy(false);
            return;
        }
        // Pet: prefer Open Book chooser. Honor return only for select or an
        // explicit book identity (?preview= / ?project= / ?dev_project=).
        const openBookUrl = petOpenBookUrl();
        if (returnPath && isPetChooserReturnPath(returnPath)) {
            window.location.replace(ensureChooserForceParam(returnPath));
            return;
        }
        if (returnPath && petReturnHasBookIdentity(returnPath)) {
            window.location.replace(returnPath);
            return;
        }
        window.location.replace(openBookUrl);
    }

    function petOpenBookUrl() {
        const path = `${BASE}/pet/select`.replace(/\/{2,}/g, '/');
        return path.startsWith('/') ? path : `/${path}`;
    }

    function isPetChooserReturnPath(returnPath) {
        if (!returnPath) return false;
        try {
            const url = new URL(returnPath, window.location.origin);
            const path = String(url.pathname || '').replace(/\/+$/, '') || '/';
            return path === '/pet/select' || path.endsWith('/pet/select');
        } catch (_) {
            return false;
        }
    }

    function petReturnHasBookIdentity(returnPath) {
        if (!returnPath) return false;
        try {
            const url = new URL(returnPath, window.location.origin);
            const path = String(url.pathname || '');
            if (/\/pet\/new\/?$/i.test(path)) return true;
            if (/\/pet\/preview\/[^/]+/i.test(path)) return true;
            if (/\/pet\/[^/]+\/?$/i.test(path)
                && !/\/pet\/(login|select|join|new|preview)\/?$/i.test(path)) {
                return true;
            }
            if (String(url.searchParams.get('start') || '').trim() === '1') return true;
            return Boolean(
                String(url.searchParams.get('project') || '').trim()
                || String(url.searchParams.get('preview') || '').trim()
                || String(url.searchParams.get('dev_project') || '').trim(),
            );
        } catch (_) {
            return false;
        }
    }

    function ensureChooserForceParam(returnPath) {
        try {
            const url = new URL(returnPath, window.location.origin);
            url.searchParams.delete('closed');
            url.searchParams.delete('choose');
            try { sessionStorage.setItem('wmb-chooser-flash', 'closed'); } catch (_) { /* ignore */ }
            return `${url.pathname}${url.search}${url.hash}`;
        } catch (_) {
            return petOpenBookUrl();
        }
    }

    /** Keep in sync with platform/client/nav-return.js */
    function resolveLoginReturnPath(raw) {
        const decoded = decodeURIComponent(String(raw || '').trim());
        if (!decoded) return null;
        try {
            const url = new URL(decoded, window.location.origin);
            if (url.origin !== window.location.origin) return null;
            const path = url.pathname || '/';
            const allowed = path === '/pet' || path.startsWith('/pet/')
                || path === '/admin' || path.startsWith('/admin/')
                || path === '/';
            if (!allowed) return null;
            if (/\/login(?:\/|$|\?)/i.test(`${path}${url.search}`)) return null;
            return `${path}${url.search}${url.hash}`;
        } catch (_) {
            return null;
        }
    }

    function buildLoginUrlWithReturnPath(loginPath, returnHref) {
        const resolved = resolveLoginReturnPath(returnHref);
        if (!resolved) return loginPath;
        try {
            const url = new URL(loginPath, window.location.origin);
            url.searchParams.set('return', resolved);
            return `${url.pathname}${url.search}`;
        } catch (_) {
            return loginPath;
        }
    }

    function currentLoginReturnHref() {
        try {
            const url = new URL(window.location.href);
            url.searchParams.delete('admin_token');
            url.searchParams.delete('return');
            return `${url.pathname}${url.search}${url.hash}`;
        } catch (_) {
            return '';
        }
    }

    async function restoreStoredSession() {
        const token = localStorage.getItem(VALIDATE_TOKEN_KEY);
        if (!token) return false;
        try {
            const meRes = await fetch(`${BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
            if (!meRes.ok) return false;
            const { ok, role } = await resolveAuthRoleWithRetry(token);
            if (!ok || role !== 'admin') return false;
            const params = new URLSearchParams(window.location.search);
            const returnPath = resolveLoginReturnPath(params.get('return'));
            const adminDest = isAdminReturnPath(returnPath) ? returnPath : `${BASE}/admin`;
            window.location.replace(adminDest);
            return true;
        } catch (_) {
            return false;
        }
    }

    async function checkAuthorInvite(identifier) {
        if (mode !== 'author') return { ok: true };
        const email = isEmail(identifier) ? identifier : '';
        if (!email) return { ok: false, message: 'Enter a valid email address.' };
        const qs = `email=${encodeURIComponent(email)}`;
        const res = await fetch(`${BASE}/api/auth/author-invite-status?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, message: data.error || 'Could not verify that contact.' };
        return { ok: true };
    }

    async function checkAdminAllowed(identifier) {
        if (mode !== 'admin') return { ok: true };
        const email = isEmail(identifier) ? identifier : '';
        if (!email) return { ok: false, message: 'Enter a valid email address.' };
        const qs = `email=${encodeURIComponent(email)}`;
        const res = await fetch(`${BASE}/api/auth/admin-contact-status?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, message: data.error || 'Could not verify that contact.' };
        return { ok: true };
    }

    async function send() {
        const identifier = $('login-identifier').value.trim();
        setError('');
        if (!identifier) { setError('Enter your email address.'); return; }
        if (!isEmail(identifier)) { setError('Enter a valid email address.'); return; }
        const inviteCheck = await checkAuthorInvite(identifier);
        if (!inviteCheck.ok) {
            setError(`${inviteCheck.message} Please contact your administrator.`);
            return;
        }
        const adminCheck = await checkAdminAllowed(identifier);
        if (!adminCheck.ok) {
            setError(`${adminCheck.message} Please contact your administrator.`);
            return;
        }

        setBusy(true);
        $('login-status').textContent = 'Sending verification…';
        try {
            const res = await fetch(`${BASE}/api/auth/email/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: identifier,
                    returnPath: mode === 'author' ? productJoinPath() : '/join',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                const localHost = ['localhost', '127.0.0.1'].includes(location.hostname);
                const smtpLocal = data.code === 'smtp_unavailable_local'
                    || (localHost && /local development|smtp/i.test(String(data.error || '')));
                if (smtpLocal) {
                    $('login-status').textContent = '';
                    setError(data.error || 'Email OTP is unavailable locally. Use Local development below.');
                    $('dev-local-entry')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    return;
                }
                throw new Error(data.error || 'Unable to send verification email.');
            }
            localStorage.setItem(EMAIL_KEY, identifier);
            $('login-status').textContent = 'Email sent. Use the 6-digit code or click the magic link in your inbox.';
            showVerify(true);
            document.querySelector('[data-otp-digit]')?.focus();
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    async function verify() {
        const otp = code();
        if (!/^\d{6}$/.test(otp)) { setError('Enter the 6-digit verification code.'); return; }
        setBusy(true);
        setError('');
        $('login-status').textContent = 'Verifying…';
        try {
            const email = localStorage.getItem(EMAIL_KEY) || '';
            const res = await fetch(`${BASE}/api/auth/email/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    code: otp,
                    product: mode === 'admin' ? 'admin' : 'pet',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.customToken) throw new Error(data.error || 'Code verification failed.');
            await auth.signInWithCustomToken(data.customToken);
            await finishRedirect();
        } catch (err) {
            setError(authErrorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    document.querySelectorAll('[data-otp-digit]').forEach((input, index, inputs) => {
        input.addEventListener('input', () => {
            input.value = String(input.value || '').replace(/\D/g, '').slice(-1);
            if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
            if (code().length === 6) verify();
        });
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
        });
        input.addEventListener('paste', (event) => {
            event.preventDefault();
            const pasted = String(event.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
            inputs.forEach((otpInput, otpIndex) => { otpInput.value = pasted[otpIndex] || ''; });
            if (pasted.length === 6) verify();
        });
    });

    $('signin-form')?.addEventListener('submit', (event) => { event.preventDefault(); send(); });
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('email') || '';
    if (prefill && $('login-identifier')) $('login-identifier').value = prefill;

    async function setupDevLocalEntry() {
        const panel = $('dev-local-entry');
        if (!panel || mode !== 'author') return;
        const hostOk = ['localhost', '127.0.0.1'].includes(location.hostname);
        const envOk = Boolean(__WMB__.devLocalAuth) || String(__WMB__.env || '') !== 'production';
        if (!hostOk || !envOk) return;

        panel.hidden = false;
        const select = $('dev-project-select');
        const enterBtn = $('btn-dev-enter');
        const ensureBtn = $('btn-dev-ensure');
        const hint = $('dev-local-hint');
        const setHint = (text) => { if (hint) hint.textContent = text || ''; };
        const copy = panel.querySelector('.dev-local-entry-copy');
        const productId = 'write_my_pet_book';
        if (copy) copy.textContent = 'On localhost, use this instead of email OTP. Pick a pet book and continue.';

        const enterWithProject = (projectId, step) => {
            const id = String(projectId || '').trim();
            if (!id) return;
            try { sessionStorage.setItem('wmb-dev-entry', '1'); } catch (_) { /* ignore */ }
            if (step) {
                try { localStorage.setItem(`wmb-author-step-${id}`, String(step)); } catch (_) { /* ignore */ }
            }
            try { sessionStorage.setItem('wmb-force-desktop', '1'); } catch (_) { /* ignore */ }
            const isPreviewReturn = (() => {
                const returnParam = params.get('return');
                if (!returnParam) return false;
                try {
                    const ret = new URL(returnParam, window.location.origin);
                    if (String(ret.searchParams.get('preview') || '').trim() === id) return true;
                    return /\/pet\/preview\//i.test(ret.pathname || '');
                } catch (_) {
                    return false;
                }
            })();
            const path = isPreviewReturn
                ? `${productHome}/preview/${encodeURIComponent(id)}`
                : `${productHome}/${encodeURIComponent(id)}`;
            window.location.replace(`${BASE}${path}`.replace(/\/{2,}/g, '/'));
        };

        const enterNewPetBook = () => {
            try { sessionStorage.setItem('wmb-dev-entry', '1'); } catch (_) { /* ignore */ }
            try { localStorage.removeItem('wmb-pet-project-id'); } catch (_) { /* ignore */ }
            window.location.replace(`${BASE}/pet/new`.replace(/\/{2,}/g, '/'));
        };

        enterBtn?.addEventListener('click', () => {
            enterWithProject(select?.value, params.get('dev_step') || '');
        });

        ensureBtn?.addEventListener('click', async () => {
            enterNewPetBook();
        });

        try {
            const res = await fetch(`${BASE}/api/auth/dev-entry?product=${encodeURIComponent(productId)}`, {
                headers: { 'X-WMB-Product': productId },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.enabled) {
                panel.hidden = true;
                return;
            }
            const projects = Array.isArray(data.projects) ? data.projects : [];
            if (!select) return;
            select.innerHTML = '';
            if (!projects.length) {
                select.hidden = true;
                if (enterBtn) enterBtn.hidden = true;
                if (ensureBtn) {
                    ensureBtn.hidden = false;
                    ensureBtn.textContent = 'Start a new pet book';
                }
                setHint('No pet books yet. Start a new one without email OTP.');
                return;
            }
            if (ensureBtn) {
                ensureBtn.hidden = false;
                ensureBtn.textContent = 'Start a new pet book';
            }
            if (enterBtn) enterBtn.hidden = false;
            select.hidden = false;
            projects.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.id;
                const title = String(p.workingTitle || '').trim();
                const author = String(p.authorName || '').trim();
                const label = String(p.label || '').trim()
                    || (title && author && title !== author ? `${title} — ${author}` : '')
                    || title
                    || author
                    || 'Untitled project';
                opt.textContent = label;
                select.appendChild(opt);
            });
            if (data.defaultProjectId) select.value = data.defaultProjectId;
            setHint(`Or open directly: ${productHome}/<projectId> (sets local OTP-free session) · or start new: /pet/new`);
        } catch (_) {
            panel.hidden = true;
        }
    }

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            try { await finishRedirect(); } catch (_) {}
            return;
        }
        if (mode === 'admin') {
            const restored = await restoreStoredSession();
            if (restored) return;
        }
        showLoginUi();
        void setupDevLocalEntry();
        $('login-identifier')?.focus();
    });
}());
