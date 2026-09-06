import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { uid } from "@/lib/study/storage";
import { generateQuizWithAi } from "@/lib/study/quiz.functions";
import { scoreLabel } from "@/lib/study/quiz";
import type { QuizAttempt, QuizQuestion, StudyState, Topic } from "@/lib/study/types";

interface QuizRunnerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: StudyState;
  subjectId: string;
  topics: Topic[];
  sessionId: string | null;
  kind: "session" | "mock";
  /** Called once the student finishes and the attempt is ready to store. */
  onFinish: (attempt: QuizAttempt) => void;
}

type Phase = "intro" | "loading" | "quiz" | "result";

/** Generates and runs an MCQ quiz over the topics just studied. */
export function QuizRunner({
  open,
  onOpenChange,
  state,
  subjectId,
  topics,
  sessionId,
  kind,
  onFinish,
}: QuizRunnerProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);

  const topicNames = topics.map((t) => t.name);
  const subjectName = state.subjects.find((s) => s.id === subjectId)?.name ?? "This subject";

  const reset = () => {
    setPhase("intro");
    setQuestions([]);
    setAnswers({});
    setIndex(0);
    setAttempt(null);
  };

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) reset();
  };

  const start = async () => {
    if (topicNames.length === 0) {
      toast.error("No topics found for this session.");
      return;
    }
    setPhase("loading");
    try {
      const asked = state.quizAttempts
        .flatMap((a) => a.questions.map((q) => q.question))
        .slice(-30);
      const generated = await generateQuizWithAi({
        data: {
          subjectName,
          topics: topicNames.slice(0, 12),
          count: kind === "mock" ? 10 : Math.min(8, Math.max(5, topicNames.length * 2)),
          level: topics[0]?.difficulty ?? "medium",
          avoid: asked,
        },
      });
      if (generated.length === 0) throw new Error("No questions were generated.");
      setQuestions(
        generated.map((q) => ({
          id: uid("q"),
          topicId: topics.find((t) => t.name === q.topic)?.id ?? topics[0]?.id ?? null,
          topicName: q.topic,
          subjectId,
          question: q.question,
          options: q.options,
          answerIndex: q.answerIndex,
          explanation: q.explanation,
          difficulty: q.difficulty,
        })),
      );
      setPhase("quiz");
    } catch (error) {
      setPhase("intro");
      toast.error(error instanceof Error ? error.message : "Could not build your quiz.");
    }
  };

  const submit = () => {
    const score = questions.filter((q) => answers[q.id] === q.answerIndex).length;
    const weak = Array.from(
      new Set(questions.filter((q) => answers[q.id] !== q.answerIndex).map((q) => q.topicName)),
    );
    const result: QuizAttempt = {
      id: uid("quiz"),
      sessionId,
      createdAt: new Date().toISOString(),
      subjectId,
      topicNames,
      questions,
      answers,
      score,
      total: questions.length,
      weakTopics: weak,
      kind,
    };
    setAttempt(result);
    setPhase("result");
    onFinish(result);
  };

  const current = questions[index];
  const answeredCount = Object.keys(answers).length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto rounded-3xl">
        {phase === "intro" || phase === "loading" ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-2xl">
                🎯 Test your knowledge
              </DialogTitle>
              <DialogDescription>
                {kind === "mock"
                  ? "A mixed mock test across everything you've studied so far."
                  : "You've completed this session. Test yourself on what you just studied!"}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-2xl border border-border bg-secondary/40 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Topics covered
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {topicNames.map((name) => (
                  <Badge key={name} variant="secondary" className="rounded-full">
                    {name}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" className="rounded-full" onClick={() => close(false)}>
                Skip for now
              </Button>
              <Button className="press rounded-full" onClick={() => void start()} disabled={phase === "loading"}>
                {phase === "loading" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden /> Building your quiz…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden /> Start quiz
                  </>
                )}
              </Button>
            </div>
          </>
        ) : null}

        {phase === "quiz" && current ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg">
                Question {index + 1} of {questions.length}
              </DialogTitle>
              <DialogDescription>{current.topicName}</DialogDescription>
            </DialogHeader>
            <Progress value={((index + 1) / questions.length) * 100} className="h-1.5" />
            <p className="text-base font-medium">{current.question}</p>
            <div className="space-y-2">
              {current.options.map((option, i) => {
                const chosen = answers[current.id] === i;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: i }))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl border p-3 text-left text-sm transition-all hover:-translate-y-0.5",
                      chosen
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border bg-card hover:bg-secondary",
                    )}
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-border text-xs">
                      {String.fromCharCode(65 + i)}
                    </span>
                    {option}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                className="rounded-full"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ChevronLeft className="size-4" aria-hidden /> Previous
              </Button>
              {index === questions.length - 1 ? (
                <Button
                  className="press rounded-full"
                  onClick={submit}
                  disabled={answeredCount < questions.length}
                >
                  Submit quiz
                </Button>
              ) : (
                <Button
                  className="press rounded-full"
                  onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
                >
                  Next <ChevronRight className="size-4" aria-hidden />
                </Button>
              )}
            </div>
          </>
        ) : null}

        {phase === "result" && attempt ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">
                You scored {attempt.score} / {attempt.total}
              </DialogTitle>
              <DialogDescription>{scoreLabel(attempt.score, attempt.total)}</DialogDescription>
            </DialogHeader>
            {attempt.weakTopics.length > 0 ? (
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-sm font-medium">Topics to revisit</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {attempt.weakTopics.map((name) => (
                    <Badge key={name} variant="outline" className="rounded-full">
                      {name}
                    </Badge>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Extra revision blocks have been added to your timetable.
                </p>
              </div>
            ) : null}
            <ul className="space-y-3">
              {attempt.questions.map((q, i) => {
                const chosen = attempt.answers[q.id];
                const correct = chosen === q.answerIndex;
                return (
                  <li key={q.id} className="rounded-2xl border border-border p-3">
                    <p className="flex items-start gap-2 text-sm font-medium">
                      {correct ? (
                        <Check className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                      ) : (
                        <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                      )}
                      {i + 1}. {q.question}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Correct answer: {q.options[q.answerIndex]}
                      {!correct && chosen !== undefined ? ` · You chose: ${q.options[chosen]}` : ""}
                    </p>
                    <p className="mt-1 text-xs">{q.explanation}</p>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end">
              <Button className="press rounded-full" onClick={() => close(false)}>
                Done
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
