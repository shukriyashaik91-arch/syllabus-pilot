import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, ChevronDown, Search } from "lucide-react";
import { AppShell } from "@/components/study/app-shell";
import { StepNav } from "@/components/study/step-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useStudyState } from "@/lib/study/storage";
import { unitKeyOf, unitsBySubject } from "@/lib/study/units";
import type { Topic } from "@/lib/study/types";

export const Route = createFileRoute("/syllabus-review")({
  head: () => ({
    meta: [
      { title: "Review your syllabus & pick topics — Studyloop" },
      {
        name: "description",
        content:
          "Review the units and topics detected from your syllabus and choose exactly what should go into your study plan.",
      },
      { property: "og:title", content: "Review your syllabus & pick topics — Studyloop" },
      {
        property: "og:description",
        content: "Tick the units and topics you actually want to study before building the timetable.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SyllabusReviewPage,
});

const DIFFICULTY_DOTS = { easy: 2, medium: 3, hard: 5 } as const;

function difficultyDots(topic: Topic) {
  const filled = DIFFICULTY_DOTS[topic.difficulty] ?? 3;
  return "●".repeat(filled) + "○".repeat(5 - filled);
}

function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function SyllabusReviewPage() {
  const { state, update, hydrated } = useStudyState();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);

  const groups = useMemo(
    () => unitsBySubject(state.subjects, state.topics),
    [state.subjects, state.topics],
  );
  const allIds = useMemo(() => state.topics.map((t) => t.id), [state.topics]);

  const selected = state.topicSelection ?? allIds;
  const selectedSet = new Set(selected);

  const setSelection = (ids: string[]) => {
    const set = new Set(ids);
    update((prev) => ({
      ...prev,
      topicSelection: ids,
      planSelection: Array.from(
        new Set(prev.topics.filter((t) => set.has(t.id)).map((t) => unitKeyOf(t))),
      ),
    }));
  };

  const toggleTopic = (id: string) =>
    setSelection(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const toggleMany = (ids: string[], on: boolean) =>
    setSelection(
      on ? Array.from(new Set([...selected, ...ids])) : selected.filter((x) => !ids.includes(x)),
    );

  const q = query.trim().toLowerCase();
  const matches = (topic: Topic) => !q || topic.name.toLowerCase().includes(q);

  const selectedTopics = state.topics.filter((t) => selectedSet.has(t.id));
  const selectedUnits = new Set(selectedTopics.map((t) => unitKeyOf(t)));
  const selectedSubjects = state.subjects.filter((s) =>
    selectedTopics.some((t) => t.subjectId === s.id),
  );
  const selectedHours = selectedTopics.reduce((h, t) => h + t.estimatedHours, 0);

  if (!hydrated) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-secondary" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <StepNav current={2} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">📚 Review your syllabus</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Select the units and topics you want to include in your study plan.
          </p>
        </div>
        <p className="text-sm font-medium">
          Selected: {selectedTopics.length} / {allIds.length} topics
        </p>
      </div>

      {groups.length === 0 ? (
        <Card className="mt-6 rounded-3xl">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <BookOpen className="size-8 text-accent" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              Nothing to review yet — upload your syllabus PDF first.
            </p>
            <Button asChild className="rounded-full">
              <Link to="/setup">Upload syllabus</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-4">
            <Card className="rounded-3xl">
              <CardContent className="flex flex-wrap items-center gap-2 py-4">
                <div className="relative min-w-52 flex-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search syllabus topics..."
                    aria-label="Search syllabus topics"
                    className="rounded-full pl-9"
                  />
                </div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => setSelection(allIds)}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setSelection([])}>
                  Clear all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() => setCollapsed([])}
                >
                  Expand all
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full"
                  onClick={() =>
                    setCollapsed(groups.flatMap((g) => g.units.map((u) => u.key)))
                  }
                >
                  Collapse all
                </Button>
              </CardContent>
            </Card>

            {groups.map(({ subject, units }) => {
              const visibleUnits = units.filter((u) => u.topics.some(matches));
              if (visibleUnits.length === 0) return null;
              return (
                <Card key={subject.id} className="rounded-3xl">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <span
                        aria-hidden
                        className="size-3 rounded-full"
                        style={{ backgroundColor: `var(--color-chart-${subject.colorIndex})` }}
                      />
                      {subject.name}
                      <Badge variant="secondary" className="rounded-full text-[10px]">
                        {units.length} units
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {visibleUnits.map((unit) => {
                      const ids = unit.topics.map((t) => t.id);
                      const on = ids.filter((id) => selectedSet.has(id)).length;
                      const open = !collapsed.includes(unit.key) || Boolean(q);
                      return (
                        <div key={unit.key} className="rounded-2xl border border-border p-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={on === ids.length ? true : on > 0 ? "indeterminate" : false}
                              onCheckedChange={(v) => toggleMany(ids, v !== false)}
                              aria-label={`Select ${unit.label}`}
                            />
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                              onClick={() =>
                                setCollapsed((prev) =>
                                  prev.includes(unit.key)
                                    ? prev.filter((k) => k !== unit.key)
                                    : [...prev, unit.key],
                                )
                              }
                              aria-expanded={open}
                            >
                              <span className="truncate font-medium">{unit.label}</span>
                              <Badge variant="outline" className="rounded-full text-[10px]">
                                {on}/{ids.length} topics
                              </Badge>
                              <ChevronDown
                                className={cn(
                                  "ml-auto size-4 shrink-0 transition-transform",
                                  !open && "-rotate-90",
                                )}
                                aria-hidden
                              />
                            </button>
                          </div>

                          {open && (
                            <ul className="mt-2 space-y-1.5 pl-7">
                              {unit.topics.filter(matches).map((topic) => (
                                <li key={topic.id}>
                                  <label className="flex items-start gap-2 text-sm">
                                    <Checkbox
                                      className="mt-0.5"
                                      checked={selectedSet.has(topic.id)}
                                      onCheckedChange={() => toggleTopic(topic.id)}
                                      aria-label={`Select ${topic.name}`}
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate">{topic.name}</span>
                                      <span className="text-xs text-muted-foreground">
                                        Difficulty: {difficultyDots(topic)} · Est. time:{" "}
                                        {formatHours(topic.estimatedHours)}
                                      </span>
                                    </span>
                                  </label>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Card className="rounded-3xl">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Your selection</CardTitle>
                <CardDescription>Difficulty and times are estimates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>{selectedUnits.size} units selected</p>
                <p>{selectedTopics.length} topics selected</p>
                <p>Estimated study time: {formatHours(selectedHours)}</p>
                {selectedSubjects.length > 0 && (
                  <div>
                    <p className="text-muted-foreground">Subjects:</p>
                    <ul className="mt-1 space-y-1">
                      {selectedSubjects.map((s) => (
                        <li key={s.id} className="truncate">
                          {s.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              className="w-full rounded-full"
              disabled={selectedTopics.length === 0}
              onClick={() => navigate({ to: "/schedule" })}
            >
              Continue → Set your study schedule <ArrowRight className="size-4" aria-hidden />
            </Button>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
