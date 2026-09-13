import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarRange, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/study/app-shell";
import { StepNav } from "@/components/study/step-nav";
import { TiltCard } from "@/components/study/tilt-card";
import { Scene3D } from "@/components/three/scene-3d";
import { SessionCard } from "@/components/study/session-card";
import { QuizRunner } from "@/components/study/quiz-runner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStudyState } from "@/lib/study/storage";
import { generatePlan, parseISODate, todayISO } from "@/lib/study/planner";
import { scheduleWeakTopicRevision, topicsForSession } from "@/lib/study/quiz";
import type { PlanSession, QuizAttempt } from "@/lib/study/types";

export const Route = createFileRoute("/plan")({
  head: () => ({
    meta: [
      { title: "Your adaptive study timetable — Studyloop" },
      {
        name: "description",
        content:
          "A day-by-day timetable with study blocks, spaced revision and pre-exam mock tests, built from your syllabus and free hours.",
      },
      { property: "og:title", content: "Your adaptive study timetable — Studyloop" },
      {
        property: "og:description",
        content:
          "See every study, revision and practice block scheduled between today and your last exam.",
      },
    ],
  }),
  component: PlanPage,
});

function PlanPage() {
  const { state, update, hydrated } = useStudyState();
  const today = todayISO();
  const [quizSession, setQuizSession] = useState<PlanSession | null>(null);

  const saveAttempt = (attempt: QuizAttempt) => {
    update((prev) =>
      scheduleWeakTopicRevision(
        { ...prev, quizAttempts: [...prev.quizAttempts, attempt] },
        attempt,
      ),
    );
    toast.success("Quiz saved — extra revision added where needed.");
  };

  const upcoming = state.plan
    .filter((s) => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDate = new Map<string, typeof upcoming>();
  for (const session of upcoming) {
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }

  const toggleSession = (id: string) =>
    update((prev) => {
      const session = prev.plan.find((s) => s.id === id);
      if (!session) return prev;
      const done = !session.done;
      const plan = prev.plan.map((s) => (s.id === id ? { ...s, done } : s));
      const topics = prev.topics.map((t) => {
        if (!session.topicId || t.id !== session.topicId) return t;
        const blocks = plan.filter((s) => s.topicId === t.id && s.kind === "study");
        const allDone = blocks.length > 0 && blocks.every((s) => s.done);
        const anyDone = blocks.some((s) => s.done);
        return { ...t, status: allDone ? "done" : anyDone ? "in_progress" : "pending" } as typeof t;
      });
      const activeDays = done
        ? Array.from(new Set([...prev.activeDays, session.date]))
        : prev.activeDays.filter(
            (d) => d !== session.date || plan.some((s) => s.date === d && s.done),
          );
      return { ...prev, plan, topics, activeDays };
    });

  const regenerate = () => {
    const selection = state.planSelection;
    if (state.topicSelection && state.topicSelection.length === 0) {
      toast.error("Please select at least one topic to generate your timetable.");
      return;
    }
    if (selection && selection.length === 0) {
      toast.error("Please select at least one subject or unit to generate your timetable.");
      return;
    }
    const { sessions, milestones } = generatePlan(state, { unitKeys: selection, topicIds: state.topicSelection });
    if (sessions.length === 0) {
      toast.error("Please select at least one subject or unit to generate your timetable.");
      return;
    }
    update((prev) => ({
      ...prev,
      plan: sessions,
      milestones,
      planGeneratedAt: new Date().toISOString(),
    }));
    toast.success("Timetable rebuilt around what's left.");
  };

  if (!hydrated) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-secondary" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <StepNav current={4} />
      <div className="relative mt-4 overflow-hidden rounded-3xl border border-border bg-card p-6">
        <Scene3D
          variant="orb"
          className="absolute -right-6 top-1/2 hidden h-48 w-64 -translate-y-1/2 opacity-70 md:block"
        />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl">Timetable</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {upcoming.length} upcoming blocks ·{" "}
              {upcoming.reduce((sum, s) => sum + s.hours, 0)} hours planned
            </p>
          </div>
          <Button variant="outline" className="press glass-panel rounded-full" onClick={regenerate}>
            <RefreshCw className="size-4" aria-hidden /> Regenerate
          </Button>
        </div>
      </div>


      {upcoming.length === 0 ? (
        <Card className="mt-6 rounded-3xl">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <CalendarRange className="size-8 text-accent" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              No sessions yet. Add your syllabus, exams and available hours, then generate a plan.
            </p>
            <Button asChild className="rounded-full">
              <Link to="/setup">Go to setup</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 space-y-4">
          {[...byDate.entries()].map(([date, sessions], dayIndex) => (
            <TiltCard key={date} max={2} className="rise-in" >
              <Card
                className="depth-card hover:depth-card-hover rounded-3xl"
                style={{ animationDelay: `${Math.min(dayIndex, 8) * 60}ms` }}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-baseline gap-2 text-base">
                    <span>
                      {date === today
                        ? "Today"
                        : parseISODate(date).toLocaleDateString(undefined, {
                            weekday: "long",
                            day: "numeric",
                            month: "short",
                          })}
                    </span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {sessions.reduce((sum, s) => sum + s.hours, 0)}h
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {sessions.map((s, i) => (
                      <div key={s.id} className="rise-in" style={{ animationDelay: `${i * 50}ms` }}>
                        <SessionCard
                          session={s}
                          subjects={state.subjects}
                          onToggle={toggleSession}
                        />
                      </div>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </TiltCard>
          ))}
        </div>

      )}
    </AppShell>
  );
}
