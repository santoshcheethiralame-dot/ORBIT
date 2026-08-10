// Must land before anything imports db.ts, which builds a Dexie instance at
// module scope.
import 'fake-indexeddb/auto';

// The planner reads settings straight off localStorage (day-start hour, smart
// planner toggle, focus duration). Node has none, so give it a real one —
// without it every read falls to a catch and silently uses defaults, which is
// not the code path the browser takes.
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}
if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage() });
}
if (typeof globalThis.sessionStorage === 'undefined') {
  Object.defineProperty(globalThis, 'sessionStorage', { value: new MemoryStorage() });
}
