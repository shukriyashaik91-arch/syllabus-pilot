import { uid } from "./storage";
import { groupUnits, unitKeyOf } from "./units";

import type {
  Availability,
  Exam,
  Milestone,
  PlanSession,
  StudyState,
  Subject,
  Topic,
} from "./types";

export const DAY_MS = 86400000;

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  return Math.round(
    (parseISODate(toISOStr).getTime() - parseISODate(fromISO).getTime()) / DAY_MS,
  );
}

export function formatDayLabel(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  if (daysBetween(today, iso) === 1) return "Tomorrow";
  return parseISODate(iso).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

const DIFFICULTY_WEIGHT = { easy: 0.85, medium: 1, hard: 1.25 } as const;
const INTENSITY_FACTOR = { relaxed: 0.75, balanced: 1, intense: 1.3 } as const;

const START_HOUR = { morning: 6, afternoon: 13, evening: 17, night: 20 } as const;

/**
 * Rule-based prioritisation.
 *
 * A topic scores higher when its exam is close, the exam is heavy/important,
 * the topic itself is hard, and the subject was flagged as weak.
 */
function topicScore(
  topic: Topic,
  exam: Exam | undefined,
  availability: Availability,
  fromISO: string,
): number {
  let score = 10;

  if (exam) {
    const daysLeft = Math.max(1, daysBetween(fromISO, exam.date));
    score += (30 / daysLeft) * 4; // urgency
    score += exam.priority * 3;
    score += exam.weightage / 5;
    score *= DIFFICULTY_WEIGHT[exam.difficulty];
  }

  score *= DIFFICULTY_WEIGHT[topic.difficulty];
  if (availability.weakSubjectIds.includes(topic.subjectId)) score *= 1.35;
  if (topic.status === "in_progress") score *= 1.15;

  return score;
}

function capacityFor(date: Date, availability: Availability): number {
  const day = date.getDay();
  const studyDays = availability.studyDays ?? [0, 1, 2, 3, 4, 5, 6];
  if (!studyDays.includes(day)) return 0;
  const isWeekend = day === 0 || day === 6;
  const base = isWeekend ? availability.weekendHoursPerDay : availability.hoursPerDay;
  return (
    Math.round(base * (INTENSITY_FACTOR[availability.intensity ?? "balanced"] ?? 1) * 2) / 2
  );
}

export interface PlanOptions {
  /** How many days ahead to plan when there is no exam to anchor to. */
  horizonDays?: number;
  /**
   * Unit keys the student picked. `null`/omitted plans the whole syllabus.
   */
  unitKeys?: string[] | null;
  /**
   * Topic ids the student picked on the review page. `null`/omitted plans
   * every topic of the selected units.
   */
  topicIds?: string[] | null;
}

/** A single schedulable piece of work inside a unit. */
interface WorkItem {
  kind: PlanSession["kind"];
  topic: Topic | null;
  title: string;
  remaining: number;
  unitKey: string;
  unitLabel: string;
  subjectId: string;
}

/** All of a subject's units, flattened into the exact order they must be done. */
interface SubjectQueue {
  subjectId: string;
  score: number;
  items: WorkItem[];
  cursor: number;
}

export interface PlanResult {
  sessions: PlanSession[];
  milestones: Milestone[];
}

/**
 * Generates a day-by-day, unit-by-unit timetable.
 *
 * Strategy:
 *  1. Group each subject's pending topics into units, in syllabus order.
 *  2. Score subjects (urgency x importance x difficulty x weakness) to decide
 *     which subject gets the next block — but within a subject the units are
 *     always worked through in order: a unit is finished before the next begins.
 *  3. Every unit ends with a revision block and a practice-questions block.
 *  4. Reserve the two days before each exam for revision + a mock test.
 *  5. Leave one light buffer day per fortnight to absorb slippage.
 */
export function generatePlan(state: StudyState, options: PlanOptions = {}): PlanResult {
  const { subjects, topics, exams, availability } = state;
  const start = todayISO();
  const horizon = options.horizonDays ?? 21;

  const selection = options.unitKeys ? new Set(options.unitKeys) : null;
  const picked = options.topicIds ? new Set(options.topicIds) : null;
  const selected = topics.filter(
    (t) => (!selection || selection.has(unitKeyOf(t))) && (!picked || picked.has(t.id)),
  );
  if (selected.length === 0 || subjects.length === 0) return { sessions: [], milestones: [] };

  // Hours already spent learning each topic in the current plan — a regenerated
  // timetable must never re-teach work the student has already ticked off.
  const learnedHours = new Map<string, number>();
  for (const s of state.plan) {
    if (!s.topicId || s.kind !== "study" || !s.done) continue;
    learnedHours.set(s.topicId, (learnedHours.get(s.topicId) ?? 0) + s.hours);
  }

  const examBySubject = new Map<string, Exam>();
  for (const exam of [...exams].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!examBySubject.has(exam.subjectId)) examBySubject.set(exam.subjectId, exam);
  }

  const lastExam = exams.reduce<string | null>(
    (acc, e) => (acc === null || e.date > acc ? e.date : acc),
    null,
  );
  const totalDays = Math.max(
    7,
    Math.min(180, lastExam ? daysBetween(start, lastExam) + 1 : horizon),
  );

  // Unit-ordered work queues, one per subject.
  const queues: SubjectQueue[] = [];
  for (const subject of subjects) {
    const subjectTopics = selected.filter((t) => t.subjectId === subject.id);
    if (subjectTopics.length === 0) continue;

    const items: WorkItem[] = [];
    for (const unit of groupUnits(subjectTopics, subject.id)) {
      const learnItems: WorkItem[] = [];
      const reviewItems: WorkItem[] = [];

      for (const topic of unit.topics) {
        const spent = learnedHours.get(topic.id) ?? 0;
        const left = Math.round((topic.estimatedHours - spent) * 10) / 10;
        const finished = topic.status === "done";

        if (!finished && left >= 0.5) {
          // Never learned (or only partly learned) — schedule the remaining hours once.
          learnItems.push({
            kind: "study",
            topic,
            title: topic.name,
            remaining: left,
            unitKey: unit.key,
            unitLabel: unit.label,
            subjectId: subject.id,
          });
          continue;
        }

        // Already learned or completed: it comes back only as revision/practice.
        reviewItems.push({
          kind: "revision",
          topic,
          title: `Revision — ${topic.name}`,
          remaining: Math.min(1, Math.max(0.5, Math.round(topic.estimatedHours * 0.3 * 2) / 2)),
          unitKey: unit.key,
          unitLabel: unit.label,
          subjectId: subject.id,
        });
        reviewItems.push({
          kind: "practice",
          topic,
          title: `Practice — ${topic.name}`,
          remaining: 0.5,
          unitKey: unit.key,
          unitLabel: unit.label,
          subjectId: subject.id,
        });
      }

      items.push(...learnItems, ...reviewItems);

      if (learnItems.length > 0) {
        const unitHours = unit.topics.reduce((h, t) => h + t.estimatedHours, 0);
        items.push({
          kind: "revision",
          topic: null,
          title: `Revise ${unit.label}`,
          remaining: Math.min(2, Math.max(0.5, Math.round(unitHours * 0.3 * 2) / 2)),
          unitKey: unit.key,
          unitLabel: unit.label,
          subjectId: subject.id,
        });
        items.push({
          kind: "practice",
          topic: null,
          title: `Practice questions — ${unit.label}`,
          remaining: 1,
          unitKey: unit.key,
          unitLabel: unit.label,
          subjectId: subject.id,
        });
      }
    }

    if (items.length === 0) continue;

    queues.push({
      subjectId: subject.id,
      cursor: 0,
      items,
      score: Math.max(
        ...subjectTopics.map((t) =>
          topicScore(t, examBySubject.get(subject.id), availability, start),
        ),
      ),
    });
  }

  if (queues.length === 0) return { sessions: [], milestones: [] };

  const sessionCap = Math.min(
    4,
    Math.max(0.5, Math.round(((availability.sessionMinutes ?? 60) / 60) * 2) / 2),
  );


  const sessions: PlanSession[] = [];
  const examLockedDays = new Map<string, Exam>();

  const plannedSubjects = new Set(queues.map((q) => q.subjectId));
  for (const exam of exams) {
    if (!plannedSubjects.has(exam.subjectId)) continue;
    for (let offset = 1; offset <= 2; offset++) {
      const d = toISODate(new Date(parseISODate(exam.date).getTime() - offset * DAY_MS));
      if (d >= start) examLockedDays.set(d, exam);
    }
  }

  const remainingWork = () => queues.some((q) => q.cursor < q.items.length);

  for (let dayOffset = 0; dayOffset < totalDays; dayOffset++) {
    const date = new Date(parseISODate(start).getTime() + dayOffset * DAY_MS);
    const iso = toISODate(date);
    let capacity = capacityFor(date, availability);
    if (capacity <= 0) continue;

    const dayBlocks: PlanSession[] = [];
    const push = (s: PlanSession) => {
      dayBlocks.push(s);
      sessions.push(s);
    };

    // 1. Exam eve: revision + mock test for that subject.
    const lockedExam = examLockedDays.get(iso);
    if (lockedExam) {
      const revisionHours = Math.min(capacity, Math.max(1, capacity - 1));
      push(
        session(iso, lockedExam.subjectId, null, `Full revision — ${lockedExam.name}`, revisionHours, "revision"),
      );
      capacity -= revisionHours;
      if (capacity >= 1) {
        push(session(iso, lockedExam.subjectId, null, `Mock test — ${lockedExam.name}`, 1, "practice"));
        capacity -= 1;
      }
      assignTimes(dayBlocks, availability);
      continue;
    }

    // 2. A light buffer day every 14 days keeps the plan recoverable.
    const isBufferDay = dayOffset > 0 && dayOffset % 14 === 13;
    if (isBufferDay && remainingWork()) {
      push(
        session(
          iso,
          queues[0]?.subjectId ?? subjects[0]!.id,
          null,
          "Buffer day — catch up on anything you missed",
          Math.min(capacity, 2),
          "buffer",
        ),
      );
      assignTimes(dayBlocks, availability);
      continue;
    }

    // 3. Work through units in order, subject by subject.
    let guard = 0;
    while (capacity >= 0.5 && guard < 40) {
      guard++;
      const eligible = queues.filter((q) => {
        if (q.cursor >= q.items.length) return false;
        const exam = examBySubject.get(q.subjectId);
        return !(exam && iso >= exam.date);
      });
      if (eligible.length === 0) break;

      // Don't put the same topic in two back-to-back blocks when there is
      // something else to work on.
      const lastKey = dayBlocks.at(-1)?.topicId ?? dayBlocks.at(-1)?.title ?? null;
      const varied = eligible.filter((q) => {
        const next = q.items[q.cursor]!;
        return (next.topic?.id ?? next.title) !== lastKey;
      });
      const pool = varied.length > 0 ? varied : eligible;

      const queue = pool.reduce((best, q) => (q.score > best.score ? q : best), pool[0]!);
      const item = queue.items[queue.cursor]!;


      const chunk = Math.min(item.remaining, capacity, sessionCap);
      const block = session(iso, item.subjectId, item.topic?.id ?? null, item.title, chunk, item.kind);
      block.unitKey = item.unitKey;
      block.unitLabel = item.unitLabel;
      push(block);

      item.remaining = Math.round((item.remaining - chunk) * 10) / 10;
      capacity = Math.round((capacity - chunk) * 10) / 10;
      if (item.remaining <= 0) queue.cursor++;
    }

    assignTimes(dayBlocks, availability);
  }

  return { sessions, milestones: buildMilestones(sessions, subjects, exams) };
}


