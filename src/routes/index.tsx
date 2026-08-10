import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarClock, Flame, GraduationCap, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/study/app-shell";
import { Scene3D } from "@/components/three/scene-3d";
import { TiltCard } from "@/components/study/tilt-card";
import { CountUp } from "@/components/study/count-up";
import { ProgressRing } from "@/components/study/progress-ring";
import { SessionCard } from "@/components/study/session-card";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useStudyState } from "@/lib/study/storage";
import { unitProgress, unitsBySubject } from "@/lib/study/units";
import { withSample } from "@/lib/study/sample";
import {
  computeStreak,
  daysBetween,
  subjectName,
  todayISO,
} from "@/lib/study/planner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Studyloop — Adaptive Study Planner Dashboard" },
      {
        name: "description",
        content:
          "Track today's study plan, syllabus progress, exam countdowns and your study streak in one calm dashboard.",
      },
      { property: "og:title", content: "Studyloop — Adaptive Study Planner Dashboard" },
      {
        property: "og:description",
        content:
          "Track today's study plan, syllabus progress, exam countdowns and your study streak in one calm dashboard.",
      },
    ],
  }),
  component: Dashboard,
});

const QUOTES = [
  "Small sessions, repeated daily, beat one heroic all-nighter.",
  "You don't have to finish the syllabus today — just the next block.",
  "Revision is where learning actually sticks.",
  "Consistency compounds. Show up for one session.",
];

