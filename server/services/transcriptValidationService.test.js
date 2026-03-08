import { describe, expect, it } from "vitest";
import { transcriptValidationService } from "./transcriptValidationService.js";

describe("transcriptValidationService", () => {
  it("flags low confidence transcripts and corrects medical vocabulary", async () => {
    const result = await transcriptValidationService.validateTranscriptEntries({
      transcriptEntries: [
        {
          speaker: "Patient",
          text: "I have fever for three years and wheesing.",
          start_time: "00:00:00",
          end_time: "00:00:05",
        },
        {
          speaker: "Doctor",
          text: "This sounds like bronchities. Take paracetmol 500 mg twice daily.",
          start_time: "00:00:05",
          end_time: "00:00:10",
        },
      ],
      confidenceScore: 0.2,
    });

    expect(result.lowConfidence).toBe(true);
    expect(result.reviewRequired).toBe(true);
    expect(result.correctedTranscriptText).toContain("bronchitis");
    expect(result.correctedTranscriptText).toContain("paracetamol");
    expect(result.correctedTranscriptText).toContain("wheezing");
    expect(result.validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "confidence" }),
        expect.objectContaining({ type: "context_validation" }),
      ])
    );
    expect(result.structuredData.symptoms).toContain("fever");
  });
});
