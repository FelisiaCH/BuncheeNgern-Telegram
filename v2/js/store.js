// Single state object + subscribe/notify. Per bcn-v2-system-design.md §7 point 1:
// "One state object, one render path. store.set(patch) mutates and notifies;
// screens re-render from state. No more values living in the DOM and in
// globals simultaneously."
//
// Deliberately minimal — no computed/derived state, no middleware. Screens
// (Phase 1+) read state via store.get() and re-render fully rather than
// tracking fine-grained diffs; that matches v1's actual render cost profile
// (measured this session: renderEntryList 0.18ms, buildTotals 0.01ms — full
// re-render is not the bottleneck, network is).
//
// Plain global, matching CLAUDE.md's standing constraint: plain <script src>
// only, no type="module", so this must be reachable without an import.
const store = (() => {
  let state = {};
  const subscribers = new Set();

  function get() {
    return state;
  }

  // Shallow-merges patch into state, then notifies every subscriber with the
  // full new state. Callers decide what to do with it — store has no opinion
  // on rendering.
  function set(patch) {
    state = { ...state, ...patch };
    subscribers.forEach(fn => fn(state));
  }

  // Returns an unsubscribe function.
  function subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  }

  return { get, set, subscribe };
})();
