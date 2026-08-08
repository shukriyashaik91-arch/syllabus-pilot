import type { PlanSession, StudyState, Subject, Topic } from "./types";

/**
 * Unit-level view of the syllabus.
 *
 * Topics always belong to a unit, and both the planner and the progress UI
 * work unit-first: one unit is finished before the next one starts.
 */

export interface StudyUnit {
  /** `${subjectId}|${unit}` */
  key: string;
  subjectId: string;
  /** e.g. "Unit 1" */
  number: string;
  /** e.g. "Introduction to Cloud Computing" */
  title: string;
  /** e.g. "Unit 1: Introduction to Cloud Computing" */
  label: string;
  order: number;
  topics: Topic[];
}

export function unitKeyOf(topic: Topic): string {
  return `${topic.subjectId}|${topic.unit}`;
}

export function unitLabel(numberLabel: string | undefined, title: string): string {
  const n = (numberLabel ?? "").trim();
  if (!n) return title;
  return n.toLowerCase().startsWith(title.toLowerCase()) ? n : `${n}: ${title}`;
}

/** Groups topics into units, preserving the order they appear in the syllabus. */
export function groupUnits(topics: Topic[], subjectId?: string): StudyUnit[] {
  const map = new Map<string, StudyUnit>();
  let seen = 0;

  for (const topic of topics) {
    if (subjectId && topic.subjectId !== subjectId) continue;
    const key = unitKeyOf(topic);
    let unit = map.get(key);
    if (!unit) {
      seen += 1;
      unit = {
        key,
        subjectId: topic.subjectId,
        number: topic.unitNumber ?? "",
        title: topic.unit,
        label: unitLabel(topic.unitNumber, topic.unit),
        order: topic.unitOrder ?? seen,
        topics: [],
      };
      map.set(key, unit);
    }
    unit.topics.push(topic);
  }

  return [...map.values()].sort((a, b) => a.order - b.order);
}

/** Units of every subject, grouped per subject and kept in syllabus order. */
export function unitsBySubject(
  subjects: Subject[],
  topics: Topic[],
): { subject: Subject; units: StudyUnit[] }[] {
  return subjects
    .map((subject) => ({ subject, units: groupUnits(topics, subject.id) }))
    .filter((entry) => entry.units.length > 0);
}

export function unitProgress(unit: StudyUnit): number {
  if (unit.topics.length === 0) return 0;
  const done = unit.topics.filter((t) => t.status === "done").length;
  return Math.round((done / unit.topics.length) * 100);
}

/** Marks every topic (and scheduled block) of a unit done or pending. */
export function setUnitCompletion(
  state: StudyState,
  key: string,
  done: boolean,
): StudyState {
  const topicIds = new Set(
    state.topics.filter((t) => unitKeyOf(t) === key).map((t) => t.id),
  );

  const topics = state.topics.map((t) =>
    topicIds.has(t.id) ? { ...t, status: done ? ("done" as const) : ("pending" as const) } : t,
  );

  const plan: PlanSession[] = state.plan.map((s) =>
    s.unitKey === key || (s.topicId && topicIds.has(s.topicId)) ? { ...s, done } : s,
  );

  const touched = plan.filter((s) => (s.unitKey === key || (s.topicId && topicIds.has(s.topicId))));
  const activeDays = done
    ? Array.from(new Set([...state.activeDays, ...touched.map((s) => s.date)]))
    : state.activeDays.filter((d) => plan.some((s) => s.date === d && s.done));

  return { ...state, topics, plan, activeDays };
}

/** Marks a single topic done or pending, syncing its scheduled blocks. */
export function setTopicCompletion(
  state: StudyState,
  topicId: string,
  done: boolean,
): StudyState {
  const topics = state.topics.map((t) =>
    t.id === topicId ? { ...t, status: done ? ("done" as const) : ("pending" as const) } : t,
  );
  const plan = state.plan.map((s) => (s.topicId === topicId ? { ...s, done } : s));
  const activeDays = done
    ? Array.from(
        new Set([...state.activeDays, ...plan.filter((s) => s.topicId === topicId).map((s) => s.date)]),
      )
    : state.activeDays.filter((d) => plan.some((s) => s.date === d && s.done));

  return { ...state, topics, plan, activeDays };
}
