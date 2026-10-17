/**
 * Dual-Tier lightweight cache with TTL, sessionStorage persistence & invalidation support.
 * - Tier 1: In-memory JavaScript Map (0.01ms synchronous access)
 * - Tier 2: sessionStorage (persists across page reloads/F5, auto-purged on tab close)
 * 
 * Perfect for Stale-While-Revalidate (SWR) patterns and instant portal navigation.
 */

const RAM_CACHE = new Map();

// The prefix carries the build ID so cached entries cannot outlive the code that wrote
// them. sessionStorage survives a deploy inside an open tab, so without this a new build
// could read an object written in an older shape — a crash that only reproduces for
// people who never closed their tab.
const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';
const SESSION_PREFIX = `sage_cache_${BUILD_ID}_`;
const LEGACY_SESSION_PREFIX = 'sage_cache_';

/**
 * Drop entries written by earlier builds. They can never be read again now that the
 * prefix has changed, so leaving them would just consume the storage quota.
 */
function purgeStaleBuildCaches() {
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    const stale = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(LEGACY_SESSION_PREFIX) && !key.startsWith(SESSION_PREFIX)) {
        stale.push(key);
      }
    }
    stale.forEach((key) => storage.removeItem(key));
  } catch {
    // Storage unavailable; nothing to clean up.
  }
}

/**
 * Safely access sessionStorage without crashing in restricted environments
 */
function getSessionStorage() {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Access denied or disabled (e.g. strict privacy mode)
  }
  return null;
}

// Runs once when the module loads, which is before any page reads the cache.
purgeStaleBuildCaches();

/**
 * Get cached item if present in RAM or sessionStorage and within TTL.
 * @param {string} key 
 * @param {number} ttlMs Default 2 minutes (120,000 ms)
 * @returns {any|null}
 */
export function getCachedData(key, ttlMs = 120000) {
  const now = Date.now();

  // 1. Check RAM Cache (Tier 1)
  if (RAM_CACHE.has(key)) {
    const entry = RAM_CACHE.get(key);
    if (now - entry.timestamp <= ttlMs) {
      return entry.data;
    }
    RAM_CACHE.delete(key);
  }

  // 2. Check sessionStorage (Tier 2)
  const storage = getSessionStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;

    const entry = JSON.parse(raw);
    if (entry && typeof entry.timestamp === 'number') {
      if (now - entry.timestamp <= ttlMs) {
        // Hydrate RAM cache for subsequent instant hits
        RAM_CACHE.set(key, entry);
        return entry.data;
      }
      // Expired entry
      storage.removeItem(SESSION_PREFIX + key);
    }
  } catch (err) {
    console.warn(`[dataCache] Error reading key "${key}" from sessionStorage:`, err);
  }

  return null;
}

/**
 * Set item in cache with current timestamp (RAM + sessionStorage).
 * @param {string} key 
 * @param {any} data 
 * @param {boolean} persistToSession Default true
 */
export function setCachedData(key, data, persistToSession = true) {
  const entry = {
    data,
    timestamp: Date.now()
  };

  // 1. Write to RAM
  RAM_CACHE.set(key, entry);

  // 2. Write to sessionStorage if requested
  if (persistToSession) {
    const storage = getSessionStorage();
    if (storage) {
      try {
        storage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
      } catch {
        // Quota exceeded or private browsing restriction - silently fallback to RAM-only
      }
    }
  }
}

/**
 * Invalidate cache by exact key or prefix across both RAM and sessionStorage.
 * If keyOrPrefix is empty or undefined, clears all SAGE cache.
 * @param {string} [keyOrPrefix] 
 */
export function invalidateCache(keyOrPrefix) {
  // 1. Invalidate RAM
  if (!keyOrPrefix) {
    RAM_CACHE.clear();
  } else {
    for (const key of RAM_CACHE.keys()) {
      if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
        RAM_CACHE.delete(key);
      }
    }
  }

  // 2. Invalidate sessionStorage
  const storage = getSessionStorage();
  if (!storage) return;

  try {
    if (!keyOrPrefix) {
      const keysToRemove = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && k.startsWith(SESSION_PREFIX)) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => storage.removeItem(k));
    } else {
      const targetPrefix = SESSION_PREFIX + keyOrPrefix;
      const keysToRemove = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (k === targetPrefix || k.startsWith(targetPrefix))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => storage.removeItem(k));
    }
  } catch (err) {
    console.warn('[dataCache] Error invalidating sessionStorage:', err);
  }
}

/**
 * Purge all cached data associated with a specific user ID.
 * @param {string} userId
 */
export function clearUserCache(userId) {
  if (!userId) return;
  invalidateCache(userId);
}

const WORKSPACE_PREFIX = 'sage_';
const ACTIVE_USER_KEY = 'sage_active_user';

function getLocalStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Access denied or disabled (e.g. strict privacy mode)
  }
  return null;
}

/**
 * Remove the signed-in user's working data from localStorage: score drafts,
 * attendance entries, cached activity configuration, consultations and AI replies.
 *
 * Several of those keys are scoped by class and student but not by the faculty who
 * typed them (`sage_scores_<class>_<student>`, `sage_att_status_<class>_<date>_<student>`),
 * so on a shared machine the next person to sign in would otherwise read the previous
 * user's drafts. Supabase keeps its session under an `sb-` prefix, which this never
 * matches, so signing out stays the concern of the auth client.
 */
export function clearLocalWorkspace({ keepUnsynced = false } = {}) {
  const storage = getLocalStorage();
  if (!storage) return;

  try {
    const keysToRemove = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(WORKSPACE_PREFIX) || key === ACTIVE_USER_KEY) continue;
      if (keepUnsynced && holdsUnsyncedWork(storage, key)) continue;
      keysToRemove.push(key);
    }
    keysToRemove.forEach(key => storage.removeItem(key));
  } catch (err) {
    console.warn('[dataCache] Could not clear the local workspace:', err);
  }
}

/**
 * True when an entry still holds edits Supabase never acknowledged. Set while a save is
 * in flight and cleared once the write succeeds, so a failed or offline save leaves it
 * standing. Sign-out keeps these; a different user signing in removes them anyway.
 */
function holdsUnsyncedWork(storage, key) {
  try {
    const parsed = JSON.parse(storage.getItem(key) || 'null');
    return Boolean(parsed && parsed.pendingSync === true);
  } catch {
    return false;
  }
}

/**
 * How many entries still hold work that never reached Supabase. Lets the UI warn before
 * an action that would discard them.
 */
export function countUnsyncedEntries() {
  const storage = getLocalStorage();
  if (!storage) return 0;

  let count = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith(WORKSPACE_PREFIX) && holdsUnsyncedWork(storage, key)) count += 1;
    }
  } catch {
    return count;
  }
  return count;
}

/**
 * Wipe the workspace when a different account signs in on this browser.
 *
 * Sign-out already clears it, but a session that ended by simply closing the tab leaves
 * localStorage intact — which is exactly how a shared QA or campus machine is used.
 * Returns true when a different user was detected and the workspace was cleared.
 */
export function syncActiveUser(userId) {
  const storage = getLocalStorage();
  if (!storage || !userId) return false;

  try {
    const previousUserId = storage.getItem(ACTIVE_USER_KEY);
    if (previousUserId && previousUserId !== userId) {
      clearLocalWorkspace();
      invalidateCache();
      storage.setItem(ACTIVE_USER_KEY, userId);
      return true;
    }
    if (!previousUserId) storage.setItem(ACTIVE_USER_KEY, userId);
  } catch (err) {
    console.warn('[dataCache] Could not record the active user:', err);
  }
  return false;
}
