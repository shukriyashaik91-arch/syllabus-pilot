import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/study/app-shell";
import { StepNav } from "@/components/study/step-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { uid, useStudyState } from "@/lib/study/storage";
import { generatePlan, todayISO } from "@/lib/study/planner";
import { WEEKDAY_LABELS, type Exam } from "@/lib/study/types";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "Exam date & study availability — Studyloop" },
      {
        name: "description",
        content:
          "Set your exam dates, available days, daily study hours, session length and breaks before Studyloop builds your timetable.",
      },
      { property: "og:title", content: "Exam date & study availability — Studyloop" },
      {
        property: "og:description",
        content: "Tell Studyloop when you can study, and it schedules only the topics you picked.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchedulePage,
});

const SESSION_LENGTHS = [25, 45, 60, 90] as const;

function SchedulePage() {
  const { state, update, hydrated } = useStudyState();
  const navigate = useNavigate();
  const a = state.availability;
  const [draft, setDraft] = useState({ name: "", subjectId: "", date: "" });

  const set = (patch: Partial<typeof a>) =>
    update((prev) => ({ ...prev, availability: { ...prev.availability, ...patch } }));

  const selectedIds = state.topicSelection;
  const selectedCount = selectedIds ? selectedIds.length : state.topics.length;

  const addExam = () => {
    if (!draft.name.trim() || !draft.subjectId || !draft.date) {
      toast.error("Exam name, subject and date are required.");
      return;
    }
    const exam: Exam = {
      id: uid("exam"),
      name: draft.name.trim().slice(0, 80),
      subjectId: draft.subjectId,
      date: draft.date,
      difficulty: "medium",
      priority: 3,
      weightage: 25,
    };
    update((prev) => ({ ...prev, exams: [...prev.exams, exam] }));
    setDraft({ name: "", subjectId: "", date: "" });
    toast.success("Exam added.");
  };

  const generate = () => {
    if (selectedCount === 0) {
      toast.error("Please select at least one topic before generating your timetable.");
      navigate({ to: "/syllabus-review" });
      return;
    }
    const { sessions, milestones } = generatePlan(state, {
      unitKeys: state.planSelection,
      topicIds: state.topicSelection,
    });
    if (sessions.length === 0) {
      toast.error("Nothing could be scheduled — check your selected topics and available days.");
      return;
    }
    update((prev) => ({
      ...prev,
      plan: sessions,
      milestones,
      planGeneratedAt: new Date().toISOString(),
    }));
    toast.success(`Timetable ready — ${sessions.length} sessions scheduled.`);
    navigate({ to: "/plan" });
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
      <StepNav current={3} />

      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">Your study schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {selectedCount} topics selected · tell us when you can actually study.
          </p>
        </div>
        <Button asChild variant="ghost" className="rounded-full">
          <Link to="/syllabus-review">← Back to topics</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">Exam dates</CardTitle>
            <CardDescription>Exams pull their subject's topics forward.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })}
                placeholder="Exam name"
                aria-label="Exam name"
                className="rounded-full"
              />
              <Select
                value={draft.subjectId}
                onValueChange={(v) => setDraft({ ...draft, subjectId: v })}
              >
                <SelectTrigger className="rounded-full" aria-label="Exam subject">
                  <SelectValue placeholder="Subject" />
                </SelectTrigger>
                <SelectContent>
                  {state.subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                min={todayISO()}
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                aria-label="Exam date"
                className="rounded-full"
              />
            </div>
            <Button variant="outline" className="rounded-full" onClick={addExam}>
              <Plus className="size-4" aria-hidden /> Add exam
            </Button>

            <ul className="space-y-2">
              {state.exams
                .slice()
                .sort((x, y) => x.date.localeCompare(y.date))
                .map((exam) => (
                  <li
                    key={exam.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{exam.name}</p>
                      <p className="text-xs text-muted-foreground">{exam.date}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="rounded-full"
                      aria-label={`Remove ${exam.name}`}
                      onClick={() =>
                        update((prev) => ({
                          ...prev,
                          exams: prev.exams.filter((e) => e.id !== exam.id),
                        }))
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-base">When can you study?</CardTitle>
            <CardDescription>Nothing is ever scheduled on a day you turn off.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Available days</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_LABELS.map((label, index) => {
                  const on = a.studyDays.includes(index);
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        set({
                          studyDays: on
                            ? a.studyDays.filter((d) => d !== index)
                            : [...a.studyDays, index].sort((p, q) => p - q),
                        })
                      }
                      className={cn(
                        "rounded-full border border-border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Weekday hours per day: {a.hoursPerDay}h</Label>
              <Slider
                value={[a.hoursPerDay]}
                min={0.5}
                max={12}
                step={0.5}
                onValueChange={([v]) => set({ hoursPerDay: v ?? 3 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Weekend hours per day: {a.weekendHoursPerDay}h</Label>
              <Slider
                value={[a.weekendHoursPerDay]}
                min={0}
                max={14}
                step={0.5}
                onValueChange={([v]) => set({ weekendHoursPerDay: v ?? 5 })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pref-time">Preferred study time</Label>
              <Select
                value={a.preferredTime}
                onValueChange={(v) => set({ preferredTime: v as typeof a.preferredTime })}
              >
                <SelectTrigger id="pref-time" className="rounded-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning</SelectItem>
                  <SelectItem value="afternoon">Afternoon</SelectItem>
                  <SelectItem value="evening">Evening</SelectItem>
                  <SelectItem value="night">Night</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Study session length</Label>
              <div className="flex flex-wrap gap-2">
                {SESSION_LENGTHS.map((mins) => {
                  const on = (a.sessionMinutes ?? 60) === mins;
                  return (
                    <button
                      key={mins}
                      type="button"
                      aria-pressed={on}
                      onClick={() => set({ sessionMinutes: mins })}
                      className={cn(
                        "rounded-full border border-border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {mins} min
                    </button>
                  );
                })}
                <Input
                  type="number"
                  min={15}
                  max={240}
                  step={5}
                  value={a.sessionMinutes ?? 60}
                  onChange={(e) =>
                    set({
                      sessionMinutes: Math.min(240, Math.max(15, Number(e.target.value) || 60)),
                    })
                  }
                  aria-label="Custom session length in minutes"
                  className="h-9 w-24 rounded-full"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Break between blocks: {a.breakMinutes} min</Label>
              <Slider
                value={[a.breakMinutes]}
                min={0}
                max={30}
                step={5}
                onValueChange={([v]) => set({ breakMinutes: v ?? 10 })}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex justify-end">
        <Button className="rounded-full" onClick={generate}>
          <Sparkles className="size-4" aria-hidden /> Generate my timetable
        </Button>
      </div>
    </AppShell>
  );
}
