// Where the dock sits and how much room it takes. Tiny external stores: screens re-render only when
// these numbers change, never on caption updates.
import { useSyncExternalStore } from "react";

function store(initial: number) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set(h: number) {
      if (Math.abs(h - value) < 1) return;
      value = h;
      for (const l of listeners) l();
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get: () => value,
  };
}

/** The tab bar reports its measured height, so the dock sits just above it on tab screens. */
const tabBar = store(0);
export const setTabBarHeight = tabBar.set;
export function useTabBarHeight(): number {
  return useSyncExternalStore(tabBar.subscribe, tabBar.get, tabBar.get);
}

/** Space the dock takes over content, so the end of a scrolled page is never hidden under it. */
const dock = store(0);
export const setDockSpace = dock.set;
export function useDockSpace(): number {
  return useSyncExternalStore(dock.subscribe, dock.get, dock.get);
}
