import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/study/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uid, useStudyState } from "@/lib/study/storage";
import { parseSyllabus } from "@/lib/study/parse";
import { SyllabusUpload } from "@/components/study/syllabus-upload";
import { UnitManager } from "@/components/study/unit-manager";
import { PlanSelector } from "@/components/study/plan-selector";
import { generatePlan, todayISO } from "@/lib/study/planner";
import { withSample } from "@/lib/study/sample";
import type { Difficulty, Exam } from "@/lib/study/types";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Set up your syllabus, exams & hours — Studyloop" },
      {
        name: "description",
        content:
          "Paste or type your syllabus, add exam dates with priority and weightage, then set the hours you can realistically study.",
      },
      { property: "og:title", content: "Set up your syllabus, exams & hours — Studyloop" },
      {
        property: "og:description",
        content:
          "Three quick steps — syllabus, exams, availability — and Studyloop builds your adaptive timetable.",
      },
    ],
  }),
  component: SetupPage,
});

function SetupPage() {
  const { state, update, reset, hydrated } = useStudyState();
  const navigate = useNavigate();




  const buildPlan = () => {
    if (state.topics.length === 0) {
      toast.error("Add your syllabus first.");
      return;
    }
    const selection = state.planSelection;
    if (selection && selection.length === 0) {
      toast.error("Please select at least one subject or unit to generate your timetable.");
      return;
    }
    const { sessions, milestones } = generatePlan(state, { unitKeys: selection });
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl">Set up your plan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Syllabus, exams and availability — then generate the timetable.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            className="rounded-full"
            onClick={() => {
              update(withSample);
              toast.success("Sample syllabus, exams and topics loaded.");
            }}
          >
            Load sample data
          </Button>
          <Button variant="ghost" className="rounded-full" onClick={() => {
            reset();
            toast.success("Everything cleared.");
          }}>
            Clear all
          </Button>
          <Button className="rounded-full" onClick={buildPlan}>
            <Wand2 className="size-4" aria-hidden /> Generate timetable
          </Button>
        </div>
      </div>

      <div className="mt-6">
        <PlanSelector />
      </div>

      <Tabs defaultValue="syllabus" className="mt-6">
        <TabsList className="rounded-full">
          <TabsTrigger value="syllabus" className="rounded-full">Syllabus</TabsTrigger>
          <TabsTrigger value="exams" className="rounded-full">Exams</TabsTrigger>
          <TabsTrigger value="availability" className="rounded-full">Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="syllabus" className="mt-4 space-y-4">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base">Upload a syllabus PDF</CardTitle>
              <CardDescription>
                Drag in your PDF and AI turns it into subjects, units and timed topics.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SyllabusUpload />
            </CardContent>
          </Card>



          <UnitsCard />
        </TabsContent>

        <TabsContent value="exams" className="mt-4">
          <ExamsPanel />
        </TabsContent>

        <TabsContent value="availability" className="mt-4">
          <AvailabilityPanel />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function UnitsCard() {
  const { update } = useStudyState();
  const [newSubject, setNewSubject] = useState("");

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Units & topics</CardTitle>
        <CardDescription>
          Expand a unit to edit, add or delete topics, and tick off what you have already covered.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex gap-2">
          <Input
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value.slice(0, 80))}
            placeholder="Add a subject manually"
            className="rounded-full"
            aria-label="New subject name"
          />
          <Button
            variant="outline"
            className="rounded-full"
            onClick={() => {
              const name = newSubject.trim();
              if (!name) return;
              update((prev) => ({
                ...prev,
                subjects: [
                  ...prev.subjects,
                  { id: uid("sub"), name, colorIndex: (prev.subjects.length % 5) + 1 },
                ],
              }));
              setNewSubject("");
            }}
          >
            Add
          </Button>
        </div>

        <UnitManager />
      </CardContent>
    </Card>
  );
}

