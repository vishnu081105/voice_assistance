import { describe, expect, it } from "vitest";
import { reportService } from "./reportService.js";

describe("reportService", () => {
  it("generates structured reports from corrected transcript content", async () => {
    const report = await reportService.generateReport({
      transcription: `
        Patient: I have fever and cough for three days.
        Doctor: This looks like bronchities.
        Doctor: Start paracetmol 500 mg twice daily and follow-up in 2 days.
      `,
      reportType: "general",
    });

    expect(report.report_content).toContain("Patient Information");
    expect(report.report_content).toContain("Chief Complaint");
    expect(report.report_content).toContain("Follow-up Instructions");
    expect(report.diagnosis.toLowerCase()).toContain("bronchitis");
    expect(report.medications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.stringMatching(/paracetamol/i),
        }),
      ])
    );
  });
});
