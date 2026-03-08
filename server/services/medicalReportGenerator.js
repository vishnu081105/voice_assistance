function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeText(value, fallback = "") {
  const normalized = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || fallback;
}

function normalizeList(value, fallback = []) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items
    .map((item) => normalizeText(item))
    .filter(Boolean);
  return normalized.length > 0 ? [...new Set(normalized)] : fallback;
}

function normalizeMedicationList(value) {
  const items = Array.isArray(value) ? value : [];
  return items
    .map((item) => ({
      name: normalizeText(item?.name, "Medication"),
      dosage: normalizeText(item?.dosage, "Not specified"),
      frequency: normalizeText(item?.frequency, "Not specified"),
    }))
    .filter((item) => item.name);
}

function formatListHtml(items) {
  if (!Array.isArray(items) || items.length === 0) return "<li>Not available</li>";
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function formatMedicationList(medications) {
  if (!Array.isArray(medications) || medications.length === 0) {
    return "<li>No medications documented</li>";
  }
  return medications
    .map((med) => `<li>${escapeHtml(med.name)} - ${escapeHtml(med.dosage)} - ${escapeHtml(med.frequency)}</li>`)
    .join("");
}

function extractPatientTimeline(transcriptEntries) {
  const patientLines = (Array.isArray(transcriptEntries) ? transcriptEntries : [])
    .filter((entry) => entry?.speaker === "Patient")
    .map((entry) => normalizeText(entry?.text))
    .filter(Boolean);

  if (patientLines.length === 0) {
    return "Detailed symptom progression was not explicitly documented in the conversation.";
  }

  return patientLines.slice(0, 3).join(" ");
}

function buildDiscussionSummary(transcriptEntries) {
  if (!Array.isArray(transcriptEntries) || transcriptEntries.length === 0) {
    return "No conversation transcript available.";
  }

  const doctorTurns = transcriptEntries.filter((entry) => entry?.speaker === "Doctor").length;
  const patientTurns = transcriptEntries.filter((entry) => entry?.speaker === "Patient").length;
  const unknownTurns = transcriptEntries.length - doctorTurns - patientTurns;

  return [
    `Total conversation turns: ${transcriptEntries.length}.`,
    `Doctor turns: ${doctorTurns}.`,
    `Patient turns: ${patientTurns}.`,
    unknownTurns > 0 ? `Unlabeled turns: ${unknownTurns}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildPatientInformation(patientDetails = {}, doctorDetails = {}, reportType = "general") {
  return {
    patient_id: normalizeText(patientDetails?.patient_id),
    full_name: normalizeText(patientDetails?.full_name),
    age:
      Number.isFinite(Number(patientDetails?.age)) && patientDetails?.age !== ""
        ? Number(patientDetails.age)
        : null,
    gender: normalizeText(patientDetails?.gender),
    phone: normalizeText(patientDetails?.phone),
    address: normalizeText(patientDetails?.address),
    medical_history: normalizeText(patientDetails?.medical_history),
    allergies: normalizeText(patientDetails?.allergies),
    diagnosis_history: normalizeText(patientDetails?.diagnosis_history),
    doctor_id: normalizeText(doctorDetails?.doctor_id),
    doctor_name: normalizeText(doctorDetails?.doctor_name),
    report_type: normalizeText(reportType, "general"),
  };
}

function buildFallbackChiefComplaint(analysis, structuredData = {}) {
  const symptoms = normalizeList([...(analysis?.symptoms || []), ...(structuredData?.symptoms || [])]);
  if (symptoms.length > 0) {
    return symptoms.join(", ");
  }
  return "General clinical concerns discussed during the consultation.";
}

function buildFallbackAssessment(analysis, transcriptEntries) {
  const riskFlags = normalizeList(analysis?.risk_flags);
  const summary = buildDiscussionSummary(transcriptEntries);
  if (riskFlags.length > 0) {
    return `${summary} Risk flags noted: ${riskFlags.join(", ")}.`;
  }
  return summary;
}

function buildFallbackDiagnosis(analysis, structuredData = {}) {
  const diagnosis = normalizeList([...(analysis?.diagnosis || []), ...(structuredData?.diseases || [])]);
  return diagnosis.length > 0 ? diagnosis.join(", ") : "Clinical diagnosis not explicitly identified.";
}

function buildFallbackTreatmentPlan(analysis, structuredData = {}) {
  const medications = normalizeMedicationList(
    Array.isArray(analysis?.medications) && analysis.medications.length > 0
      ? analysis.medications
      : structuredData?.medications
  );
  const advice = normalizeList(analysis?.advice);
  const followUp = normalizeList(analysis?.follow_up);
  const sections = [
    medications.length > 0
      ? `Medications: ${medications.map((item) => `${item.name} ${item.dosage} ${item.frequency}`.trim()).join("; ")}`
      : null,
    advice.length > 0 ? `Instructions: ${advice.join("; ")}` : null,
    followUp.length > 0 ? `Follow-up: ${followUp.join("; ")}` : null,
  ].filter(Boolean);

  return sections.join("\n") || "Continue clinical evaluation and follow physician guidance.";
}

function buildFollowUpInstructions(analysis) {
  const combined = [
    ...normalizeList(analysis?.follow_up),
    ...normalizeList(analysis?.advice),
    ...normalizeList(analysis?.risk_flags).map((item) => `Monitor for ${item}`),
  ];
  return combined.length > 0 ? [...new Set(combined)] : ["Follow the clinician's guidance and monitor symptoms."];
}

function buildLegacySummary(chiefComplaint, assessment) {
  return normalizeText(`${chiefComplaint}. ${assessment}`.trim(), "Clinical consultation summary not available.");
}

export function buildReportContent(report) {
  const patientInformation = report?.patient_information || {};
  const patientInfoLines = [
    patientInformation.full_name ? `Patient Name: ${patientInformation.full_name}` : null,
    patientInformation.patient_id ? `Patient ID: ${patientInformation.patient_id}` : null,
    patientInformation.age !== null && patientInformation.age !== undefined ? `Age: ${patientInformation.age}` : null,
    patientInformation.gender ? `Gender: ${patientInformation.gender}` : null,
    patientInformation.phone ? `Phone: ${patientInformation.phone}` : null,
    patientInformation.address ? `Address: ${patientInformation.address}` : null,
    patientInformation.doctor_name ? `Doctor: ${patientInformation.doctor_name}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const medicationLines = normalizeMedicationList(report?.medications).map(
    (item) => `- ${item.name} | ${item.dosage} | ${item.frequency}`
  );
  const symptomLines = normalizeList(report?.symptoms).map((item) => `- ${item}`);
  const followUpLines = normalizeList(report?.follow_up_instructions).map((item) => `- ${item}`);

  return [
    "Patient Information",
    patientInfoLines || "No patient identifiers were provided.",
    "",
    "Chief Complaint",
    normalizeText(report?.chief_complaint, "Not documented."),
    "",
    "History of Present Illness",
    normalizeText(report?.history_of_present_illness, "Not documented."),
    "",
    "Symptoms",
    symptomLines.length > 0 ? symptomLines.join("\n") : "- None documented",
    "",
    "Medical Assessment",
    normalizeText(report?.medical_assessment, "Not documented."),
    "",
    "Diagnosis",
    normalizeText(report?.diagnosis, "Not documented."),
    "",
    "Treatment Plan",
    normalizeText(report?.treatment_plan, "Not documented."),
    "",
    "Medications",
    medicationLines.length > 0 ? medicationLines.join("\n") : "- None documented",
    "",
    "Follow-up Instructions",
    followUpLines.length > 0 ? followUpLines.join("\n") : "- None documented",
  ].join("\n");
}

export function buildStructuredReport({
  transcriptEntries,
  analysis,
  structuredData = {},
  patientDetails = {},
  doctorDetails = {},
  reportType = "general",
  overrides = {},
} = {}) {
  const patientInformation = buildPatientInformation(patientDetails, doctorDetails, reportType);
  const fallbackSymptoms = normalizeList([...(analysis?.symptoms || []), ...(structuredData?.symptoms || [])]);
  const fallbackMedications = normalizeMedicationList(
    Array.isArray(analysis?.medications) && analysis.medications.length > 0
      ? analysis.medications
      : structuredData?.medications
  );
  const chiefComplaint = normalizeText(
    overrides?.chief_complaint,
    buildFallbackChiefComplaint(analysis, structuredData)
  );
  const historyOfPresentIllness = normalizeText(
    overrides?.history_of_present_illness,
    extractPatientTimeline(transcriptEntries)
  );
  const medicalAssessment = normalizeText(
    overrides?.medical_assessment,
    buildFallbackAssessment(analysis, transcriptEntries)
  );
  const diagnosis = normalizeText(overrides?.diagnosis, buildFallbackDiagnosis(analysis, structuredData));
  const treatmentPlan = normalizeText(
    overrides?.treatment_plan,
    buildFallbackTreatmentPlan(analysis, structuredData)
  );
  const symptoms = normalizeList(overrides?.symptoms, fallbackSymptoms);
  const medications = normalizeMedicationList(overrides?.medications);
  const normalizedMedications = medications.length > 0 ? medications : fallbackMedications;
  const followUpInstructions = normalizeList(
    overrides?.follow_up_instructions,
    buildFollowUpInstructions(analysis)
  );
  const recommendations = normalizeList(overrides?.recommendations, followUpInstructions);
  const summary = normalizeText(overrides?.summary, buildLegacySummary(chiefComplaint, medicalAssessment));

  const structuredReport = {
    patient_information: patientInformation,
    chief_complaint: chiefComplaint,
    history_of_present_illness: historyOfPresentIllness,
    symptoms,
    medical_assessment: medicalAssessment,
    diagnosis,
    treatment_plan: treatmentPlan,
    medications: normalizedMedications,
    follow_up_instructions: followUpInstructions,
    summary,
    recommendations,
  };

  return {
    ...structuredReport,
    report_content: buildReportContent(structuredReport),
  };
}

function buildTranscriptTableRows(transcriptEntries) {
  if (!Array.isArray(transcriptEntries) || transcriptEntries.length === 0) {
    return `
      <tr>
        <td colspan="4">Transcript not available.</td>
      </tr>
    `;
  }

  return transcriptEntries
    .map(
      (item) => `
      <tr>
        <td>${escapeHtml(item.start_time || "00:00:00")}</td>
        <td>${escapeHtml(item.end_time || "00:00:00")}</td>
        <td>${escapeHtml(item.speaker || "Unknown")}</td>
        <td>${escapeHtml(item.text || "")}</td>
      </tr>
    `
    )
    .join("");
}

function buildJsonReport({ session, transcriptEntries, analysis, structuredReport }) {
  const normalizedReport = structuredReport || buildStructuredReport({ transcriptEntries, analysis });

  return {
    upload_id: session.id,
    filename: session.filename,
    generated_at: new Date().toISOString(),
    summary: normalizedReport.summary,
    symptoms: normalizedReport.symptoms,
    diagnosis: normalizedReport.diagnosis,
    treatment_plan: normalizedReport.treatment_plan,
    recommendations: normalizedReport.recommendations,
    report_content: normalizedReport.report_content,
    sections: {
      patient_information: normalizedReport.patient_information,
      chief_complaint: normalizedReport.chief_complaint,
      history_of_present_illness: normalizedReport.history_of_present_illness,
      symptoms: normalizedReport.symptoms,
      medical_assessment: normalizedReport.medical_assessment,
      diagnosis: normalizedReport.diagnosis,
      treatment_plan: normalizedReport.treatment_plan,
      medications: normalizedReport.medications,
      follow_up_instructions: normalizedReport.follow_up_instructions,
      full_transcript: transcriptEntries || [],
    },
    analysis,
    structured_report: normalizedReport,
  };
}

function buildHtmlReport(jsonReport) {
  const sections = jsonReport.sections || {};
  const patientInformation = sections.patient_information || {};
  const patientInfoHtml = [
    patientInformation.full_name ? `<li>Patient Name: ${escapeHtml(patientInformation.full_name)}</li>` : "",
    patientInformation.patient_id ? `<li>Patient ID: ${escapeHtml(patientInformation.patient_id)}</li>` : "",
    patientInformation.age !== null && patientInformation.age !== undefined
      ? `<li>Age: ${escapeHtml(patientInformation.age)}</li>`
      : "",
    patientInformation.gender ? `<li>Gender: ${escapeHtml(patientInformation.gender)}</li>` : "",
    patientInformation.phone ? `<li>Phone: ${escapeHtml(patientInformation.phone)}</li>` : "",
    patientInformation.address ? `<li>Address: ${escapeHtml(patientInformation.address)}</li>` : "",
    patientInformation.doctor_name ? `<li>Doctor: ${escapeHtml(patientInformation.doctor_name)}</li>` : "",
  ]
    .filter(Boolean)
    .join("");

  return `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Clinical Report - ${escapeHtml(jsonReport.upload_id)}</title>
    <style>
      body { font-family: Arial, Helvetica, sans-serif; margin: 24px; color: #1f2937; }
      h1 { margin-bottom: 0; }
      h2 { margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
      p, li, td, th { font-size: 14px; line-height: 1.45; }
      ul { margin-top: 0; }
      .meta { color: #6b7280; font-size: 13px; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; text-align: left; }
      th { background: #f9fafb; }
      .footer { margin-top: 28px; color: #6b7280; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Clinical Consultation Report</h1>
    <p class="meta">Upload ID: ${escapeHtml(jsonReport.upload_id)} | Source File: ${escapeHtml(jsonReport.filename)} | Generated: ${escapeHtml(jsonReport.generated_at)}</p>

    <h2>1. Patient Information</h2>
    <ul>${patientInfoHtml || "<li>No patient identifiers were provided.</li>"}</ul>

    <h2>2. Chief Complaint</h2>
    <p>${escapeHtml(sections.chief_complaint || "")}</p>

    <h2>3. History of Present Illness</h2>
    <p>${escapeHtml(sections.history_of_present_illness || "")}</p>

    <h2>4. Symptoms</h2>
    <ul>${formatListHtml(sections.symptoms)}</ul>

    <h2>5. Medical Assessment</h2>
    <p>${escapeHtml(sections.medical_assessment || "")}</p>

    <h2>6. Diagnosis</h2>
    <p>${escapeHtml(sections.diagnosis || "")}</p>

    <h2>7. Treatment Plan</h2>
    <p>${escapeHtml(sections.treatment_plan || "")}</p>

    <h2>8. Medications</h2>
    <ul>${formatMedicationList(sections.medications)}</ul>

    <h2>9. Follow-up Instructions</h2>
    <ul>${formatListHtml(sections.follow_up_instructions)}</ul>

    <h2>10. Full Transcript (timestamped)</h2>
    <table>
      <thead>
        <tr>
          <th>Start</th>
          <th>End</th>
          <th>Speaker</th>
          <th>Text</th>
        </tr>
      </thead>
      <tbody>${buildTranscriptTableRows(sections.full_transcript)}</tbody>
    </table>

    <div class="footer">Generated by Medical Audio Processing Module</div>
  </body>
</html>
  `.trim();
}

export const medicalReportGenerator = {
  buildStructuredReport,
  buildReportContent,

  generate({ session, transcriptEntries, analysis, structuredReport }) {
    const jsonReport = buildJsonReport({ session, transcriptEntries, analysis, structuredReport });
    const htmlReport = buildHtmlReport(jsonReport);
    return {
      jsonReport,
      htmlReport,
    };
  },
};
