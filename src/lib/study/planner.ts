import { uid } from "./storage";
import type {
  Availability,
  Exam,
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

const DIFFICULTY_WEIGHT = { easy: 0.85, medium: 1, hard: 1.25 } as const;

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
  const isWeekend = date.getDay() === 0 || date.getDay() === 6;
  if (isWeekend) return availability.studyWeekends ? availability.weekendHoursPerDay : 0;
  return availability.hoursPerDay;
}

export interface PlanOptions {
  /** How many days ahead to plan when there is no exam to anchor to. */
  horizonDays?: number;
}

/**
 * Generates a day-by-day timetable.
 *
 * Strategy:
 *  1. Score every pending topic (urgency x importance x difficulty x weakness).
 *  2. Walk forward day by day, filling each day's capacity with the highest
 *     scoring topics whose exam has not yet passed. Long topics are split into
 *     chunks of at most 2 focused hours.
 *  3. Schedule a spaced revision block ~3 days after a topic is first studied.
 *  4. Reserve the two days before each exam for revision + a mock test.
 */
export function generatePlan(state: StudyState, options: PlanOptions = {}): PlanSession[] {
  const { subjects, topics, exams, availability } = state;
  const start = todayISO();
  const horizon = options.horizonDays ?? 21;

  const pending = topics.filter((t) => t.status !== "done");
  if (pending.length === 0 || subjects.length === 0) return [];

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
    Math.min(120, lastExam ? daysBetween(start, lastExam) + 1 : horizon),
  );

  // Remaining work per topic, highest priority first.
  const queue = pending
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

    // 1. Exam eve: revision + mock test for that subject.
    const lockedExam = examLockedDays.get(iso);
    if (lockedExam) {
      const revisionHours = Math.min(capacity, Math.max(1, capacity - 1));
      sessions.push(
        session(iso, lockedExam.subjectId, null, `Full revision — ${lockedExam.name}`, revisionHours, "revision"),
      );
      capacity -= revisionHours;
      if (capacity >= 1) {
        sessions.push(
          session(iso, lockedExam.subjectId, null, `Mock test — ${lockedExam.name}`, 1, "practice"),
        );
        capacity -= 1;
      }
      continue;
    }

    // 2. Spaced revision blocks that came due today.
    for (const item of revisionQueue.get(iso) ?? []) {
      if (capacity < 0.5) break;
      sessions.push(
        session(iso, item.topic.subjectId, item.topic.id, `Revise: ${item.topic.name}`, 0.5, "revision"),
      );
      capacity -= 0.5;
    }

    // 3. New study work, respecting exam deadlines.
    for (const item of queue) {
      if (capacity < 0.5) break;
      if (item.remaining <= 0) continue;

      const exam = examBySubject.get(item.topic.subjectId);
      if (exam && iso >= exam.date) continue; // deadline passed — skip

      const chunk = Math.min(item.remaining, capacity, 2);
      sessions.push(
        session(iso, item.topic.subjectId, item.topic.id, item.topic.name, chunk, "study"),
      );
      item.remaining -= chunk;
      capacity -= chunk;

      if (item.remaining <= 0) {
        const revisionDate = toISODate(new Date(date.getTime() + 3 * DAY_MS));
        const bucket = revisionQueue.get(revisionDate) ?? [];
        bucket.push({ topic: item.topic });
        revisionQueue.set(revisionDate, bucket);
      }
    }

    // 4. Leftover time becomes a practice buffer.
    if (capacity >= 1 && queue.some((q) => q.remaining > 0)) {
      const first = queue.find((q) => q.remaining > 0);
      if (first) {
        sessions.push(
          session(iso, first.topic.subjectId, null, "Practice problems & recall", Math.min(capacity, 1), "practice"),
        );
      }
    }
  }

  return sessions;
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
