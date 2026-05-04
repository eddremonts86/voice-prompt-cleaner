import '@testing-library/jest-dom';

// Vitest 4 ships an empty `localStorage` stub when `--localstorage-file` is
// not configured, which shadows jsdom's implementation. Install a minimal
// in-memory Storage so anything that touches localStorage in tests works.
if (typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  });
}
