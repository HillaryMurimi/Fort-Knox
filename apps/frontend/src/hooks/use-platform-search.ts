"use client";
import { useSyncExternalStore } from "react";
const subscribe = (change: () => void) => {
  window.addEventListener("popstate", change);
  return () => window.removeEventListener("popstate", change);
};
const snapshot = () => window.location.search;
const serverSnapshot = () => "";
export function usePlatformSearch() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
