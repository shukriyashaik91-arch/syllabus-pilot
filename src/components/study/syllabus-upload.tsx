import { useRef, useState } from "react";
import {
  BrainCircuit,
  FileText,
  LayoutList,
  ListTree,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
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

import { supabase } from "@/integrations/supabase/client";
import { extractPdfText, MAX_PDF_BYTES } from "@/lib/study/pdf";
import { extractSyllabusWithAi, type AiSyllabus } from "@/lib/study/ai.functions";
import { uid, useStudyState } from "@/lib/study/storage";
import type { Subject, Topic } from "@/lib/study/types";

type Phase = "idle" | "reading" | "uploading" | "thinking";

/** Matches "Unit 1", "UNIT-III", "Module 2", "Chapter IV", "Part A" headings. */
const UNIT_LINE =
  /^\s*(unit|module|chapter|part)\s*[-–—:.\s]?\s*(\d{1,2}|[ivxlcIVXLC]{1,6}|[A-H])\b/i;

/** Unit headings visible in the raw PDF text — used to validate the AI output. */
function detectUnitHeadings(text: string): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.length > 120) continue;
    const match = UNIT_LINE.exec(line);
    if (!match) continue;
    const key = `${match[1]!.toLowerCase()}-${match[2]!.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(line.slice(0, 120));
  }
  return labels;
}

const countUnits = (syllabus: AiSyllabus) =>
  syllabus.subjects.reduce((n, s) => n + s.units.length, 0);

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
  /** Pointer-driven tilt for the floating document, in degrees. */
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

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
      const payload = {
        text,
        hoursPerDay: state.availability.hoursPerDay,
        daysPerWeek: state.availability.studyDays.length || 5,
        level: (state.availability.intensity === "intense" ? "hard" : "medium") as "hard" | "medium",
        examDate: [...state.exams].sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null,
      };

      let result = await extractSyllabusWithAi({ data: payload });

      // Validation pass: the raw text clearly has more units than the AI
      // returned, so ask again with the detected headings as a hint.
      const headings = detectUnitHeadings(text);
      if (headings.length > 1 && countUnits(result) < headings.length) {
        try {
          const second = await extractSyllabusWithAi({
            data: { ...payload, hint: headings.join("\n") },
          });
          if (countUnits(second) > countUnits(result)) result = second;
        } catch {
          /* keep the first pass */
        }
      }

      // One PDF = one subject when the student named it: keep every unit of
      // this file under that subject, in the order the AI returned them.
      const named = subjectName.trim();
      const finalResult: AiSyllabus = named
        ? { ...result, subjects: [{ name: named, units: result.subjects.flatMap((s) => s.units) }] }
        : result;
      setPreview(finalResult);

      const units = countUnits(finalResult);
      const topics = finalResult.subjects.reduce(
        (n, s) => n + s.units.reduce((m, u) => m + u.topics.length, 0),
        0,
      );
      toast.success(
        `${pages} page${pages === 1 ? "" : "s"} read — ${units} unit${units === 1 ? "" : "s"} detected • ${topics} topics organized.`,
      );
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

  const addUnit = (subjectIndex: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const next: AiSyllabus = structuredClone(prev);
      const subject = next.subjects[subjectIndex];
      if (!subject) return prev;
      subject.units.push({
        unitNumber: `Unit ${subject.units.length + 1}`,
        unitTitle: "New unit",
        topics: [{ name: "New topic", estimatedHours: 1, difficulty: "medium" }],
      });
      return next;
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

  const unitCount = preview ? countUnits(preview) : 0;
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

  const active = dragging || busy;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Input
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value.slice(0, 80))}
          placeholder="Subject name (e.g. Mathematics)"
          aria-label="Subject name for this PDF"
          disabled={busy}
          className="rounded-full"
        />
        <p className="text-xs text-muted-foreground">
          Add one subject at a time — name it, upload its PDF, then repeat for the next subject.
          Existing subjects are kept.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload your syllabus PDF"
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTilt({
            x: ((e.clientY - r.top) / r.height - 0.5) * -16,
            y: ((e.clientX - r.left) / r.width - 0.5) * 20,
          });
        }}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
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
          "group relative grid cursor-pointer place-items-center gap-4 overflow-hidden rounded-[1.75rem] border-2 border-dashed border-border/70 bg-gradient-to-b from-secondary/50 to-background px-5 py-10 text-center transition-all duration-300 sm:px-10 sm:py-14",
          active && "border-primary/70 bg-primary/5 shadow-[0_20px_60px_-30px_var(--color-primary)]",
          busy && "cursor-progress",
        )}
        style={{ perspective: "1000px" }}
      >
        {/* soft glow */}
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 top-10 size-52 -translate-x-1/2 rounded-full bg-primary/15 blur-3xl transition-opacity duration-500",
            active ? "opacity-100" : "opacity-60",
          )}
        />

        {/* floating 3D document */}
        <div
          aria-hidden
          className="relative grid h-32 w-full place-items-center"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className={cn("pdf-float relative", active && "pdf-float-active")}
            style={{
              transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
              transformStyle: "preserve-3d",
              transition: "transform 300ms ease-out",
            }}
          >
            <div className="relative grid h-24 w-[4.5rem] place-items-center rounded-xl border border-primary/25 bg-card shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]">
              <span className="absolute right-0 top-0 size-5 rounded-bl-lg rounded-tr-xl bg-primary/15" />
              <div className="absolute inset-x-3 top-4 space-y-1.5">
                <span className="block h-1 rounded-full bg-primary/25" />
                <span className="block h-1 w-3/4 rounded-full bg-primary/20" />
                <span className="block h-1 w-1/2 rounded-full bg-primary/15" />
              </div>
              {phase === "thinking" ? (
                <Loader2 className="absolute bottom-3 size-6 animate-spin text-primary" />
              ) : (
                <FileText className="absolute bottom-3 size-6 text-primary" />
              )}
            </div>
            {/* orbiting particles */}
            <span className="pdf-orbit absolute left-1/2 top-1/2 size-32 -translate-x-1/2 -translate-y-1/2">
              <span className="absolute left-1/2 top-0 size-1.5 -translate-x-1/2 rounded-full bg-primary/70" />
              <span className="absolute bottom-0 left-1/2 size-1 -translate-x-1/2 rounded-full bg-primary/50" />
              <span className="absolute left-0 top-1/2 size-1 -translate-y-1/2 rounded-full bg-primary/40" />
            </span>
            {phase === "thinking" && (
              <span className="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 animate-spin rounded-full border-2 border-dashed border-primary/30" />
            )}
          </div>
        </div>

        <div className="relative space-y-1">
          <p className="font-display text-lg font-semibold">
            {phase === "reading" && "Reading your PDF…"}
            {phase === "uploading" && "Saving your file…"}
            {phase === "thinking" && "AI is detecting all units and topics…"}
            {phase === "idle" && "Upload your syllabus PDF"}
          </p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {busy
              ? (fileName ?? "Working on it…")
              : "Drag and drop your syllabus here and AI will organize it into subjects, units and topics."}
          </p>
        </div>

        {phase === "reading" ? (
          <Progress value={progress} className="relative h-1.5 w-48" />
        ) : (
          <Button type="button" className="relative rounded-full" disabled={busy}>
            Choose PDF File
          </Button>
        )}

        <p className="relative text-xs text-muted-foreground">PDF only • Up to 10 MB</p>

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

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            icon: BrainCircuit,
            title: "AI Syllabus Extraction",
            body: "Automatically extracts your syllabus",
          },
          {
            icon: ListTree,
            title: "Smart Unit Detection",
            body: "Detects Unit 1, Unit 2, Module 1 and more",
          },
          {
            icon: LayoutList,
            title: "Organized Topics",
            body: "Groups topics under the correct unit",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="group rounded-2xl border border-border/70 bg-card/70 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_16px_36px_-24px_rgba(0,0,0,0.6)]"
          >
            <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="mt-2.5 text-sm font-medium">{title}</p>
            <p className="text-xs text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      {preview && (
        <Card className="animate-in fade-in-50 slide-in-from-bottom-2 rounded-3xl duration-500">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
                <span className="truncate">
                  {unitCount} Unit{unitCount === 1 ? "" : "s"} • {topicCount} Topics
                </span>
              </CardTitle>
              <CardDescription>
                ~{totalHours}h of study · edit anything before adding it to your syllabus
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPreview(null)} aria-label="Discard breakdown">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[28rem] space-y-5 overflow-y-auto pr-1">
              {preview.subjects.map((subject, subjectIndex) => (
                <div key={`${subject.name}-${subjectIndex}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-sm font-semibold">{subject.name}</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full text-xs"
                      onClick={() => addUnit(subjectIndex)}
                    >
                      <Plus className="size-3.5" aria-hidden /> Add unit
                    </Button>
                  </div>
                  <Accordion type="multiple" className="mt-1.5">
                    {subject.units.map((unit, unitIndex) => {
                      const draftKey = `${subjectIndex}-${unitIndex}`;
                      const hours =
                        Math.round(unit.topics.reduce((h, t) => h + t.estimatedHours, 0) * 10) / 10;
                      return (
                        <AccordionItem
                          key={draftKey}
                          value={draftKey}
                          className="depth-card hover:depth-card-hover rise-in mb-2 rounded-2xl border border-border bg-card px-3 transition-transform duration-300 hover:-translate-y-0.5"
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
                          <AccordionContent className="space-y-3 pb-3">
                            <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
                              <Input
                                value={unit.unitNumber}
                                aria-label="Unit number"
                                onChange={(e) => {
                                  const value = e.target.value.slice(0, 40);
                                  editUnit(subjectIndex, unitIndex, (u) => {
                                    u.unitNumber = value;
                                  });
                                }}
                                className="h-9 rounded-full text-sm"
                              />
                              <Input
                                value={unit.unitTitle}
                                aria-label="Unit title"
                                onChange={(e) => {
                                  const value = e.target.value.slice(0, 140);
                                  editUnit(subjectIndex, unitIndex, (u) => {
                                    u.unitTitle = value;
                                  });
                                }}
                                className="h-9 rounded-full text-sm"
                              />
                            </div>

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

                            <div className="flex flex-wrap gap-2">
                              <Input
                                value={drafts[draftKey] ?? ""}
                                placeholder="Add a topic to this unit"
                                aria-label={`Add a topic to ${unit.unitNumber}`}
                                onChange={(e) =>
                                  setDrafts((d) => ({ ...d, [draftKey]: e.target.value.slice(0, 200) }))
                                }
                                className="h-9 min-w-40 flex-1 rounded-full text-sm"
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
