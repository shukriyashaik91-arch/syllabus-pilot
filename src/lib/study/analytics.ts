import type { StudyState } from "./types";
import { computeStreak, daysBetween, todayISO, toISODate, DAY_MS } from "./planner";

export interface SubjectStat {
  id: string;
  name: string;
  colorIndex: number;
  total: number;
  done: number;
  percent: number;
  hours: number;
}

export interface DayStat {
  date: string;
  label: string;
  planned: number;
  completed: number;
}

/** Aggregated numbers powering the dashboard and analytics screens. */
export function computeStats(state: StudyState) {
  const today = todayISO();
  const totalTopics = state.topics.length;
  const doneTopics = state.topics.filter((t) => t.status === "done").length;
  const inProgress = state.topics.filter((t) => t.status === "in_progress").length;
  const percent = totalTopics ? (doneTopics / totalTopics) * 100 : 0;

  const completedSessions = state.plan.filter((s) => s.done);
  const hoursStudied = round(completedSessions.reduce((sum, s) => sum + s.hours, 0));
  const hoursPlanned = round(state.plan.reduce((sum, s) => sum + s.hours, 0));

  const subjects: SubjectStat[] = state.subjects.map((subject) => {
    const topics = state.topics.filter((t) => t.subjectId === subject.id);
    const done = topics.filter((t) => t.status === "done").length;
    const hours = round(
      state.plan
        .filter((s) => s.subjectId === subject.id && s.done)
        .reduce((sum, s) => sum + s.hours, 0),
    );
    return {
      id: subject.id,
      name: subject.name,
      colorIndex: subject.colorIndex,
      total: topics.length,
      done,
      percent: topics.length ? (done / topics.length) * 100 : 0,
      hours,
    };
  });

  return {
    today,
    totalTopics,
    doneTopics,
    inProgress,
    remainingTopics: totalTopics - doneTopics,
    percent,
    streak: computeStreak(state.activeDays),
    hoursStudied,
    hoursPlanned,
    subjects,
    upcomingExams: [...state.exams]
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}

/** Planned vs completed hours for the last `days` days, oldest first. */
export function dailySeries(state: StudyState, days = 14): DayStat[] {
  const out: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = toISODate(new Date(Date.now() - i * DAY_MS));
    const sessions = state.plan.filter((s) => s.date === date);
    out.push({
      date,
      label: new Date(Date.parse(`${date}T00:00:00`)).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      }),
      planned: round(sessions.reduce((sum, s) => sum + s.hours, 0)),
      completed: round(sessions.filter((s) => s.done).reduce((sum, s) => sum + s.hours, 0)),
    });
  }
  return out;
}

/** Completed hours grouped into calendar weeks, oldest first. */
export function weeklySeries(state: StudyState, weeks = 8) {
  const out: { label: string; hours: number; sessions: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(Date.now() - i * 7 * DAY_MS);
    const start = new Date(end.getTime() - 6 * DAY_MS);
    const from = toISODate(start);
    const to = toISODate(end);
    const sessions = state.plan.filter((s) => s.done && s.date >= from && s.date <= to);
    out.push({
      label: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
      hours: round(sessions.reduce((sum, s) => sum + s.hours, 0)),
      sessions: sessions.length,
    });
  }
  return out;
}

export interface Badge {
  id: string;
  label: string;
  description: string;
  earned: boolean;
}

export function computeBadges(state: StudyState): Badge[] {
  const stats = computeStats(state);
  const completed = state.plan.filter((s) => s.done).length;
  return [
    {
      id: "first-block",
      label: "First block",
      description: "Complete your very first study session",
      earned: completed >= 1,
    },
    {
      id: "streak-3",
      label: "Three in a row",
      description: "Study three days in a row",
      earned: stats.streak >= 3,
    },
    {
      id: "streak-7",
      label: "Week warrior",
      description: "Keep a 7-day study streak",
      earned: stats.streak >= 7,
    },
    {
      id: "ten-hours",
      label: "Deep worker",
      description: "Log 10 hours of focused study",
      earned: stats.hoursStudied >= 10,
    },
    {
      id: "half-syllabus",
      label: "Halfway there",
      description: "Cover half of your syllabus",
      earned: stats.percent >= 50,
    },
    {
      id: "syllabus-done",
      label: "Syllabus slayer",
      description: "Finish every topic on your plan",
      earned: stats.totalTopics > 0 && stats.percent >= 100,
    },
  ];
}

export function motivationalMessage(state: StudyState): string {
  const stats = computeStats(state);
  if (stats.totalTopics === 0) return "Add your syllabus and the plan writes itself.";
  if (stats.percent >= 100) return "Syllabus complete. Now it's all revision and confidence.";
  if (stats.streak >= 7) return `${stats.streak} days straight — this is what toppers actually do.`;
  if (stats.streak >= 3) return `${stats.streak}-day streak. Don't break the chain today.`;
  const nextExam = stats.upcomingExams[0];
  if (nextExam) {
    const d = daysBetween(stats.today, nextExam.date);
    if (d <= 3) return `${nextExam.name} in ${d} day${d === 1 ? "" : "s"} — revision mode.`;
    return `${d} days to ${nextExam.name}. Steady beats frantic.`;
  }
  if (stats.percent >= 50) return "Past halfway. The hard part is behind you.";
  return "One block at a time. Start with today's first session.";
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}
