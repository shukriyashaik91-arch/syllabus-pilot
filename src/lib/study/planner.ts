import { uid } from "./storage";
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
}

interface QueueItem {
  topic: Topic;
  remaining: number;
  score: number;
}

export interface PlanResult {
  sessions: PlanSession[];
  milestones: Milestone[];
}

/**
 * Generates a day-by-day timetable.
 *
 * Strategy:
 *  1. Score every pending topic (urgency x importance x difficulty x weakness).
 *  2. Walk forward day by day, filling each day's capacity with the highest
 *     scoring topics whose exam has not yet passed. Long topics are split into
 *     chunks of at most 2 focused hours, and hard blocks alternate with easier
 *     ones so a day never stacks three brutal topics in a row.
 *  3. Schedule a spaced revision block ~3 days after a topic is first studied.
 *  4. Reserve the two days before each exam for revision + a mock test.
 *  5. Leave one light buffer day per fortnight to absorb slippage.
 */
export function generatePlan(state: StudyState, options: PlanOptions = {}): PlanResult {
  const { subjects, topics, exams, availability } = state;
  const start = todayISO();
  const horizon = options.horizonDays ?? 21;

  const pending = topics.filter((t) => t.status !== "done");
  if (pending.length === 0 || subjects.length === 0) return { sessions: [], milestones: [] };

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

  // Remaining work per topic, highest priority first.
  const queue: QueueItem[] = pending
    .map((topic) => ({
      topic,
      remaining: topic.estimatedHours,
      score: topicScore(topic, examBySubject.get(topic.subjectId), availability, start),
    }))
    .sort((a, b) => b.score - a.score);

  const sessions: PlanSession[] = [];
  /** date -> revision blocks queued for that date */
  const revisionQueue = new Map<string, { topic: Topic }[]>();
  const examLockedDays = new Map<string, Exam>();

  for (const exam of exams) {
    for (let offset = 1; offset <= 2; offset++) {
      const d = toISODate(new Date(parseISODate(exam.date).getTime() - offset * DAY_MS));
      if (d >= start) examLockedDays.set(d, exam);
    }
  }

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
    if (isBufferDay) {
      push(
        session(
          iso,
          queue[0]?.topic.subjectId ?? subjects[0]!.id,
          null,
          "Buffer day — catch up on anything you missed",
          Math.min(capacity, 2),
          "buffer",
        ),
      );
      assignTimes(dayBlocks, availability);
      continue;
    }

    // 3. Spaced revision blocks that came due today.
    for (const item of revisionQueue.get(iso) ?? []) {
      if (capacity < 0.5) break;
      push(
        session(iso, item.topic.subjectId, item.topic.id, `Revise: ${item.topic.name}`, 0.5, "revision"),
      );
      capacity -= 0.5;
    }

    // 4. New study work, respecting exam deadlines and alternating difficulty.
    let lastWasHard: boolean = false;
    let guard = 0;
    while (capacity >= 0.5 && guard < 40) {
      guard++;
      const eligible: QueueItem[] = queue.filter((q) => {
        if (q.remaining <= 0) return false;
        const exam = examBySubject.get(q.topic.subjectId);
        return !(exam && iso >= exam.date);
      });
      if (eligible.length === 0) break;

      const preferred: QueueItem | undefined = lastWasHard
        ? eligible.find((q) => q.topic.difficulty !== "hard")
        : eligible.find((q) => q.topic.difficulty === "hard");
      const next: QueueItem = preferred ?? eligible[0]!;

      const chunk = Math.min(next.remaining, capacity, 2);
      push(session(iso, next.topic.subjectId, next.topic.id, next.topic.name, chunk, "study"));
      next.remaining -= chunk;
      capacity -= chunk;
      lastWasHard = next.topic.difficulty === "hard";

      if (next.remaining <= 0) {
        const revisionDate = toISODate(new Date(date.getTime() + 3 * DAY_MS));
        const bucket = revisionQueue.get(revisionDate) ?? [];
        bucket.push({ topic: next.topic });
        revisionQueue.set(revisionDate, bucket);
      }
    }

    // 5. Leftover time becomes a practice buffer.
    if (capacity >= 1 && queue.some((q) => q.remaining > 0)) {
      const first = queue.find((q) => q.remaining > 0);
      if (first) {
        push(
          session(iso, first.topic.subjectId, null, "Practice problems & active recall", Math.min(capacity, 1), "practice"),
        );
      }
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
