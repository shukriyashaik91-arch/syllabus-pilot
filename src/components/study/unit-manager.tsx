import { useState } from "react";
import { Check, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { uid, useStudyState } from "@/lib/study/storage";
import {
  setTopicCompletion,
  setUnitCompletion,
  unitProgress,
  unitsBySubject,
  type StudyUnit,
} from "@/lib/study/units";

/**
 * Unit-wise syllabus manager: expandable cards per unit with inline editing,
 * topic add/delete and unit-level or topic-level completion.
 */
export function UnitManager() {
  const { state, update } = useStudyState();
  const grouped = unitsBySubject(state.subjects, state.topics);

  if (grouped.length === 0) {
    return <p className="text-sm text-muted-foreground">No units yet — upload or paste a syllabus.</p>;
  }

  return (
    <div className="space-y-5">
      {grouped.map(({ subject, units }) => (
        <div key={subject.id}>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-3 rounded-full"
              style={{ backgroundColor: `var(--color-chart-${subject.colorIndex})` }}
            />
            <h3 className="text-base font-semibold">{subject.name}</h3>
            <Badge variant="secondary" className="rounded-full text-[10px]">
              {units.length} units
            </Badge>
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto rounded-full"
              aria-label={`Remove ${subject.name}`}
              onClick={() =>
                update((prev) => ({
                  ...prev,
                  subjects: prev.subjects.filter((s) => s.id !== subject.id),
                  topics: prev.topics.filter((t) => t.subjectId !== subject.id),
                  exams: prev.exams.filter((e) => e.subjectId !== subject.id),
                  plan: prev.plan.filter((s) => s.subjectId !== subject.id),
                }))
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <Accordion type="multiple" className="mt-2 space-y-2">
            {units.map((unit) => (
              <UnitCard key={unit.key} unit={unit} />
            ))}
          </Accordion>
        </div>
      ))}
    </div>
  );
}

function UnitCard({ unit }: { unit: StudyUnit }) {
  const { update } = useStudyState();
  const [draft, setDraft] = useState("");
  const percent = unitProgress(unit);
  const hours = Math.round(unit.topics.reduce((h, t) => h + t.estimatedHours, 0) * 10) / 10;

  return (
    <AccordionItem value={unit.key} className="depth-card hover:depth-card-hover rounded-2xl border border-border bg-card px-3">
      <AccordionTrigger className="py-3 hover:no-underline">
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 pr-2 text-left">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{unit.label}</span>
            <Badge variant="secondary" className="rounded-full text-[10px]">
              {unit.topics.length} topics · {hours}h
            </Badge>
            <Badge
              variant={percent === 100 ? "default" : "outline"}
              className="rounded-full text-[10px]"
            >
              {percent}%
            </Badge>
          </span>
          <Progress value={percent} className="h-1.5" />
        </span>
      </AccordionTrigger>

      <AccordionContent className="space-y-3 pb-3">
        <ul className="space-y-1.5">
          {unit.topics.map((topic) => (
            <li key={topic.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
              <Button
                size="icon"
                variant={topic.status === "done" ? "default" : "outline"}
                className="size-8 rounded-full"
                aria-label={topic.status === "done" ? `Mark ${topic.name} pending` : `Mark ${topic.name} done`}
                onClick={() =>
                  update((prev) => setTopicCompletion(prev, topic.id, topic.status !== "done"))
                }
              >
                {topic.status === "done" ? <Check className="size-4" /> : <ChevronRight className="size-4" />}
              </Button>
              <Input
                value={topic.name}
                aria-label={`Edit ${topic.name}`}
                onChange={(e) => {
                  const name = e.target.value.slice(0, 200);
                  update((prev) => ({
                    ...prev,
                    topics: prev.topics.map((t) => (t.id === topic.id ? { ...t, name } : t)),
                  }));
                }}
                className={cn(
                  "h-9 rounded-full text-sm",
                  topic.status === "done" && "text-muted-foreground line-through",
                )}
              />
              <Input
                type="number"
                min={0.5}
                max={4}
                step={0.5}
                value={topic.estimatedHours}
                aria-label={`Hours for ${topic.name}`}
                onChange={(e) => {
                  const estimatedHours = Math.min(4, Math.max(0.5, Number(e.target.value) || 0.5));
                  update((prev) => ({
                    ...prev,
                    topics: prev.topics.map((t) =>
                      t.id === topic.id ? { ...t, estimatedHours } : t,
                    ),
                  }));
                }}
                className="h-9 w-20 rounded-full text-sm"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-9 rounded-full"
                aria-label={`Delete ${topic.name}`}
                onClick={() =>
                  update((prev) => ({
                    ...prev,
                    topics: prev.topics.filter((t) => t.id !== topic.id),
                    plan: prev.plan.filter((s) => s.topicId !== topic.id),
                  }))
                }
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <Input
            value={draft}
            placeholder="Add a topic to this unit"
            aria-label={`Add a topic to ${unit.label}`}
            onChange={(e) => setDraft(e.target.value.slice(0, 200))}
            className="h-9 min-w-40 flex-1 rounded-full text-sm"
          />
          <Button
            variant="outline"
            className="h-9 rounded-full"
            onClick={() => {
              const name = draft.trim();
              if (!name) return;
              update((prev) => ({
                ...prev,
                topics: [
                  ...prev.topics,
                  {
                    id: uid("top"),
                    subjectId: unit.subjectId,
                    unit: unit.title,
                    unitNumber: unit.number,
                    unitOrder: unit.order,
                    name,
                    estimatedHours: 1,
                    difficulty: "medium",
                    status: "pending",
                  },
                ],
              }));
              setDraft("");
            }}
          >
            <Plus className="size-4" aria-hidden /> Add
          </Button>
          <Button
            variant={percent === 100 ? "secondary" : "default"}
            className="h-9 rounded-full"
            onClick={() => update((prev) => setUnitCompletion(prev, unit.key, percent !== 100))}
          >
            <Check className="size-4" aria-hidden />
            {percent === 100 ? "Mark unit pending" : "Mark unit complete"}
          </Button>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
