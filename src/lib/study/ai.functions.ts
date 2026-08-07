import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AI syllabus understanding.
 *
 * The model turns messy syllabus text (typed or extracted from a PDF) into a
 * clean subject → unit → topic tree with realistic hour estimates and a
 * difficulty rating, plus a few coaching notes. The deterministic scheduler in
 * planner.ts then turns that tree into a day-by-day timetable, so the AI never
 * over-books the student's available hours.
 */

const InputSchema = z.object({
  text: z.string().min(20).max(60000),
  hoursPerDay: z.number().min(0.5).max(16),
  daysPerWeek: z.number().min(1).max(7),
  level: z.enum(["easy", "medium", "hard"]),
  examDate: z.string().nullable(),
});

export interface AiTopic {
  unit: string;
  name: string;
  estimatedHours: number;
  difficulty: "easy" | "medium" | "hard";
}

export interface AiSubject {
  name: string;
  topics: AiTopic[];
}

export interface AiSyllabus {
  subjects: AiSubject[];
  notes: string[];
}

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["subjects", "notes"],
  properties: {
    subjects: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "topics"],
        properties: {
          name: { type: "string" },
          topics: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["unit", "name", "estimatedHours", "difficulty"],
              properties: {
                unit: { type: "string" },
                name: { type: "string" },
                estimatedHours: { type: "number" },
                difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
              },
            },
          },
        },
      },
    },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

export const extractSyllabusWithAi = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<AiSyllabus> => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured for this project.");

    const instruction = [
      "You are an expert academic study coach.",
      "Read the syllabus below and return a clean, structured breakdown as json.",
      "Rules:",
      "- Group content into subjects, then units, then individual study topics.",
      "- A topic must be small enough to study in one sitting (0.5 to 3 hours).",
      "- Split anything larger into several topics.",
      "- estimatedHours must reflect real study effort for this student's level.",
      "- Ignore administrative text (marks distribution, textbooks, attendance rules).",
      `- The student studies about ${data.hoursPerDay} hours a day, ${data.daysPerWeek} days a week, and rates themselves as ${data.level} on this material.`,
      data.examDate ? `- Their exam is on ${data.examDate}.` : "- No exam date was given.",
      "- notes: 2 to 4 short, specific pieces of strategy advice for this syllabus (max 140 characters each).",
      "",
      "SYLLABUS:",
      data.text.slice(0, 60000),
    ].join("\n");

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
        text: {
          format: {
            type: "json_schema",
            name: "syllabus_breakdown",
            strict: true,
            schema: RESPONSE_SCHEMA,
          },
        },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      if (res.status === 429) throw new Error("AI is busy right now — please retry in a moment.");
      if (res.status === 402) throw new Error("AI credits are exhausted for this workspace.");
      throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 200)}`);
    }

    // The Responses API always streams; accumulate the output text deltas.
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
          if (event.type === "response.output_text.delta" && event.delta) {
            output += event.delta;
          } else if (event.type === "response.completed" && event.response?.output_text) {
            if (!output) output = event.response.output_text;
          }
        } catch {
          /* ignore keep-alive and partial frames */
        }
      }
    }

    if (!output.trim()) throw new Error("The AI returned an empty response. Try again.");

    let parsed: AiSyllabus;
    try {
      parsed = JSON.parse(output) as AiSyllabus;
    } catch {
      throw new Error("The AI response could not be read. Try again.");
    }

    const subjects = (parsed.subjects ?? [])
      .filter((s) => s?.name && Array.isArray(s.topics))
      .map((s) => ({
        name: String(s.name).slice(0, 120),
        topics: s.topics
          .filter((t) => t?.name)
          .map((t) => ({
            unit: String(t.unit || "General").slice(0, 120),
            name: String(t.name).slice(0, 200),
            estimatedHours: Math.min(4, Math.max(0.5, Number(t.estimatedHours) || 1)),
            difficulty: (["easy", "medium", "hard"] as const).includes(t.difficulty)
              ? t.difficulty
              : "medium",
          })),
      }))
      .filter((s) => s.topics.length > 0);

    if (subjects.length === 0) {
      throw new Error("No study topics could be found in that syllabus.");
    }

    return { subjects, notes: (parsed.notes ?? []).slice(0, 4).map(String) };
  });
