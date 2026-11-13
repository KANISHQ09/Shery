// Demo identity: no login, but each browser gets its own anonymous visitor id so that
// visitors trying the demo at the same time keep separate chat histories.

const VISITOR_KEY = 'visitor_id';

function randomId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for older browsers / non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getVisitorId() {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = randomId();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): fall back to a per-page-load id
    if (!getVisitorId.memo) getVisitorId.memo = randomId();
    return getVisitorId.memo;
  }
}

export function getRole() {
  try {
    return localStorage.getItem('demo_role') || 'student';
  } catch {
    return 'student';
  }
}

const PASSCODE_KEY = 'demo_passcode';

/**
 * Team access: opening the site once with `?team=<passcode>` remembers the passcode in this
 * browser (needed to delete prepared demo lessons) and removes it from the address bar.
 * `?team=` with an empty value forgets it.
 */
export function captureTeamPasscodeFromUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('team')) return;
    const value = url.searchParams.get('team') || '';
    if (value) localStorage.setItem(PASSCODE_KEY, value);
    else localStorage.removeItem(PASSCODE_KEY);
    url.searchParams.delete('team');
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  } catch {
    // ignore: storage blocked or URL unavailable
  }
}

function getTeamPasscode() {
  try {
    return localStorage.getItem(PASSCODE_KEY) || '';
  } catch {
    return '';
  }
}

/** Headers every backend request carries. */
export function demoHeaders() {
  const headers = {
    'x-demo-role': getRole(),
    'x-visitor-id': getVisitorId(),
  };
  const passcode = getTeamPasscode();
  if (passcode) headers['x-demo-passcode'] = passcode;
  return headers;
}
