import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const STEPS = [
  { to: "/setup", label: "Syllabus" },
  { to: "/syllabus-review", label: "Topics" },
  { to: "/schedule", label: "Schedule" },
  { to: "/plan", label: "Timetable" },
] as const;

/** Four-step progress indicator for the syllabus → timetable workflow. */
export function StepNav({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((step, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={step.to} className="flex items-center gap-2">
            <Link
              to={step.to}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1.5 transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                  active ? "bg-primary-foreground/20" : "bg-foreground/10",
                )}
              >
                {n}
              </span>
              {step.label}
            </Link>
            {n < STEPS.length && <span className="text-muted-foreground/60">→</span>}
          </li>
        );
      })}
    </ol>
  );
}