function ExamsPanel() {
  const { state, update } = useStudyState();
  const [draft, setDraft] = useState({
    name: "",
    subjectId: "",
    date: "",
    difficulty: "medium" as Difficulty,
    priority: 3,
    weightage: 25,
  });

  const addExam = () => {
    if (!draft.name.trim() || !draft.subjectId || !draft.date) {
      toast.error("Name, subject and date are required.");
      return;
    }
    if (draft.date < todayISO()) {
      toast.error("Pick a date in the future.");
      return;
    }
    const exam: Exam = {
      id: uid("exam"),
      name: draft.name.trim().slice(0, 80),
      subjectId: draft.subjectId,
      date: draft.date,
      difficulty: draft.difficulty,
      priority: draft.priority,
      weightage: Math.min(100, Math.max(0, draft.weightage)),
    };
    update((prev) => ({ ...prev, exams: [...prev.exams, exam] }));
    setDraft({ ...draft, name: "", date: "" });
    toast.success("Exam added.");
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Exam schedule</CardTitle>
        <CardDescription>
          Priority and weightage decide how aggressively topics are pulled forward.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="exam-name">Exam name</Label>
            <Input
              id="exam-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 80) })}
              placeholder="DSA Mid-term"
              className="rounded-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exam-subject">Subject</Label>
            <Select
              value={draft.subjectId}
              onValueChange={(v) => setDraft({ ...draft, subjectId: v })}
            >
              <SelectTrigger id="exam-subject" className="rounded-full">
                <SelectValue placeholder="Choose subject" />
              </SelectTrigger>
              <SelectContent>
                {state.subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exam-date">Date</Label>
            <Input
              id="exam-date"
              type="date"
              min={todayISO()}
              value={draft.date}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              className="rounded-full"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exam-difficulty">Difficulty</Label>
            <Select
              value={draft.difficulty}
              onValueChange={(v) => setDraft({ ...draft, difficulty: v as Difficulty })}
            >
              <SelectTrigger id="exam-difficulty" className="rounded-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority: {draft.priority}/5</Label>
            <Slider
              value={[draft.priority]}
              min={1}
              max={5}
              step={1}
              onValueChange={([v]) => setDraft({ ...draft, priority: v ?? 3 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Weightage: {draft.weightage}%</Label>
            <Slider
              value={[draft.weightage]}
              min={0}
              max={100}
              step={5}
              onValueChange={([v]) => setDraft({ ...draft, weightage: v ?? 25 })}
            />
          </div>
        </div>
        <Button onClick={addExam} className="rounded-full">
          <Plus className="size-4" aria-hidden /> Add exam
        </Button>

        <ul className="space-y-2">
          {state.exams
            .slice()
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((exam) => (
              <li
                key={exam.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{exam.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {exam.date} · priority {exam.priority}/5 · {exam.weightage}% · {exam.difficulty}
                  </p>
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
  );
}

function AvailabilityPanel() {
  const { state, update } = useStudyState();
  const a = state.availability;

  const set = (patch: Partial<typeof a>) =>
    update((prev) => ({ ...prev, availability: { ...prev.availability, ...patch } }));

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="text-base">Your availability</CardTitle>
        <CardDescription>Be honest — an over-packed plan is the plan you abandon.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Weekday hours per day: {a.hoursPerDay}h</Label>
          <Slider
            value={[a.hoursPerDay]}
            min={1}
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
          <Label htmlFor="preferred-time">Preferred study time</Label>
          <Select
            value={a.preferredTime}
            onValueChange={(v) => set({ preferredTime: v as typeof a.preferredTime })}
          >
            <SelectTrigger id="preferred-time" className="rounded-full">
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
          <Label>Break between blocks: {a.breakMinutes} min</Label>
          <Slider
            value={[a.breakMinutes]}
            min={0}
            max={30}
            step={5}
            onValueChange={([v]) => set({ breakMinutes: v ?? 10 })}
          />
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-secondary/60 px-4 py-3 sm:col-span-2">
          <div>
            <p className="font-medium">Study on weekends</p>
            <p className="text-xs text-muted-foreground">Turn off to keep Saturdays and Sundays free.</p>
          </div>
          <Switch
            checked={a.studyDays.includes(0) || a.studyDays.includes(6)}
            onCheckedChange={(v) =>
              set({
                studyDays: v
                  ? Array.from(new Set([...a.studyDays, 0, 6])).sort()
                  : a.studyDays.filter((d) => d !== 0 && d !== 6),
              })
            }
            aria-label="Study on weekends"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Weak subjects (get extra time and earlier slots)</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {state.subjects.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add subjects first.</p>
            ) : (
              state.subjects.map((s) => {
                const active = a.weakSubjectIds.includes(s.id);
                return (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={active ? "default" : "outline"}
                    className="rounded-full"
                    aria-pressed={active}
                    onClick={() =>
                      set({
                        weakSubjectIds: active
                          ? a.weakSubjectIds.filter((id) => id !== s.id)
                          : [...a.weakSubjectIds, s.id],
                      })
                    }
                  >
                    {s.name}
                  </Button>
                );
              })
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
