import { useRef, useState } from "react";
import { FileUp, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { extractPdfText, MAX_PDF_BYTES } from "@/lib/study/pdf";
import { extractSyllabusWithAi, type AiSyllabus } from "@/lib/study/ai.functions";
import { uid, useStudyState } from "@/lib/study/storage";
import type { Subject, Topic } from "@/lib/study/types";

type Phase = "idle" | "reading" | "uploading" | "thinking";

/** Drag-and-drop PDF upload → text extraction → AI structuring → preview → apply. */
export function SyllabusUpload({ onApplied }: { onApplied?: () => void }) {
  const { state, update } = useStudyState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<AiSyllabus | null>(null);

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
      setPreview(result);
      toast.success(`Read ${pages} page${pages === 1 ? "" : "s"} — review the breakdown below.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that PDF.");
    } finally {
      setPhase("idle");
      setProgress(0);
    }
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

      for (const t of aiSubject.topics) {
        topics.push({
          id: uid("top"),
          subjectId: subject.id,
          unit: t.unit,
          name: t.name,
          estimatedHours: t.estimatedHours,
          difficulty: t.difficulty,
          status: "pending",
        });
      }
    }

    update((prev) => ({
      ...prev,
      subjects: [...prev.subjects, ...subjects],
      topics: [...prev.topics, ...topics],
      coachNotes: preview.notes.length ? preview.notes : prev.coachNotes,
    }));
    setPreview(null);
    setFileName(null);
    toast.success(`Added ${topics.length} topics to your syllabus.`);
    onApplied?.();
  };

  const totalHours = preview
    ? Math.round(
        preview.subjects.reduce(
          (sum, s) => sum + s.topics.reduce((h, t) => h + t.estimatedHours, 0),
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
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <FileUp className="size-5" />}
        </span>
        <div>
          <p className="font-medium">
            {phase === "reading" && "Extracting text…"}
            {phase === "uploading" && "Saving your file…"}
            {phase === "thinking" && "AI is structuring your syllabus…"}
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
                <span className="truncate">AI breakdown</span>
              </CardTitle>
              <CardDescription>
                {preview.subjects.length} subject
                {preview.subjects.length === 1 ? "" : "s"} ·{" "}
                {preview.subjects.reduce((n, s) => n + s.topics.length, 0)} topics · ~{totalHours}h
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setPreview(null)} aria-label="Discard breakdown">
              <X className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
              {preview.subjects.map((subject) => (
                <div key={subject.name}>
                  <p className="font-display text-sm font-semibold">{subject.name}</p>
                  <ul className="mt-1 space-y-1">
                    {subject.topics.map((topic, i) => (
                      <li
                        key={`${subject.name}-${i}`}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-secondary/50 px-3 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate">
                          <span className="text-muted-foreground">{topic.unit} · </span>
                          {topic.name}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <Badge variant="outline" className="rounded-full text-[10px] capitalize">
                            {topic.difficulty}
                          </Badge>
                          <span className="text-xs text-muted-foreground">{topic.estimatedHours}h</span>
                        </span>
                      </li>
                    ))}
                  </ul>
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
