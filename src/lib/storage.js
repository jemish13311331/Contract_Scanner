// The ONLY things this app persists in localStorage: the auth token (identity),
// plus the in-progress draft and the selected contract type (pre-analysis UX so
// a refresh doesn't lose the user's work). Everything else — account,
// entitlement, report history — is authoritative on the server and fetched via
// the API using the token. See src/lib/api.js.

export const DRAFT_KEY = 'contract-scanner:draft';
export const TYPE_KEY = 'contract-scanner:type';
export const TOKEN_KEY = 'contract-scanner:token';

// Keys older builds wrote that we no longer use. Purged once on load so stale
// cached account/entitlement/history data doesn't linger in the browser.
export const LEGACY_KEYS = [
  'contract-scanner:history',
  'contract-scanner:account',
  'contract-scanner:entitlement',
  'contract-scanner:freeUsed',
];

// Read + JSON-parse a key, falling back on any error (private mode, bad JSON).
export const safeLoad = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

// Write a JSON value, or remove the key when the value is null/undefined/''.
// Storage failures (private mode) are swallowed — persistence is best-effort.
export const safeSave = (key, value) => {
  try {
    if (value === null || value === undefined || value === '') localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* non-fatal */
  }
};

// One-time cleanup of legacy keys. Safe to call on every mount.
export const purgeLegacyStorage = () => {
  try {
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* non-fatal */
  }
};
