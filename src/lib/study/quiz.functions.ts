import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AI quiz + exam question generation.
 *
 * Questions are always generated from the exact topic names the student just
 * studied, never from the whole syllabus, so a quiz tests today's work only.
 */

const QuizInput = z.object({
  subjectName: z.string().min(1).max(160),
  topics: z.array(z.string().min(1).max(200)).min(1).max(12),
  count: z.number().min(3).max(20),
  level: z.enum(["easy", "medium", "hard"]),
  /** Question texts already asked before, so the model avoids repeats. */
  avoid: z.array(z.string().max(300)).max(40).optional(),
});

const ExamInput = z.object({
  subjectName: z.string().min(1).max(160),
  topics: z.array(z.string().min(1).max(200)).min(1).max(12),
  marks: z.union([z.literal(2), z.literal(5), z.literal(10)]),
  count: z.number().min(1).max(10),
});

export interface GeneratedMcq {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}

export interface GeneratedExamQuestion {
  question: string;
  answer: string;
  topic: string;
}

const MCQ_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "options", "answerIndex", "explanation", "difficulty", "topic"],
        properties: {
          question: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          answerIndex: { type: "number" },
          explanation: { type: "string" },
          difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
          topic: { type: "string" },
        },
      },
    },
  },
} as const;

const EXAM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer", "topic"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
          topic: { type: "string" },
        },
      },
    },
  },
} as const;

async function callGateway(instruction: string, schemaName: string, schema: unknown) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-5.6-sol",
      input: instruction,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI is busy right now — please retry in a moment.");
    if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
    throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (event.type === "response.output_text.delta" && event.delta) output += event.delta;
        else if (event.type === "response.completed" && event.response?.output_text && !output) {
          output = event.response.output_text;
        }
      } catch {
        /* keep-alive frame */
      }
    }
  }

  if (!output.trim()) throw new Error("The AI returned an empty response. Try again.");
  try {
    return JSON.parse(output) as Record<string, unknown>;
  } catch {
    throw new Error("The AI response could not be read. Try again.");
  }
}

export const generateQuizWithAi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => QuizInput.parse(input))
  .handler(async ({ data }): Promise<GeneratedMcq[]> => {
    const instruction = [
      "You write exam-style multiple-choice questions for a university student.",
      `Subject: ${data.subjectName}.`,
      "Test ONLY the topics listed below — never anything outside them.",
      `Topics:\n- ${data.topics.join("\n- ")}`,
      `Write exactly ${data.count} questions, spread evenly across those topics.`,
      `Overall difficulty: ${data.level}. Mix in a couple of easier and harder ones.`,
      "Each question has exactly 4 distinct options, one correct, and answerIndex is the 0-based index of the correct option.",
      "explanation: 1-2 sentences saying why the answer is right (max 240 characters).",
      "topic: copy the exact topic name from the list above that the question tests.",
      "No trick questions, no 'all of the above', no references to page numbers or figures.",
      data.avoid?.length
        ? `Do NOT repeat or paraphrase any of these previously asked questions:\n- ${data.avoid.join("\n- ")}`
        : "",
    ].join("\n");

    const parsed = await callGateway(instruction, "quiz_questions", MCQ_SCHEMA);
    const list = (parsed["questions"] as GeneratedMcq[] | undefined) ?? [];

    return list
      .filter((q) => q?.question && Array.isArray(q.options) && q.options.length >= 2)
      .map((q) => ({
        question: String(q.question).slice(0, 400),
        options: q.options.slice(0, 4).map((o) => String(o).slice(0, 200)),
        answerIndex: Math.min(Math.max(0, Number(q.answerIndex) || 0), q.options.length - 1),
        explanation: String(q.explanation ?? "").slice(0, 300),
        difficulty: (["easy", "medium", "hard"] as const).includes(q.difficulty)
          ? q.difficulty
          : "medium",
        topic: String(q.topic ?? data.topics[0]).slice(0, 200),
      }));
  });

export const generateExamQuestionsWithAi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ExamInput.parse(input))
  .handler(async ({ data }): Promise<GeneratedExamQuestion[]> => {
    const depth =
      data.marks === 2
        ? "short definition/one-liner answers, 2-3 sentences"
        : data.marks === 5
          ? "structured answers with key points, roughly 120-180 words"
          : "long essay answers with headings, examples and a diagram description where useful, roughly 300-400 words";

    const instruction = [
      "You are a university exam paper setter.",
      `Subject: ${data.subjectName}.`,
      `Write exactly ${data.count} ${data.marks}-mark questions covering ONLY these topics:\n- ${data.topics.join("\n- ")}`,
      `Answers should be ${depth}, written the way a student should write them in the exam.`,
      "Phrase questions the way real university papers do (Define…, Explain…, Compare…, Derive…, Discuss with an example…).",
      "topic: copy the exact topic name from the list above.",
    ].join("\n");

    const parsed = await callGateway(instruction, "exam_questions", EXAM_SCHEMA);
    const list = (parsed["questions"] as GeneratedExamQuestion[] | undefined) ?? [];

    return list
      .filter((q) => q?.question && q?.answer)
      .map((q) => ({
        question: String(q.question).slice(0, 600),
        answer: String(q.answer).slice(0, 4000),
        topic: String(q.topic ?? data.topics[0]).slice(0, 200),
      }));
  });
