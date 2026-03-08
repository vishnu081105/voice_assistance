import { describe, expect, it } from "vitest";
import { medicalVocabularyService } from "./medicalVocabularyService.js";

describe("medicalVocabularyService", () => {
  it("corrects common medical spelling issues", () => {
    const result = medicalVocabularyService.correctText(
      "Patient has bronchities and was given paracetmol for fever."
    );

    expect(result.text).toContain("bronchitis");
    expect(result.text).toContain("paracetamol");
    expect(result.corrections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ original: "bronchities", corrected: "bronchitis" }),
        expect.objectContaining({ original: "paracetmol", corrected: "paracetamol" }),
      ])
    );
  });
});
