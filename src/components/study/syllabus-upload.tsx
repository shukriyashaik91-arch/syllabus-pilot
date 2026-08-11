import { useRef, useState } from "react";
import { FileUp, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Scene3D } from "@/components/three/scene-3d";

import { supabase } from "@/integrations/supabase/client";
import { extractPdfText, MAX_PDF_BYTES } from "@/lib/study/pdf";
import { extractSyllabusWithAi, type AiSyllabus } from "@/lib/study/ai.functions";
import { uid, useStudyState } from "@/lib/study/storage";
import type { Subject, Topic } from "@/lib/study/types";

type Phase = "idle" | "reading" | "uploading" | "thinking";

/** Drag-and-drop PDF upload → text extraction → AI unit breakdown → edit → apply. */
export function SyllabusUpload({ onApplied }: { onApplied?: () => void }) {
  const { state, update } = useStudyState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiSyllabus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Optional subject name typed by the student for this specific PDF. */
  const [subjectName, setSubjectName] = useState("");

  const busy = phase !== "idle";

  const handleFile = async (file: File) => {
    if (file.size > MAX_PDF_BYTES) {
      toast.error("That PDF is larger than 10 MB.");
      return;
    }
    setFileName(file.name);
    setPreview(null);

    try {
      setPhase("reading");
      setProgress(0);
      const { text, pages } = await extractPdfText(file, setProgress);

      setPhase("uploading");
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const path = `${auth.user.id}/${Date.now()}-${file.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error } = await supabase.storage.from("syllabi").upload(path, file, {
          contentType: "application/pdf",
          upsert: false,
        });
        if (!error) {
          update((prev) => ({
            ...prev,
            files: [
              ...prev.files,
              { id: uid("file"), name: file.name, path, size: file.size, uploadedAt: new Date().toISOString() },
            ],
          }));
        }
      }

      setPhase("thinking");
      const result = await extractSyllabusWithAi({
        data: {
          text,
          hoursPerDay: state.availability.hoursPerDay,
          daysPerWeek: state.availability.studyDays.length || 5,
          level: state.availability.intensity === "intense" ? "hard" : "medium",
          examDate: [...state.exams].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null,
        },
      });
      // One PDF = one subject when the student named it: keep every unit of
      // this file under that subject, in the order the AI returned them.
      const named = subjectName.trim();
      setPreview(
        named
          ? {
              ...result,
              subjects: [
                { name: named, units: result.subjects.flatMap((s) => s.units) },
              ],
            }
          : result,
      );
      const units = result.subjects.reduce((n, s) => n + s.units.length, 0);
      toast.success(`Read ${pages} page${pages === 1 ? "" : "s"} — found ${units} units.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that PDF.");
    } finally {
      setPhase("idle");
      setProgress(0);
    }
  };

  /** Structural edits on the preview before it is committed to the syllabus. */
  const editUnit = (
    subjectIndex: number,
    unitIndex: number,
    mutate: (unit: AiSyllabus["subjects"][number]["units"][number]) => void,
  ) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next: AiSyllabus = structuredClone(prev);
      const unit = next.subjects[subjectIndex]?.units[unitIndex];
      if (unit) mutate(unit);
      return next;
    });
  };

  const removeUnit = (subjectIndex: number, unitIndex: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next: AiSyllabus = structuredClone(prev);
      next.subjects[subjectIndex]?.units.splice(unitIndex, 1);
      next.subjects = next.subjects.filter((s) => s.units.length > 0);
      return next.subjects.length ? next : null;
    });
  };

  const apply = () => {
    if (!preview) return;
    const subjects: Subject[] = [];
    const topics: Topic[] = [];

    for (const aiSubject of preview.subjects) {
      const existing = state.subjects.find(
        (s) => s.name.toLowerCase() === aiSubject.name.toLowerCase(),
      );
      const subject: Subject =
        existing ??
        {
          id: uid("sub"),
          name: aiSubject.name,
          colorIndex: ((state.subjects.length + subjects.length) % 5) + 1,
        };
      if (!existing) subjects.push(subject);

      const offset = new Set(
        state.topics.filter((t) => t.subjectId === subject.id).map((t) => t.unit),
      ).size;

      aiSubject.units.forEach((unit, unitIndex) => {
        for (const t of unit.topics) {
          topics.push({
            id: uid("top"),
            subjectId: subject.id,
            unit: unit.unitTitle,
            unitNumber: unit.unitNumber,
            unitOrder: offset + unitIndex + 1,
            name: t.name,
            estimatedHours: t.estimatedHours,
            difficulty: t.difficulty,
            status: "pending",
          });
        }
      });
    }

    update((prev) => ({
      ...prev,
      subjects: [...prev.subjects, ...subjects],
      topics: [...prev.topics, ...topics],
      coachNotes: preview.notes.length ? preview.notes : prev.coachNotes,
    }));
    setPreview(null);
    setFileName(null);
    setSubjectName("");
    toast.success(`Added ${topics.length} topics to your syllabus.`);
    onApplied?.();
  };

  const unitCount = preview?.subjects.reduce((n, s) => n + s.units.length, 0) ?? 0;
  const topicCount =
    preview?.subjects.reduce(
      (n, s) => n + s.units.reduce((m, u) => m + u.topics.length, 0),
      0,
    ) ?? 0;
  const totalHours = preview
    ? Math.round(
        preview.subjects.reduce(
          (sum, s) =>
            sum + s.units.reduce((h, u) => h + u.topics.reduce((x, t) => x + t.estimatedHours, 0), 0),
          0,
        ) * 10,
      ) / 10
    : 0;

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a syllabus PDF"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        className={cn(
          "grid cursor-pointer place-items-center gap-3 rounded-3xl border-2 border-dashed border-border/80 bg-secondary/40 px-6 py-10 text-center transition-all",
          dragging && "scale-[1.01] border-primary bg-primary/5",
          busy && "pointer-events-none opacity-70",
        )}
      >
        <div className="relative grid size-28 place-items-center">
          <Scene3D
            variant={phase === "thinking" ? "loader" : "orb"}
            active={phase === "reading" || phase === "uploading"}
            className="absolute inset-0"
          />
          <span className="relative grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary backdrop-blur-sm">
            {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
          </span>
        </div>

        <div>
          <p className="font-medium">
            {phase === "reading" && "Extracting text…"}
            {phase === "uploading" && "Saving your file…"}
            {phase === "thinking" && "AI is detecting units and topics…"}
            {phase === "idle" && "Drop your syllabus PDF here"}
          </p>
          <p className="text-xs text-muted-foreground">
            {fileName ?? "PDF only · up to 10 MB · text-based files work best"}
          </p>
        </div>
        {phase === "reading" && <Progress value={progress} className="h-1.5 w-48" />}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {preview && (
        <Card className="animate-in fade-in-50 rounded-3xl">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">Unit-wise breakdown</span>
              </CardTitle>
              <CardDescription>
                {unitCount} unit{unitCount === 1 ? "" : "s"} · {topicCount} topics · ~{totalHours}h ·
                edit anything before adding it
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPreview(null)} aria-label="Discard breakdown">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[26rem] space-y-4 overflow-y-auto pr-1">
              {preview.subjects.map((subject, subjectIndex) => (
                <div key={`${subject.name}-${subjectIndex}`}>
                  <p className="font-display text-sm font-semibold">{subject.name}</p>
                  <Accordion type="multiple" className="mt-1">
                    {subject.units.map((unit, unitIndex) => {
                      const draftKey = `${subjectIndex}-${unitIndex}`;
                      const hours =
                        Math.round(unit.topics.reduce((h, t) => h + t.estimatedHours, 0) * 10) / 10;
                      return (
                        <AccordionItem
                          key={draftKey}
                          value={draftKey}
                          className="depth-card hover:depth-card-hover rise-in mb-2 rounded-2xl border border-border bg-card px-3"
                        >
                          <AccordionTrigger className="py-3 hover:no-underline">
                            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 pr-2 text-left">
                              <span className="truncate font-medium">
                                {unit.unitNumber}: {unit.unitTitle}
                              </span>
                              <Badge variant="secondary" className="rounded-full text-[10px]">
                                {unit.topics.length} topics · {hours}h
                              </Badge>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="space-y-2 pb-3">
                            <ul className="space-y-1.5">
                              {unit.topics.map((topic, topicIndex) => (
                                <li
                                  key={topicIndex}
                                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2"
                                >
                                  <Input
                                    value={topic.name}
                                    aria-label={`Topic ${topicIndex + 1} of ${unit.unitNumber}`}
                                    onChange={(e) => {
                                      const value = e.target.value.slice(0, 200);
                                      editUnit(subjectIndex, unitIndex, (u) => {
                                        const target = u.topics[topicIndex];
                                        if (target) target.name = value;
                                      });
                                    }}
                                    className="h-9 rounded-full text-sm"
                                  />
                                  <Input
                                    type="number"
                                    min={0.5}
                                    max={3}
                                    step={0.5}
                                    value={topic.estimatedHours}
                                    aria-label={`Hours for ${topic.name}`}
                                    onChange={(e) => {
                                      const value = Math.min(3, Math.max(0.5, Number(e.target.value) || 0.5));
                                      editUnit(subjectIndex, unitIndex, (u) => {
                                        const target = u.topics[topicIndex];
                                        if (target) target.estimatedHours = value;
                                      });
                                    }}
                                    className="h-9 w-20 rounded-full text-sm"
                                  />
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-9 rounded-full"
                                    aria-label={`Delete ${topic.name}`}
                                    onClick={() =>
                                      editUnit(subjectIndex, unitIndex, (u) => {
                                        u.topics.splice(topicIndex, 1);
                                      })
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </li>
                              ))}
                            </ul>

                            <div className="flex gap-2">
                              <Input
                                value={drafts[draftKey] ?? ""}
                                placeholder="Add a topic to this unit"
                                aria-label={`Add a topic to ${unit.unitNumber}`}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [draftKey]: e.target.value.slice(0, 200) }))
                                }
                                className="h-9 rounded-full text-sm"
                              />
                              <Button
                                variant="outline"
                                className="h-9 shrink-0 rounded-full"
                                onClick={() => {
                                  const name = (drafts[draftKey] ?? "").trim();
                                  if (!name) return;
                                  editUnit(subjectIndex, unitIndex, (u) => {
                                    u.topics.push({ name, estimatedHours: 1, difficulty: "medium" });
                                  });
                                  setDrafts((d) => ({ ...d, [draftKey]: "" }));
                                }}
                              >
                                <Plus className="size-4" aria-hidden /> Add
                              </Button>
                              <Button
                                variant="ghost"
                                className="h-9 shrink-0 rounded-full text-destructive"
                                onClick={() => removeUnit(subjectIndex, unitIndex)}
                              >
                                Delete unit
                              </Button>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              ))}
            </div>

            {preview.notes.length > 0 && (
              <ul className="space-y-1 rounded-2xl bg-primary/5 p-3 text-sm text-muted-foreground">
                {preview.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            )}

            <Button onClick={apply} className="w-full rounded-full">
              Add to my syllabus
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
