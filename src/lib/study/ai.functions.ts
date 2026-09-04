import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * AI syllabus understanding.
 *
 * The model reads messy syllabus text (typed or extracted from a PDF) and
 * returns a clean subject → unit → topic tree: units exactly as printed in the
 * syllabus, in their original order, with only meaningful study topics inside.
 * Administrative noise (course outcomes, textbooks, marks, faculty, page
 * numbers) is discarded. The deterministic scheduler in planner.ts then walks
 * the units in order and turns them into a day-by-day timetable.
 */

const InputSchema = z.object({
  text: z.string().min(20).max(60000),
  hoursPerDay: z.number().min(0.5).max(16),
  daysPerWeek: z.number().min(1).max(7),
  level: z.enum(["easy", "medium", "hard"]),
  examDate: z.string().nullable(),
  /** Optional second-pass hint listing unit headings found in the raw text. */
  hint: z.string().max(4000).optional(),
});

export interface AiTopic {
  name: string;
  estimatedHours: number;
  difficulty: "easy" | "medium" | "hard";
}

export interface AiUnit {
  /** Exactly as printed, e.g. "Unit 1", "UNIT-III", "Module 2". */
  unitNumber: string;
  unitTitle: string;
  topics: AiTopic[];
}

export interface AiSubject {
  name: string;
  units: AiUnit[];
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
        required: ["name", "units"],
        properties: {
          name: { type: "string" },
          units: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["unitNumber", "unitTitle", "topics"],
              properties: {
                unitNumber: { type: "string" },
                unitTitle: { type: "string" },
                topics: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["name", "estimatedHours", "difficulty"],
                    properties: {
                      name: { type: "string" },
                      estimatedHours: { type: "number" },
                      difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                    },
                  },
                },
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
      "You are an expert academic study coach reading a university syllabus.",
      "Return a structured unit-wise breakdown as json. Do NOT transcribe the document line by line.",
      "",
      "UNIT DETECTION",
      "- Detect every unit heading, in any style: 'Unit 1', 'Unit I', 'UNIT-I', 'Module 1', 'Chapter 1', 'Part A'.",
      "- unitNumber: the label exactly as printed (e.g. 'Unit 1', 'UNIT-III').",
      "- unitTitle: the unit's title only, without the number prefix. If none is printed, write a short 3-6 word title summarising the unit.",
      "- Keep units in exactly the order they appear in the document. Never merge or reorder units.",
      "- If the document has no unit headings at all, create sensible sequential units ('Unit 1', 'Unit 2', ...) from the major sections.",
      "",
      "TOPICS",
      "- Under each unit list ONLY the meaningful study topics that belong to that unit.",
      "- A topic split across several lines (wrapped text, hyphenation, a trailing comma) must be merged into ONE topic.",
      "- Do not emit sub-headings, numbering artefacts, or fragments as separate topics.",
      "- Aim for 4-10 topics per unit. Merge trivial fragments; split anything needing more than 3 hours.",
      "- estimatedHours: realistic focused study time, between 0.5 and 3 hours.",
      "",
      "IGNORE COMPLETELY",
      "- Course outcomes, course objectives, CO/PO mapping, prerequisites.",
      "- Textbooks, references, further reading, web resources.",
      "- Marks distribution, credits, contact hours, exam patterns, attendance rules.",
      "- University or department names, logos, faculty names, regulation codes, page numbers, headers and footers.",
      "",
      `STUDENT: studies about ${data.hoursPerDay} hours a day, ${data.daysPerWeek} days a week, and rates themselves as ${data.level} on this material.`,
      data.examDate ? `Their exam is on ${data.examDate}.` : "No exam date was given.",
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
      .filter((s) => s?.name && Array.isArray(s.units))
      .map((s) => ({
        name: String(s.name).slice(0, 120),
        units: s.units
          .filter((u) => u && Array.isArray(u.topics))
          .map((u, index) => ({
            unitNumber: String(u.unitNumber || `Unit ${index + 1}`).slice(0, 40),
            unitTitle: String(u.unitTitle || "Overview").slice(0, 140),
            topics: u.topics
              .filter((t) => t?.name)
              .map((t) => ({
                name: String(t.name).replace(/\s+/g, " ").trim().slice(0, 200),
                estimatedHours: Math.min(3, Math.max(0.5, Number(t.estimatedHours) || 1)),
                difficulty: (["easy", "medium", "hard"] as const).includes(t.difficulty)
                  ? t.difficulty
                  : "medium",
              })),
          }))
          .filter((u) => u.topics.length > 0),
      }))
      .filter((s) => s.units.length > 0);

    if (subjects.length === 0) {
      throw new Error("No study units could be found in that syllabus.");
    }

    return { subjects, notes: (parsed.notes ?? []).slice(0, 4).map(String) };
  });
