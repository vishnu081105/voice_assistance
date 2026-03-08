-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MedicalAudioSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "upload_time" DATETIME NOT NULL,
    "processing_status" TEXT NOT NULL,
    "audio_path" TEXT NOT NULL,
    "audio_file_path" TEXT,
    "audio_mime_type" TEXT,
    "transcription_text" TEXT,
    "transcript_path" TEXT,
    "report_path" TEXT,
    "report_html_path" TEXT,
    "error_message" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "MedicalAudioSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MedicalAudioSession" ("audio_mime_type", "audio_path", "audio_file_path", "created_at", "error_message", "filename", "id", "processing_status", "report_html_path", "report_path", "transcript_path", "transcription_text", "updated_at", "upload_time", "user_id") SELECT "audio_mime_type", "audio_path", "audio_path", "created_at", "error_message", "filename", "id", "processing_status", "report_html_path", "report_path", "transcript_path", NULL, "updated_at", "upload_time", "user_id" FROM "MedicalAudioSession";
DROP TABLE "MedicalAudioSession";
ALTER TABLE "new_MedicalAudioSession" RENAME TO "MedicalAudioSession";
CREATE INDEX "MedicalAudioSession_user_id_idx" ON "MedicalAudioSession"("user_id");
CREATE INDEX "MedicalAudioSession_processing_status_idx" ON "MedicalAudioSession"("processing_status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
