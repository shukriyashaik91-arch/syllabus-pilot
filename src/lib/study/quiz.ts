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

export function scoreLabel(score: number, total: number): string {
  const pct = total ? Math.round((score / total) * 100) : 0;
  if (pct >= 85) return "Excellent — this topic is solid.";
  if (pct >= 60) return "Good. A quick revision will lock it in.";
  if (pct >= 40) return "Shaky. Extra revision has been added to your plan.";
  return "Needs work. This topic goes back into your revision queue.";
}
