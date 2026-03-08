ALTER TABLE "MedicalAudioSession" ADD COLUMN "raw_transcription_text" TEXT;
ALTER TABLE "MedicalAudioSession" ADD COLUMN "corrected_transcription_text" TEXT;
ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_confidence" REAL;
ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_review_required" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_validation_status" TEXT;
ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_validation_issues" TEXT;
ALTER TABLE "MedicalAudioSession" ADD COLUMN "structured_medical_data" TEXT;
