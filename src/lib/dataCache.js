/**
 * Dual-Tier lightweight cache with TTL, sessionStorage persistence & invalidation support.
 * - Tier 1: In-memory JavaScript Map (0.01ms synchronous access)
 * - Tier 2: sessionStorage (persists across page reloads/F5, auto-purged on tab close)
 * 
 * Perfect for Stale-While-Revalidate (SWR) patterns and instant portal navigation.
 */

const RAM_CACHE = new Map();
const SESSION_PREFIX = 'sage_cache_';

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
