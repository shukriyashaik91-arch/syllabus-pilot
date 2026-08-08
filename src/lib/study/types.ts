/**
 * Core domain types for the study planner.
 *
 * The whole study workspace is one JSON document. It is written to
 * localStorage instantly and mirrored to the signed-in user's cloud row.
 */

export type Difficulty = "easy" | "medium" | "hard";
export type TopicStatus = "pending" | "in_progress" | "done";
export type SessionKind = "study" | "revision" | "practice" | "buffer";
export type ThemeChoice = "light" | "dark" | "system";
export type Intensity = "relaxed" | "balanced" | "intense";

export interface Subject {
  id: string;
  name: string;
  /** Chart token index 1-5, used for consistent color coding. */
  colorIndex: number;
}

export interface Topic {
  id: string;
  subjectId: string;
  /** Unit title, e.g. "Introduction to Cloud Computing". */
  unit: string;
  /** Unit label as printed in the syllabus, e.g. "Unit 1". */
  unitNumber?: string;
  /** Position of the unit in the syllabus (1-based) — drives study order. */
  unitOrder?: number;
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
  /** Weekday indices (0 = Sunday) the student is willing to study on. */
  studyDays: number[];
  intensity: Intensity;
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
  /** Clock time the block starts, e.g. "18:00". */
  startTime?: string;
}

export interface Milestone {
  id: string;
  label: string;
  /** ISO date the milestone should be reached by. */
  date: string;
  subjectId: string | null;
}

export interface SyllabusFile {
  id: string;
  name: string;
  /** Path inside the private `syllabi` storage bucket. */
  path: string;
  size: number;
  uploadedAt: string;
}

export interface NotificationPrefs {
  sessionReminders: boolean;
  examAlerts: boolean;
  revisionNudges: boolean;
  motivation: boolean;
}

export interface AppSettings {
  theme: ThemeChoice;
  displayName: string;
  notifications: NotificationPrefs;
}

export interface StudyState {
  subjects: Subject[];
  topics: Topic[];
  exams: Exam[];
  availability: Availability;
  plan: PlanSession[];
  milestones: Milestone[];
  files: SyllabusFile[];
  settings: AppSettings;
  /** Short AI-written strategy notes shown on the dashboard. */
  coachNotes: string[];
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
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  intensity: "balanced",
  weakSubjectIds: [],
};

export const defaultSettings: AppSettings = {
  theme: "system",
  displayName: "",
  notifications: {
    sessionReminders: true,
    examAlerts: true,
    revisionNudges: true,
    motivation: true,
  },
};

export const emptyState: StudyState = {
  subjects: [],
  topics: [],
  exams: [],
  availability: defaultAvailability,
  plan: [],
  milestones: [],
  files: [],
  settings: defaultSettings,
  coachNotes: [],
  planGeneratedAt: null,
  activeDays: [],
};

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
