import { describe, expect, it } from "vitest";
import { structuredMedicalDataService } from "./structuredMedicalDataService.js";

describe("structuredMedicalDataService", () => {
  it("extracts symptoms, medications, durations, and vitals from transcript entries", async () => {
    const result = await structuredMedicalDataService.extractFromTranscriptEntries([
      {
        speaker: "Patient",
        text: "I have fever and cough for three days. My temperature is 101 F.",
        start_time: "00:00:00",
        end_time: "00:00:05",
      },
      {
        speaker: "Doctor",
        text: "Your blood pressure is 120/80. Start paracetamol 500 mg twice daily.",
        start_time: "00:00:05",
        end_time: "00:00:10",
      },
    ]);

    expect(result.symptoms).toEqual(expect.arrayContaining(["fever", "cough"]));
    expect(result.medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringMatching(/paracetamol/i),
          dosage: expect.stringMatching(/500 mg/i),
          frequency: expect.stringMatching(/twice daily/i),
        }),
      ])
    );
    expect(result.durations).toContain("three days");
    expect(result.vitals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "temperature", value: "101", unit: "F" }),
        expect.objectContaining({ name: "blood_pressure", value: "120/80", unit: "mmHg" }),
      ])
    );
  });
});
