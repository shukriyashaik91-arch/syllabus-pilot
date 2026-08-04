import { uid } from "./storage";
import type { Difficulty, Subject, Topic } from "./types";

/**
 * Lightweight syllabus parser.
 *
 * Understands the common shapes students paste:
 *   Subject: Data Structures        | # Data Structures
 *   Unit 1: Linear Structures       | ## Linear structures
 *   - Arrays and strings            | 1. Arrays and strings
 *
 * Anything not matching a subject/unit marker becomes a topic of the
 * current unit (or "General" when no unit was declared).
 */
export function parseSyllabus(
  text: string,
  existingSubjects: Subject[],
): { subjects: Subject[]; topics: Topic[] } {
  const subjects: Subject[] = [];
  const topics: Topic[] = [];

  let currentSubject: Subject | null = null;
  let currentUnit = "General";

  const nextColor = () => ((existingSubjects.length + subjects.length) % 5) + 1;

  const ensureSubject = (name: string) => {
    const found = [...existingSubjects, ...subjects].find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    if (found) {
      currentSubject = found;
      return;
    }
    const created: Subject = { id: uid("sub"), name, colorIndex: nextColor() };
    subjects.push(created);
    currentSubject = created;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const subjectMatch =
      /^(?:#\s+|subject\s*[:\-]\s*|paper\s*[:\-]\s*)(.+)$/i.exec(line);
    if (subjectMatch?.[1]) {
      ensureSubject(subjectMatch[1].trim());
      currentUnit = "General";
      continue;
    }

    const unitMatch =
      /^(?:##\s+|unit\s*[-\s]?\d*\s*[:\-.]?\s*|module\s*[-\s]?\d*\s*[:\-.]?\s*|chapter\s*[-\s]?\d*\s*[:\-.]?\s*)(.+)$/i.exec(
        line,
      );
    if (unitMatch?.[1]) {
      if (!currentSubject) ensureSubject("General Studies");
      currentUnit = unitMatch[1].trim();
      continue;
    }

    if (!currentSubject) ensureSubject("General Studies");
    const name = line.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "").trim();
    if (!name) continue;

    topics.push({
      id: uid("top"),
      subjectId: currentSubject!.id,
      unit: currentUnit,
      name,
      estimatedHours: estimateHours(name),
      difficulty: guessDifficulty(name),
      status: "pending",
    });
  }

  return { subjects, topics };
}

/** Longer / concept-heavy topic titles get a bigger time budget. */
function estimateHours(name: string): number {
  const words = name.split(/\s+/).length;
  if (words <= 3) return 1;
  if (words <= 6) return 1.5;
  return 2;
}

const HARD_HINTS = /(algorithm|proof|dynamic|advanced|theorem|optimi|complex|derivat|integrat|thermo|quantum)/i;
const EASY_HINTS = /(introduction|overview|basics|history|definition|intro\b)/i;

function guessDifficulty(name: string): Difficulty {
  if (HARD_HINTS.test(name)) return "hard";
  if (EASY_HINTS.test(name)) return "easy";
  return "medium";
}
