import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { unitsBySubject } from "@/lib/study/units";
import { useStudyState } from "@/lib/study/storage";

/**
 * Lets the student pick exactly which subjects / units the next timetable
 * should be built from. The choice lives in `state.planSelection`
 * (null = everything) so it stays with the generated plan.
 */
export function PlanSelector() {
  const { state, update } = useStudyState();
  const groups = useMemo(
    () => unitsBySubject(state.subjects, state.topics),
    [state.subjects, state.topics],
  );

  const allKeys = useMemo(
    () => groups.flatMap((g) => g.units.map((u) => u.key)),
    [groups],
  );

  const selected = state.planSelection ?? allKeys;
  const selectedSet = new Set(selected);

  const setSelection = (keys: string[]) =>
    update((prev) => ({ ...prev, planSelection: keys }));

  const toggleUnit = (key: string) =>
    setSelection(
      selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key],
    );

  const toggleSubject = (keys: string[], on: boolean) =>
    setSelection(
      on
        ? Array.from(new Set([...selected, ...keys]))
        : selected.filter((k) => !keys.includes(k)),
    );

  if (groups.length === 0) return null;

  return (
    <Card className="rounded-3xl">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">Select subjects / units to study</CardTitle>
          <CardDescription>
            {selected.length} of {allKeys.length} units will be scheduled.
          </CardDescription>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => setSelection(allKeys)}
          >
            Select all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full"
            onClick={() => setSelection([])}
          >
            Deselect all
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {groups.map(({ subject, units }) => {
          const keys = units.map((u) => u.key);
          const allOn = keys.every((k) => selectedSet.has(k));
          const someOn = !allOn && keys.some((k) => selectedSet.has(k));
          return (
            <div key={subject.id} className="rounded-2xl border border-border p-3">
              <label className="flex items-center gap-2 font-medium">
                <Checkbox
                  checked={allOn ? true : someOn ? "indeterminate" : false}
                  onCheckedChange={(v) => toggleSubject(keys, v !== false)}
                  aria-label={`Select all units of ${subject.name}`}
                />
                <span className="truncate">{subject.name}</span>
              </label>
              <ul className="mt-2 space-y-1.5 pl-6">
                {units.map((unit) => (
                  <li key={unit.key}>
                    <label className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        checked={selectedSet.has(unit.key)}
                        onCheckedChange={() => toggleUnit(unit.key)}
                        aria-label={`Select ${unit.label}`}
                      />
                      <span>
                        {unit.label}
                        <span className="ml-1 text-xs">({unit.topics.length} topics)</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
