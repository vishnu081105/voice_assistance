import { describe, expect, it } from "vitest";
import { extractJsonBlock, normalizeGeminiReportObject } from "./geminiReportService.js";

describe("geminiReportService helpers", () => {
  it("extracts JSON from fenced Gemini responses", () => {
    const payload = extractJsonBlock(`
      \`\`\`json
      {
        "chief_complaint": "Fever",
        "symptoms": ["Fever"]
      }
      \`\`\`
    `);

    expect(payload).toEqual({
      chief_complaint: "Fever",
      symptoms: ["Fever"],
    });
  });

  it("normalizes medication and follow-up fields from Gemini output", () => {
    const normalized = normalizeGeminiReportObject({
      chief_complaint: "Fever",
      medications: [
        { name: "Paracetamol", dosage: "500 mg", frequency: "twice daily" },
        "ORS solution",
      ],
      follow_up_instructions: ["Return in 2 days"],
    });

    expect(normalized.chief_complaint).toBe("Fever");
    expect(normalized.medications).toEqual([
      { name: "Paracetamol", dosage: "500 mg", frequency: "twice daily" },
      { name: "ORS solution", dosage: "", frequency: "" },
    ]);
    expect(normalized.follow_up_instructions).toEqual(["Return in 2 days"]);
  });
});
