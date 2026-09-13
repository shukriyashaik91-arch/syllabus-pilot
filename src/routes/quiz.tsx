import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrainCircuit, FileQuestion, Loader2, Sparkles, Target } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/study/app-shell";
import { QuizRunner } from "@/components/study/quiz-runner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";
import { useStudyState } from "@/lib/study/storage";
import { uid } from "@/lib/study/storage";
import { masteryByTopic, scheduleWeakTopicRevision } from "@/lib/study/quiz";
import { generateExamQuestionsWithAi } from "@/lib/study/quiz.functions";
import type { ExamQuestion, QuizAttempt } from "@/lib/study/types";

export const Route = createFileRoute("/quiz")({
  head: () => ({
    meta: [
      { title: "Quiz & practice questions — Studyloop" },
      {
        name: "description",
        content:
          "Test what you studied with AI quizzes, track weak and strong topics, and build a 2, 5 and 10 mark question bank for your exam.",
      },
      { property: "og:title", content: "Quiz & practice questions — Studyloop" },
      {
        property: "og:description",
        content: "AI quizzes after every session, plus exam-style questions built from your syllabus.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: QuizPage,
});

const MARKS = [2, 5, 10] as const;

function QuizPage() {
  const { state, update, hydrated } = useStudyState();
  const [mockOpen, setMockOpen] = useState(false);
  const [mockSubject, setMockSubject] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const mastery = useMemo(() => masteryByTopic(state.quizAttempts), [state.quizAttempts]);
  const attempts = [...state.quizAttempts].reverse();
  const studied = state.topics.filter((t) => t.status !== "pending");

  const saveAttempt = (attempt: QuizAttempt) => {
    update((prev) =>
      scheduleWeakTopicRevision(
        { ...prev, quizAttempts: [...prev.quizAttempts, attempt] },
        attempt,
      ),
    );
    toast.success(`Quiz saved — ${attempt.score}/${attempt.total}`);
  };

  const buildQuestions = async (subjectId: string, marks: 2 | 5 | 10) => {
    const subject = state.subjects.find((s) => s.id === subjectId);
    const topics = studied.filter((t) => t.subjectId === subjectId);
    const pool = topics.length > 0 ? topics : state.topics.filter((t) => t.subjectId === subjectId);
    if (!subject || pool.length === 0) {
      toast.error("Add a syllabus for this subject first.");
      return;
    }
    setBusy(`${subjectId}-${marks}`);
    try {
      const generated = await generateExamQuestionsWithAi({
        data: {
          subjectName: subject.name,
          topics: pool.slice(0, 12).map((t) => t.name),
          marks,
          count: marks === 2 ? 6 : marks === 5 ? 4 : 2,
        },
      });
      const created: ExamQuestion[] = generated.map((q) => ({
        id: uid("eq"),
        subjectId,
        topicName: q.topic,
        marks,
        question: q.question,
        answer: q.answer,
        createdAt: new Date().toISOString(),
      }));
      update((prev) => ({ ...prev, questionBank: [...created, ...prev.questionBank] }));
      toast.success(`${created.length} ${marks}-mark questions added.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate questions.");
    } finally {
      setBusy(null);
    }
  };

  if (!hydrated) {
    return (
      <AppShell>
        <div className="h-64 animate-pulse rounded-3xl bg-secondary" />
      </AppShell>
    );
  }

  const totalAsked = mastery.reduce((sum, m) => sum + m.asked, 0);
  const totalCorrect = mastery.reduce((sum, m) => sum + m.correct, 0);
  const accuracy = totalAsked ? Math.round((totalCorrect / totalAsked) * 100) : 0;

  return (
    <AppShell>
      <div className="rounded-3xl border border-border bg-card p-6">
        <h1 className="flex items-center gap-2 text-3xl sm:text-4xl">
          <Target className="size-7 text-accent" aria-hidden /> Quiz &amp; practice
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Test what you've studied, see which topics need work, and build exam-style questions.
        </p>
      </div>

      {state.topics.length === 0 ? (
        <Card className="mt-6 rounded-3xl">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <BrainCircuit className="size-8 text-accent" aria-hidden />
            <p className="max-w-sm text-sm text-muted-foreground">
              Add your syllabus first — quizzes are built from the topics you study.
            </p>
            <Button asChild className="rounded-full">
              <Link to="/setup">Add syllabus</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Card className="depth-card rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base">Mock test</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  A timed 10-question mixed test across everything you've studied in a subject —
                  10 minutes on the clock.
                </p>
                <div className="flex flex-wrap gap-2">
                  {state.subjects.map((subject) => (
                    <Button
                      key={subject.id}
                      variant="outline"
                      className="press rounded-full"
                      onClick={() => {
                        setMockSubject(subject.id);
                        setMockOpen(true);
                      }}
                    >
                      <Sparkles className="size-4" aria-hidden /> {subject.name}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="depth-card rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base">Exam question bank</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {state.subjects.map((subject) => (
                  <div key={subject.id} className="rounded-2xl border border-border p-3">
                    <p className="font-medium">{subject.name}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {MARKS.map((marks) => (
                        <Button
                          key={marks}
                          size="sm"
                          variant="secondary"
                          className="press rounded-full"
                          disabled={busy !== null}
                          onClick={() => void buildQuestions(subject.id, marks)}
                        >
                          {busy === `${subject.id}-${marks}` ? (
                            <Loader2 className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <FileQuestion className="size-3.5" aria-hidden />
                          )}
                          {marks}-mark questions
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}

                {state.questionBank.length > 0 ? (
                  <Accordion type="multiple" className="w-full">
                    {state.questionBank.slice(0, 40).map((q) => (
                      <AccordionItem key={q.id} value={q.id}>
                        <AccordionTrigger className="text-left text-sm">
                          <span className="flex items-start gap-2">
                            <Badge variant="secondary" className="rounded-full">
                              {q.marks}m
                            </Badge>
                            {q.question}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                          {q.answer}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No saved questions yet. Generate a set above.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="depth-card rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base">Your performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-3xl font-semibold">{accuracy}%</p>
                  <p className="text-xs text-muted-foreground">
                    {totalCorrect} correct out of {totalAsked} questions
                  </p>
                  <Progress value={accuracy} className="mt-2 h-1.5" />
                </div>
                {mastery.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Take a quiz after a study session to see your strong and weak topics.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {mastery.slice(0, 10).map((m) => (
                      <li key={`${m.subjectId}-${m.topicName}`} className="text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{m.topicName}</span>
                          <Badge
                            variant={m.status === "strong" ? "secondary" : "outline"}
                            className="rounded-full text-[10px] capitalize"
                          >
                            {m.status}
                          </Badge>
                        </div>
                        <Progress value={m.accuracy * 100} className="mt-1 h-1" />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="depth-card rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base">Recent quizzes</CardTitle>
              </CardHeader>
              <CardContent>
                {attempts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No quizzes taken yet.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {attempts.slice(0, 8).map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-muted-foreground">
                          {new Date(a.createdAt).toLocaleDateString()} ·{" "}
                          {a.topicNames.slice(0, 2).join(", ")}
                        </span>
                        <span className="font-medium">
                          {a.score}/{a.total}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {mockSubject ? (
        <QuizRunner
          open={mockOpen}
          onOpenChange={setMockOpen}
          state={state}
          subjectId={mockSubject}
          topics={(studied.length > 0 ? studied : state.topics)
            .filter((t) => t.subjectId === mockSubject)
            .slice(0, 12)}
          sessionId={null}
          kind="mock"
          timeLimitMinutes={10}
          onFinish={saveAttempt}
        />
      ) : null}
    </AppShell>
  );
}
