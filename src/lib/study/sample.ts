import { uid } from "./storage";
import type { Exam, StudyState, Subject, Topic } from "./types";

/** A realistic starter dataset so the planner can be tried in one click. */
export function sampleData(): { subjects: Subject[]; topics: Topic[]; exams: Exam[] } {
  const dsa: Subject = { id: uid("sub"), name: "Data Structures", colorIndex: 1 };
  const dbms: Subject = { id: uid("sub"), name: "DBMS", colorIndex: 2 };
  const maths: Subject = { id: uid("sub"), name: "Discrete Maths", colorIndex: 3 };

  const t = (
    subject: Subject,
    unit: string,
    name: string,
    hours: number,
    difficulty: Topic["difficulty"],
  ): Topic => ({
    id: uid("top"),
    subjectId: subject.id,
    unit,
    name,
    estimatedHours: hours,
    difficulty,
    status: "pending",
  });

  const topics: Topic[] = [
    t(dsa, "Linear structures", "Arrays and strings", 1.5, "easy"),
    t(dsa, "Linear structures", "Linked lists", 2, "medium"),
    t(dsa, "Linear structures", "Stacks and queues", 1.5, "medium"),
    t(dsa, "Trees & graphs", "Binary search trees", 2, "hard"),
    t(dsa, "Trees & graphs", "Graph traversal algorithms", 2, "hard"),
    t(dbms, "Modelling", "ER model and normalisation", 2, "medium"),
    t(dbms, "Querying", "SQL joins and subqueries", 1.5, "medium"),
    t(dbms, "Transactions", "ACID and concurrency control", 2, "hard"),
    t(maths, "Logic", "Propositional logic", 1, "easy"),
    t(maths, "Combinatorics", "Permutations and combinations", 1.5, "medium"),
    t(maths, "Graph theory", "Graph colouring theorems", 2, "hard"),
  ];

  const inDays = (n: number) => {
    const d = new Date(Date.now() + n * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const exams: Exam[] = [
    { id: uid("exam"), name: "DSA Mid-term", subjectId: dsa.id, date: inDays(12), difficulty: "hard", priority: 5, weightage: 40 },
    { id: uid("exam"), name: "DBMS Unit test", subjectId: dbms.id, date: inDays(18), difficulty: "medium", priority: 3, weightage: 25 },
    { id: uid("exam"), name: "Maths Quiz", subjectId: maths.id, date: inDays(9), difficulty: "medium", priority: 4, weightage: 20 },
  ];

  return { subjects: [dsa, dbms, maths], topics, exams };
}

export function withSample(state: StudyState): StudyState {
  const { subjects, topics, exams } = sampleData();
  return { ...state, subjects, topics, exams, plan: [], planGeneratedAt: null };
}
