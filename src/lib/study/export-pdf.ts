import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { StudyState } from "./types";
import { subjectName } from "./planner";
import { computeStats } from "./analytics";

const BRAND: [number, number, number] = [47, 163, 122];
const INK: [number, number, number] = [27, 27, 27];

function header(doc: jsPDF, title: string, subtitle: string) {
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Studyloop", 14, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(title, 14, 19);
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(subtitle, 14, 34);
}

function longDate(iso: string) {
  return new Date(Date.parse(`${iso}T00:00:00`)).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Full study plan: summary, exams and every scheduled session by day. */
export function exportPlanPdf(state: StudyState) {
  const doc = new jsPDF();
  const stats = computeStats(state);
  header(
    doc,
    "Personalised study plan",
    `Generated ${new Date().toLocaleDateString()} · ${stats.totalTopics} topics · ${stats.hoursPlanned} planned hours`,
  );

  autoTable(doc, {
    startY: 40,
    head: [["Subject", "Topics", "Completed", "Progress"]],
    body: stats.subjects.map((s) => [
      s.name,
      String(s.total),
      String(s.done),
      `${Math.round(s.percent)}%`,
    ]),
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 9 },
  });

  if (state.exams.length > 0) {
    autoTable(doc, {
      head: [["Exam", "Subject", "Date", "Weightage"]],
      body: [...state.exams]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => [e.name, subjectName(state.subjects, e.subjectId), longDate(e.date), `${e.weightage}%`]),
      headStyles: { fillColor: BRAND },
      styles: { fontSize: 9 },
    });
  }

  const byDate = new Map<string, typeof state.plan>();
  for (const s of [...state.plan].sort((a, b) => a.date.localeCompare(b.date))) {
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  }

  autoTable(doc, {
    head: [["Day", "Time", "Subject", "Session", "Hours"]],
    body: [...byDate.entries()].flatMap(([date, sessions]) =>
      sessions.map((s, i) => [
        i === 0 ? longDate(date) : "",
        s.startTime ?? "",
        subjectName(state.subjects, s.subjectId),
        s.title,
        String(s.hours),
      ]),
    ),
    headStyles: { fillColor: BRAND },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold" } },
  });

  doc.save("studyloop-plan.pdf");
}

/** Compact week-grid timetable. */
export function exportTimetablePdf(state: StudyState) {
  const doc = new jsPDF({ orientation: "landscape" });
  header(doc, "Weekly timetable", `Generated ${new Date().toLocaleDateString()}`);

  const dates = [...new Set(state.plan.map((s) => s.date))].sort();
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

  for (const week of weeks) {
    autoTable(doc, {
      head: [week.map(longDate)],
      body: [
        week.map((date) =>
          state.plan
            .filter((s) => s.date === date)
            .map((s) => `${s.startTime ? `${s.startTime} ` : ""}${s.title} (${s.hours}h)`)
            .join("\n") || "Rest day",
        ),
      ],
      headStyles: { fillColor: BRAND, fontSize: 8 },
      styles: { fontSize: 7, cellWidth: "wrap", valign: "top" },
    });
  }

  doc.save("studyloop-timetable.pdf");
}
