import type { StudyState } from "./types";
import { daysBetween, subjectName, todayISO } from "./planner";

export interface Reminder {
  id: string;
  kind: "session" | "exam" | "revision" | "motivation";
  title: string;
  body: string;
  urgent: boolean;
}

/** In-app reminders derived from the plan, filtered by the user's preferences. */
export function buildReminders(state: StudyState): Reminder[] {
  const prefs = state.settings.notifications;
  const today = todayISO();
  const out: Reminder[] = [];

  if (prefs.sessionReminders) {
    const todays = state.plan.filter((s) => s.date === today && !s.done);
    if (todays.length > 0) {
      const hours = Math.round(todays.reduce((sum, s) => sum + s.hours, 0) * 10) / 10;
      const first = todays[0]!;
      out.push({
        id: "today-sessions",
        kind: "session",
        title: `${todays.length} session${todays.length === 1 ? "" : "s"} left today`,
        body: `${hours}h planned. Next up: ${first.title}${first.startTime ? ` at ${first.startTime}` : ""}.`,
        urgent: false,
      });
    }
  }

  if (prefs.examAlerts) {
    for (const exam of [...state.exams].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))) {
      const days = daysBetween(today, exam.date);
      if (days > 7) continue;
      out.push({
        id: `exam-${exam.id}`,
        kind: "exam",
        title: days === 0 ? `${exam.name} is today` : `${exam.name} in ${days} day${days === 1 ? "" : "s"}`,
        body: `${subjectName(state.subjects, exam.subjectId)} · ${exam.weightage}% of your grade.`,
        urgent: days <= 2,
      });
    }
  }

  if (prefs.revisionNudges) {
    const due = state.plan.filter((s) => s.kind === "revision" && !s.done && s.date <= today);
    if (due.length > 0) {
      out.push({
        id: "revision-due",
        kind: "revision",
        title: `${due.length} revision block${due.length === 1 ? "" : "s"} waiting`,
        body: "Spaced revision is what makes topics stick — clear these first.",
        urgent: due.length > 3,
      });
    }
  }

  const overdue = state.plan.filter((s) => !s.done && s.date < today);
  if (overdue.length > 0) {
    out.push({
      id: "overdue",
      kind: "session",
      title: `${overdue.length} missed session${overdue.length === 1 ? "" : "s"}`,
      body: "Regenerate the plan to redistribute them across your remaining days.",
      urgent: overdue.length > 5,
    });
  }

  return out;
}
