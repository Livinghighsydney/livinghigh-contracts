import { useSyncExternalStore } from "react";
let version = 0;
const listeners = new Set<() => void>();
/** Tell every screen that resource data changed so it re-renders. */
export function changed() {
  version++;
  listeners.forEach((fn) => fn());
}
export function useResourceVersion() {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => version,
    () => 0,
  );
}
export function id() {
  return crypto.randomUUID();
}

/**
 * A cached, auto-refreshing copy of one backend resource.
 * Screens read it synchronously (like the original mock data); loads happen in the background.
 */
export function createCache<T>(load: () => Promise<T>, initial: T, maxAgeMs = 30_000) {
  let data = initial;
  let loaded = false;
  let error = "";
  let attemptAt = 0;
  let inflight: Promise<void> | null = null;

  function refresh(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve(); // never fetch during SSR
    if (inflight) return inflight;
    attemptAt = Date.now();
    inflight = load()
      .then((value) => {
        data = value;
        loaded = true;
        error = "";
      })
      .catch((e: unknown) => {
        error = e instanceof Error ? e.message : "Could not load data.";
      })
      .finally(() => {
        inflight = null;
        changed();
      });
    return inflight;
  }

  return {
    /** Current data; starts a background refresh when missing or stale. */
    read(): T {
      // First load right away; after that refresh when stale. After a failure, wait 10s before retrying.
      const wait = error ? 10_000 : loaded ? maxAgeMs : 0;
      if (typeof window !== "undefined" && !inflight && Date.now() - attemptAt >= wait) {
        queueMicrotask(() => void refresh());
      }
      return data;
    },
    refresh,
    /** Put fresh data from a server reply straight in (saves a reload request). */
    set(value: T) {
      data = value;
      loaded = true;
      error = "";
      attemptAt = Date.now();
      changed();
    },
    /** Forget everything (e.g. after sign-out) so the next user starts clean. */
    reset() {
      data = initial;
      loaded = false;
      error = "";
      attemptAt = 0;
      changed();
    },
    isLoaded: () => loaded,
    error: () => error,
  };
}

const noopSubscribe = () => () => {};
/** False during server render and hydration, true afterwards — use before reading browser-only data. */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
