import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  defaultAvailability,
  defaultSettings,
  emptyState,
  type StudyState,
} from "./types";

const STORAGE_KEY = "study-planner:v1";
const EVENT = "study-planner:changed";

/** Read persisted state, tolerating corrupt or partial payloads. */
export function readState(): StudyState {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    return normalize(JSON.parse(raw) as Partial<StudyState>);
  } catch {
    return emptyState;
  }
}

function normalize(parsed: Partial<StudyState>): StudyState {
  return {
    ...emptyState,
    ...parsed,
    availability: { ...defaultAvailability, ...(parsed.availability ?? {}) },
    settings: {
      ...defaultSettings,
      ...(parsed.settings ?? {}),
      notifications: {
        ...defaultSettings.notifications,
        ...(parsed.settings?.notifications ?? {}),
      },
    },
    milestones: parsed.milestones ?? [],
    files: parsed.files ?? [],
    coachNotes: parsed.coachNotes ?? [],
  };
}

function writeState(next: StudyState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage may be full or blocked — state stays in memory for this session */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

function isEmpty(state: StudyState) {
  return state.subjects.length === 0 && state.topics.length === 0 && state.exams.length === 0;
}

/** Fetch the signed-in student's saved plan from the cloud. */
async function fetchCloud(userId: string): Promise<StudyState | null> {
  const { data, error } = await supabase
    .from("study_states")
    .select("state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data?.state) return null;
  const state = normalize(data.state as Partial<StudyState>);
  return isEmpty(state) ? null : state;
}

async function pushCloud(userId: string, state: StudyState) {
  await supabase
    .from("study_states")
    .upsert(
      { user_id: userId, state: state as unknown as never, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

/**
 * Shared store. Saves to this browser instantly and, when signed in, syncs the
 * same data to the account so it survives closing the tab or switching devices.
 */
export function useStudyState() {
  const [state, setState] = useState<StudyState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Pull the account's saved plan whenever the signed-in user changes.
  useEffect(() => {
    let cancelled = false;

    const load = async (userId: string | null) => {
      userIdRef.current = userId;
      if (!userId) return;
      setSyncing(true);
      const cloud = await fetchCloud(userId);
      if (cancelled) return;
      if (cloud) {
        writeState(cloud);
        setState(cloud);
      } else {
        const local = readState();
        if (!isEmpty(local)) await pushCloud(userId, local);
      }
      if (!cancelled) setSyncing(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      void load(session?.user.id ?? null);
    });
    supabase.auth.getSession().then(({ data }) => void load(data.session?.user.id ?? null));

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const persist = useCallback((next: StudyState) => {
    writeState(next);
    setState(next);
    const userId = userIdRef.current;
    if (!userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncing(true);
    saveTimer.current = setTimeout(() => {
      void pushCloud(userId, next).finally(() => setSyncing(false));
    }, 600);
  }, []);

  const update = useCallback(
    (updater: (prev: StudyState) => StudyState) => persist(updater(readState())),
    [persist],
  );

  const reset = useCallback(() => persist(emptyState), [persist]);

  return { state, update, reset, hydrated, syncing };
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