function Dashboard() {
  const { state, update, hydrated } = useStudyState();
  const today = todayISO();

  const todaySessions = state.plan.filter((s) => s.date === today);
  const doneTopics = state.topics.filter((t) => t.status === "done").length;
  const progress = state.topics.length
    ? (doneTopics / state.topics.length) * 100
    : 0;
  const streak = computeStreak(state.activeDays);

  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const weekSessions = state.plan.filter((s) => s.date >= today && s.date <= weekEnd);
  const weekHours = weekSessions.reduce((sum, s) => sum + s.hours, 0);
  const weekDoneHours = weekSessions
    .filter((s) => s.done)
    .reduce((sum, s) => sum + s.hours, 0);

  const upcomingExams = [...state.exams]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  const quote = QUOTES[new Date().getDate() % QUOTES.length];

  const toggleSession = (id: string) => {
    update((prev) => {
      const session = prev.plan.find((s) => s.id === id);
      if (!session) return prev;
      const done = !session.done;
      const plan = prev.plan.map((s) => (s.id === id ? { ...s, done } : s));

      // Completing every block of a topic marks the topic itself as done.
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
  };

  if (!hydrated) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-secondary" />
      </AppShell>
    );
  }

  if (state.topics.length === 0) {
    return (
      <AppShell>
        <section className="paper relative overflow-hidden rounded-3xl border border-border bg-card p-8 sm:p-14">
          <Scene3D
            variant="hero"
            className="absolute inset-0 h-full w-full opacity-70 [mask-image:radial-gradient(circle_at_60%_45%,black,transparent_75%)]"
          />
          <div className="relative z-10 text-center">
            <span className="rise-in inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
              <Sparkles className="size-3.5" aria-hidden /> Adaptive study planning
            </span>
            <h1
              className="rise-in mx-auto mt-5 max-w-2xl text-balance text-4xl sm:text-5xl"
              style={{ animationDelay: "80ms" }}
            >
              Turn your syllabus into a plan you can actually follow
            </h1>
            <p
              className="rise-in mx-auto mt-4 max-w-xl text-muted-foreground"
              style={{ animationDelay: "160ms" }}
            >
              Paste your syllabus, add your exam dates and free hours. Studyloop
              prioritises weak and heavy topics, schedules spaced revision, and keeps
              two days before each exam free for mock tests.
            </p>
            <div
              className="rise-in mt-8 flex flex-wrap justify-center gap-3"
              style={{ animationDelay: "240ms" }}
            >
              <Button asChild size="lg" className="press rounded-full">
                <Link to="/setup">Add my syllabus</Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="press rounded-full glass-panel"
                onClick={() => {
                  update(withSample);
                  toast.success("Sample syllabus loaded — generate your plan in Setup.");
                }}
              >
                Try sample data
              </Button>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }


  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">Today&rsquo;s plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">{quote}</p>
        </div>
        <Button asChild variant="outline" className="press rounded-full">
          <Link to="/plan">View full timetable</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Target className="size-4" />}
          label="Study progress"
          value={progress}
          decimals={0}
          suffix="%"
          caption={`${doneTopics}/${state.topics.length} topics`}
          delay={0}
        />
        <MetricCard
          icon={<CalendarClock className="size-4" />}
          label="Upcoming exams"
          value={state.exams.filter((e) => e.date >= today).length}
          caption={upcomingExams[0] ? `Next: ${upcomingExams[0].name}` : "None scheduled"}
          delay={70}
        />
        <MetricCard
          icon={<Flame className="size-4" />}
          label="Study streak"
          value={streak}
          caption={streak > 0 ? "days in a row" : "start today"}
          delay={140}
        />
        <MetricCard
          icon={<GraduationCap className="size-4" />}
          label="Completed topics"
          value={doneTopics}
          caption={`${weekDoneHours}/${weekHours}h done this week`}
          delay={210}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <TiltCard className="lg:col-span-2" max={3}>
          <Card className="depth-card hover:depth-card-hover h-full rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Scheduled blocks</CardTitle>
            </CardHeader>
            <CardContent>
              {todaySessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled today.{" "}
                  <Link to="/setup" className="text-accent underline underline-offset-4">
                    Generate a plan
                  </Link>{" "}
                  to fill your week.
                </p>
              ) : (
                <ul className="space-y-3">
                  {todaySessions.map((s, i) => (
                    <div key={s.id} className="rise-in" style={{ animationDelay: `${i * 60}ms` }}>
                      <SessionCard
                        session={s}
                        subjects={state.subjects}
                        onToggle={toggleSession}
                      />
                    </div>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TiltCard>

        <TiltCard max={4}>
          <Card className="depth-card hover:depth-card-hover h-full rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Syllabus progress</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <ProgressRing
                value={progress}
                label="covered"
                caption={`${doneTopics} of ${state.topics.length} topics completed`}
              />
              <div className="w-full">
                <Progress value={weekHours ? (weekDoneHours / weekHours) * 100 : 0} />
                <p className="mt-2 text-xs text-muted-foreground">Weekly goal progress</p>
              </div>
            </CardContent>
          </Card>
        </TiltCard>
      </div>


      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-accent" aria-hidden /> Upcoming exams
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingExams.length === 0 ? (
              <p className="text-sm text-muted-foreground">No exams added yet.</p>
            ) : (
              <ul className="space-y-3">
                {upcomingExams.map((exam) => {
                  const days = daysBetween(today, exam.date);
                  return (
                    <li
                      key={exam.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{exam.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {subjectName(state.subjects, exam.subjectId)} · {exam.weightage}% weightage
                        </p>
                      </div>
                      <span className="shrink-0 font-display text-lg">
                        {days === 0 ? "Today" : `${days}d`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <GraduationCap className="size-4 text-accent" aria-hidden /> Unit progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              {unitsBySubject(state.subjects, state.topics)
                .flatMap(({ subject, units }) => units.map((unit) => ({ subject, unit })))
                .slice(0, 6)
                .map(({ subject, unit }) => {
                  const percent = unitProgress(unit);
                  return (
                    <li key={unit.key} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate">{unit.label}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {subject.name} · {percent}%
                        </span>
                      </div>
                      <Progress value={percent} className="h-1.5" />
                    </li>
                  );
                })}
            </ul>
          </CardContent>
        </Card>

      </div>
    </AppShell>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 px-3 py-3">
      <span className="mx-auto flex size-7 items-center justify-center rounded-full bg-card text-accent">
        {icon}
      </span>
      <p className="mt-1.5 font-display text-xl">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