/** Lays blocks out back-to-back from the preferred start time, with breaks. */
function assignTimes(blocks: PlanSession[], availability: Availability) {
  let minutes = (START_HOUR[availability.preferredTime] ?? 17) * 60;
  for (const block of blocks) {
    block.startTime = `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    minutes += block.hours * 60 + (availability.breakMinutes || 0);
  }
}

function buildMilestones(
  sessions: PlanSession[],
  subjects: Subject[],
  exams: Exam[],
): Milestone[] {
  const milestones: Milestone[] = [];

  for (const subject of subjects) {
    const dates = sessions
      .filter((s) => s.subjectId === subject.id && s.kind === "study")
      .map((s) => s.date)
      .sort();
    if (dates.length === 0) continue;
    const halfway = dates[Math.floor(dates.length / 2)];
    const last = dates[dates.length - 1];
    if (halfway) {
      milestones.push({
        id: uid("ms"),
        label: `${subject.name}: half the syllabus covered`,
        date: halfway,
        subjectId: subject.id,
      });
    }
    if (last) {
      milestones.push({
        id: uid("ms"),
        label: `${subject.name}: first full pass complete`,
        date: last,
        subjectId: subject.id,
      });
    }
  }

  for (const exam of exams) {
    milestones.push({
      id: uid("ms"),
      label: `${exam.name} — exam day`,
      date: exam.date,
      subjectId: exam.subjectId,
    });
  }

  return milestones.sort((a, b) => a.date.localeCompare(b.date));
}

function session(
  date: string,
  subjectId: string,
  topicId: string | null,
  title: string,
  hours: number,
  kind: PlanSession["kind"],
): PlanSession {
  return { id: uid("ses"), date, subjectId, topicId, title, hours, kind, done: false };
}

export function subjectName(subjects: Subject[], id: string): string {
  return subjects.find((s) => s.id === id)?.name ?? "Unknown subject";
}

export function subjectColor(subjects: Subject[], id: string): string {
  const idx = subjects.find((s) => s.id === id)?.colorIndex ?? 1;
  return `var(--color-chart-${idx})`;
}

/** Consecutive days (ending today or yesterday) with at least one completed session. */
export function computeStreak(activeDays: string[]): number {
  if (activeDays.length === 0) return 0;
  const set = new Set(activeDays);
  let streak = 0;
  const cursor = new Date();
  if (!set.has(toISODate(cursor))) cursor.setTime(cursor.getTime() - DAY_MS);
  while (set.has(toISODate(cursor))) {
    streak++;
    cursor.setTime(cursor.getTime() - DAY_MS);
  }
  return streak;
}

/**
 * Applies a session completion toggle across plan, topics and streak history.
 * Shared by every surface that can tick a block off.
 */
export function toggleSessionInState(state: StudyState, id: string): StudyState {
  const target = state.plan.find((s) => s.id === id);
  if (!target) return state;
  const done = !target.done;
  const plan = state.plan.map((s) => (s.id === id ? { ...s, done } : s));

  const topics = state.topics.map((t) => {
    if (!target.topicId || t.id !== target.topicId) return t;
    const blocks = plan.filter((s) => s.topicId === t.id && s.kind === "study");
    const allDone = blocks.length > 0 && blocks.every((s) => s.done);
    const anyDone = blocks.some((s) => s.done);
    return { ...t, status: allDone ? "done" : anyDone ? "in_progress" : "pending" } as Topic;
  });

  const activeDays = done
    ? Array.from(new Set([...state.activeDays, target.date]))
    : state.activeDays.filter(
        (d) => d !== target.date || plan.some((s) => s.date === d && s.done),
      );

  return { ...state, plan, topics, activeDays };
}
