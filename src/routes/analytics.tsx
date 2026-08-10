import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Award, Clock, Flame, Target } from "lucide-react";
import { TiltCard } from "@/components/study/tilt-card";
import { AppShell } from "@/components/study/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useStudyState } from "@/lib/study/storage";
import { computeBadges, computeStats, dailySeries, weeklySeries } from "@/lib/study/analytics";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Study analytics & progress insights — Studyloop" },
      {
        name: "description",
        content:
          "Track study hours by day and week, subject-wise progress, consistency and the achievement badges you have unlocked.",
      },
      { property: "og:title", content: "Study analytics & progress insights — Studyloop" },
      {
        property: "og:description",
        content: "Daily, weekly and subject-wise study statistics with consistency and productivity insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { state, hydrated } = useStudyState();

  if (!hydrated) {
    return (
      <AppShell>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-3xl bg-secondary" />
          ))}
        </div>
      </AppShell>
    );
  }

  const stats = computeStats(state);
  const daily = dailySeries(state);
  const weekly = weeklySeries(state);
  const badges = computeBadges(state);
  const pie = stats.subjects.filter((s) => s.hours > 0);
  const consistentDays = daily.filter((d) => d.completed > 0).length;

  return (
    <AppShell>
      <div className="space-y-8">
        <header>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-muted-foreground">
            How your study time is actually being spent.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Clock className="size-4" />} label="Hours studied" value={`${stats.hoursStudied}h`} hint={`of ${stats.hoursPlanned}h planned`} />
          <Stat icon={<Flame className="size-4" />} label="Current streak" value={`${stats.streak}d`} hint={`${consistentDays}/14 active days`} />
          <Stat icon={<Target className="size-4" />} label="Syllabus covered" value={`${Math.round(stats.percent)}%`} hint={`${stats.doneTopics}/${stats.totalTopics} topics`} />
          <Stat icon={<Award className="size-4" />} label="Badges" value={`${badges.filter((b) => b.earned).length}/${badges.length}`} hint="Milestones unlocked" />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Last 14 days</CardTitle>
              <CardDescription>Planned vs completed hours</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="planned" name="Planned" fill="var(--color-muted-foreground)" radius={[6, 6, 0, 0]} opacity={0.35} />
                  <Bar dataKey="completed" name="Completed" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Weekly consistency</CardTitle>
              <CardDescription>Completed hours per week</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weekly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={28} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line type="monotone" dataKey="hours" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Time by subject</CardTitle>
              <CardDescription>Where your hours went</CardDescription>
            </CardHeader>
            <CardContent className="h-64">
              {pie.length === 0 ? (
                <p className="grid h-full place-items-center text-sm text-muted-foreground">
                  Complete a session to see this chart.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pie} dataKey="hours" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                      {pie.map((s) => (
                        <Cell key={s.id} fill={`var(--color-chart-${s.colorIndex})`} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Subject-wise progress</CardTitle>
              <CardDescription>Topics completed per subject</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.subjects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Add your syllabus to see progress.</p>
              ) : (
                stats.subjects.map((s) => (
                  <div key={s.id} className="space-y-1.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 text-sm">
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {s.done}/{s.total} · {s.hours}h
                      </span>
                    </div>
                    <Progress value={s.percent} className="h-2" />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold tracking-tight">Achievements</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {badges.map((badge) => (
              <div
                key={badge.id}
                className={`rounded-2xl border p-4 transition-colors ${
                  badge.earned ? "border-primary/40 bg-primary/5" : "border-border/70 bg-secondary/40 opacity-70"
                }`}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <p className="truncate font-medium">{badge.label}</p>
                  <Badge variant={badge.earned ? "default" : "outline"} className="shrink-0 rounded-full text-[10px]">
                    {badge.earned ? "Earned" : "Locked"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{badge.description}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-popover)",
  color: "var(--color-popover-foreground)",
  fontSize: 12,
};

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <TiltCard className="rise-in" max={8}>
      <Card className="depth-card hover:depth-card-hover h-full rounded-3xl">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              {icon}
            </span>
            <span className="truncate text-sm">{label}</span>
          </div>
          <p className="mt-3 font-display text-3xl font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </TiltCard>
  );

}
