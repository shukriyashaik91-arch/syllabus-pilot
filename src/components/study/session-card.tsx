import { Check, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlanSession, Subject } from "@/lib/study/types";
import { subjectColor, subjectName } from "@/lib/study/planner";

const KIND_LABEL: Record<PlanSession["kind"], string> = {
  study: "Study",
  revision: "Revision",
  practice: "Practice",
  buffer: "Buffer",
};

interface SessionCardProps {
  session: PlanSession;
  subjects: Subject[];
  onToggle: (id: string) => void;
}

/** One scheduled block in the timetable, with a completion toggle. */
export function SessionCard({ session, subjects, onToggle }: SessionCardProps) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition-opacity sm:p-4",
        session.done && "opacity-60",
      )}
    >
      <span
        aria-hidden
        className="h-10 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: subjectColor(subjects, session.subjectId) }}
      />
      <div className="min-w-0 flex-1">
        <p className={cn("truncate font-medium", session.done && "line-through")}>
          {session.title}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{subjectName(subjects, session.subjectId)}</span>
          <span aria-hidden>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" aria-hidden />
            {session.hours}h
          </span>
          <Badge variant="secondary" className="rounded-full text-[10px]">
            {KIND_LABEL[session.kind]}
          </Badge>
        </div>

      </div>
      <Button
        size="sm"
        variant={session.done ? "secondary" : "default"}
        onClick={() => onToggle(session.id)}
        className="rounded-full"
      >
        <Check className="size-4" aria-hidden />
        <span className="hidden sm:inline">{session.done ? "Done" : "Mark done"}</span>
      </Button>
    </li>
  );
}
