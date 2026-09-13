import { uid } from "./storage";
import { todayISO, toISODate, parseISODate, DAY_MS } from "./planner";
import type { PlanSession, QuizAttempt, StudyState, Topic } from "./types";

/** Per-topic quiz performance rolled up across every attempt. */
export interface TopicMastery {
  topicName: string;
  subjectId: string;
  correct: number;
  asked: number;
  accuracy: number;
  status: "weak" | "improving" | "strong";
}

export function masteryByTopic(attempts: QuizAttempt[]): TopicMastery[] {
  const map = new Map<string, TopicMastery>();

  for (const attempt of attempts) {
    for (const q of attempt.questions) {
      const key = `${attempt.subjectId}|${q.topicName.toLowerCase()}`;
      const entry =
        map.get(key) ??
        ({
          topicName: q.topicName,
          subjectId: attempt.subjectId,
          correct: 0,
          asked: 0,
          accuracy: 0,
          status: "weak",
        } satisfies TopicMastery);
      entry.asked += 1;
      if (attempt.answers[q.id] === q.answerIndex) entry.correct += 1;
      map.set(key, entry);
    }
  }

  return [...map.values()]
    .map((m) => {
      const accuracy = m.asked ? m.correct / m.asked : 0;
      return {
        ...m,
        accuracy,
        status: accuracy >= 0.8 ? "strong" : accuracy >= 0.5 ? "improving" : "weak",
      } as TopicMastery;
    })
    .sort((a, b) => a.accuracy - b.accuracy);
}

export function weakTopicNames(attempts: QuizAttempt[]): string[] {
  return masteryByTopic(attempts)
    .filter((m) => m.status === "weak")
    .map((m) => m.topicName);
}

/** Topics covered by a completed session — what a follow-up quiz should test. */
export function topicsForSession(state: StudyState, session: PlanSession): Topic[] {
  if (session.topicId) {
    const topic = state.topics.find((t) => t.id === session.topicId);
    if (topic) return [topic];
  }
  if (session.unitKey) {
    return state.topics.filter(
      (t) => `${t.subjectId}|${t.unit}` === session.unitKey,
    );
  }
  return state.topics.filter((t) => t.subjectId === session.subjectId).slice(0, 6);
}

/** Next study date at or after `fromISO` that the student is available on. */
function nextFreeDate(state: StudyState, fromISO: string): string {
  const studyDays = state.availability.studyDays ?? [0, 1, 2, 3, 4, 5, 6];
  const cursor = parseISODate(fromISO);
  for (let i = 0; i < 30; i++) {
    if (studyDays.includes(cursor.getDay())) return toISODate(cursor);
    cursor.setTime(cursor.getTime() + DAY_MS);
  }
  return fromISO;
}

/**
 * Adds a short revision block for each topic the student got wrong, a couple of
 * days out, without touching any existing block in the timetable.
 */
export function scheduleWeakTopicRevision(state: StudyState, attempt: QuizAttempt): StudyState {
  if (attempt.weakTopics.length === 0) return state;

  const start = toISODate(new Date(parseISODate(todayISO()).getTime() + 2 * DAY_MS));
  const date = nextFreeDate(state, start);

  const extra: PlanSession[] = [];
  for (const name of attempt.weakTopics.slice(0, 4)) {
    const topic = state.topics.find(
      (t) => t.name.toLowerCase() === name.toLowerCase() && t.subjectId === attempt.subjectId,
    );
    const already = state.plan.some(
      (s) => s.kind === "revision" && s.date === date && s.title.includes(name),
    );
    if (already) continue;
    extra.push({
      id: uid("ses"),
      date,
      subjectId: attempt.subjectId,
      topicId: topic?.id ?? null,
      title: `Revision — ${name} (quiz follow-up)`,
      hours: 0.5,
      kind: "revision",
      done: false,
      unitLabel: topic ? `${topic.unitNumber ?? "Unit"}: ${topic.unit}` : undefined,
    });
  }

  if (extra.length === 0) return state;
  return { ...state, plan: [...state.plan, ...extra] };
}

/**
 * Builds a pre-exam revision plan for each upcoming exam: weak and shaky topics
 * (from quiz scores) get alternating revision and practice blocks in the days
 * leading up to the exam, finishing with a mock test the day before.
 */
export function buildPreExamPlan(state: StudyState): { state: StudyState; added: number } {
  const today = todayISO();
  const mastery = masteryByTopic(state.quizAttempts).filter((m) => m.status !== "strong");
  const extra: PlanSession[] = [];

  const upcoming = state.exams
    .filter((e) => e.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (const exam of upcoming) {
    const daysLeft = Math.round(
      (parseISODate(exam.date).getTime() - parseISODate(today).getTime()) / DAY_MS,
    );
    if (daysLeft < 1) continue;

    // Weak topics for this subject first, shaky ones after; cap the workload.
    const targets = mastery
      .filter((m) => m.subjectId === exam.subjectId)
      .slice(0, Math.max(2, daysLeft * 2));

    // Mock test the day before the exam.
    const mockDate = nextFreeDate(
      state,
      toISODate(new Date(parseISODate(exam.date).getTime() - DAY_MS)),
    );
    const mockTitle = `Mock test — ${exam.name}`;
    if (!state.plan.some((s) => s.date === mockDate && s.title === mockTitle)) {
      extra.push({
        id: uid("ses"),
        date: mockDate,
        subjectId: exam.subjectId,
        topicId: null,
        title: mockTitle,
        hours: 1,
        kind: "practice",
        done: false,
        unitLabel: "Pre-exam revision",
      });
    }

    targets.forEach((m, i) => {
      const offset = 1 + Math.floor(i / 2);
      if (offset >= daysLeft) return;
      const date = nextFreeDate(
        state,
        toISODate(new Date(parseISODate(today).getTime() + offset * DAY_MS)),
      );
      const kind = i % 2 === 0 ? "revision" : "practice";
      const title = `${kind === "revision" ? "Revision" : "Practice"} — ${m.topicName} (pre-exam)`;
      const dup =
        state.plan.some((s) => s.date === date && s.title === title) ||
        extra.some((s) => s.date === date && s.title === title);
      if (dup) return;
      const topic = state.topics.find(
        (t) => t.subjectId === m.subjectId && t.name.toLowerCase() === m.topicName.toLowerCase(),
      );
      extra.push({
        id: uid("ses"),
        date,
        subjectId: m.subjectId,
        topicId: topic?.id ?? null,
        title,
        hours: 0.5,
        kind,
        done: false,
        unitLabel: topic ? `${topic.unitNumber ?? "Unit"}: ${topic.unit}` : "Pre-exam revision",
      });
    });
  }

  if (extra.length === 0) return { state, added: 0 };
  return { state: { ...state, plan: [...state.plan, ...extra] }, added: extra.length };
}

export function scoreLabel(score: number, total: number): string {
  const pct = total ? Math.round((score / total) * 100) : 0;
  if (pct >= 85) return "Excellent — this topic is solid.";
  if (pct >= 60) return "Good. A quick revision will lock it in.";
  if (pct >= 40) return "Shaky. Extra revision has been added to your plan.";
  return "Needs work. This topic goes back into your revision queue.";
}
