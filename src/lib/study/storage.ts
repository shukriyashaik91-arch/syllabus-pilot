import { useCallback, useEffect, useState } from "react";
import { emptyState, type StudyState } from "./types";

const STORAGE_KEY = "study-planner:v1";
const EVENT = "study-planner:changed";

/** Read persisted state, tolerating corrupt or partial payloads. */
export function readState(): StudyState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<StudyState>;
    return {
      ...emptyState,
      ...parsed,
      availability: { ...emptyState.availability, ...(parsed.availability ?? {}) },
    };
  } catch {
    return emptyState;
  }
}

function writeState(next: StudyState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage may be full or blocked — state stays in memory for this session */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Shared local-first store. Every consumer re-renders when any consumer writes.
 * SSR-safe: starts empty and hydrates from localStorage after mount.
 */
export function useStudyState() {
  const [state, setState] = useState<StudyState>(emptyState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(readState());
    setHydrated(true);
    const sync = () => setState(readState());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((updater: (prev: StudyState) => StudyState) => {
    const next = updater(readState());
    writeState(next);
    setState(next);
  }, []);

  const reset = useCallback(() => {
    writeState(emptyState);
    setState(emptyState);
  }, []);

  return { state, update, reset, hydrated };
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
