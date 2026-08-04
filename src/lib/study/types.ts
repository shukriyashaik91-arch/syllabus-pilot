/**
 * Core domain types for the study planner.
 * Everything is stored locally (browser) for now — see storage.ts.
 */

export type Difficulty = "easy" | "medium" | "hard";
export type TopicStatus = "pending" | "in_progress" | "done";
export type SessionKind = "study" | "revision" | "practice" | "buffer";

export interface Subject {
  id: string;
  name: string;
  /** Chart token index 1-5, used for consistent color coding. */
  colorIndex: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  unit: string;
  name: string;
  /** Estimated focused hours needed to cover the topic. */
  estimatedHours: number;
  difficulty: Difficulty;
  status: TopicStatus;
}

export interface Exam {
  id: string;
  name: string;
  subjectId: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  difficulty: Difficulty;
  /** 1 (low) – 5 (critical). */
  priority: number;
  /** Percentage weightage in the final grade. */
  weightage: number;
}

export interface Availability {
  hoursPerDay: number;
  weekendHoursPerDay: number;
  preferredTime: "morning" | "afternoon" | "evening" | "night";
  breakMinutes: number;
  studyWeekends: boolean;
  weakSubjectIds: string[];
}

export interface PlanSession {
  id: string;
  /** ISO date (yyyy-mm-dd). */
  date: string;
  subjectId: string;
  topicId: string | null;
  title: string;
  hours: number;
  kind: SessionKind;
  done: boolean;
}

export interface StudyState {
  subjects: Subject[];
  topics: Topic[];
  exams: Exam[];
  availability: Availability;
  plan: PlanSession[];
  /** ISO timestamp of the last plan generation. */
  planGeneratedAt: string | null;
  /** ISO dates on which at least one session was completed. */
  activeDays: string[];
}

export const defaultAvailability: Availability = {
  hoursPerDay: 3,
  weekendHoursPerDay: 5,
  preferredTime: "evening",
  breakMinutes: 10,
  studyWeekends: true,
  weakSubjectIds: [],
};

export const emptyState: StudyState = {
  subjects: [],
  topics: [],
  exams: [],
  availability: defaultAvailability,
  plan: [],
  planGeneratedAt: null,
  activeDays: [],
};
