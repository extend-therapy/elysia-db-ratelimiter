import type { RateLimitStore } from './types';

let globalStore: RateLimitStore | null = null;

/**
 * Registers the current rate limit store in the global registry
 * Used by dbRateLimiter to make store accessible for testing
 */
export function setRateLimitStore(store: RateLimitStore): void {
  globalStore = store;
}

/**
 * Returns the currently registered rate limit store
 * Returns null if no store is registered
 */
export function getRateLimitStore(): RateLimitStore | null {
  return globalStore;
}

/**
 * Resets the rate limit store by clearing all data
 * Safe to call even if no store is registered (no-op)
 * Used in test lifecycle hooks to ensure clean state between tests
 */
export async function resetRateLimitStore(): Promise<void> {
  if (globalStore?.reset) {
    await globalStore.reset();
  }
}
