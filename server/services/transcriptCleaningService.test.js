import { describe, expect, it } from "vitest";
import { transcriptCleaningService } from "./transcriptCleaningService.js";

describe("transcriptCleaningService", () => {
  it("removes silence tokens and normalizes duplicated content", () => {
    const text = transcriptCleaningService.cleanTranscript(`
      UNKNOWN: [silence] fever fever fever
      UNKNOWN: fever fever fever
      <|nospeech|> The patient has cough ,and cold..
    `);

    expect(text).toContain("fever");
    expect(text).toContain("The patient has cough, and cold.");
    expect(text).not.toContain("silence");
    expect(text.split("\n")).toHaveLength(2);
  });

  it("deduplicates repeated adjacent entries", () => {
    const entries = transcriptCleaningService.cleanTranscriptEntries([
      {
        speaker: "Unknown",
        text: "Patient has cough",
        start_time: "00:00:00",
        end_time: "00:00:02",
      },
      {
        speaker: "Unknown",
        text: "Patient has cough",
        start_time: "00:00:02",
        end_time: "00:00:04",
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].end_time).toBe("00:00:04");
  });

  it("removes repeated phrase hallucinations inside a single segment", () => {
    const text = transcriptCleaningService.cleanTranscript(
      "Doctor: take paracetamol twice daily take paracetamol twice daily after food"
    );

    expect(text).toBe("take paracetamol twice daily after food");
  });
});
