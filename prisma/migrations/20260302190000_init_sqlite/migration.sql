-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'doctor',
    "password_hash" TEXT NOT NULL,
    "reset_token" TEXT,
    "reset_token_until" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "transcription" TEXT NOT NULL,
    "report_content" TEXT NOT NULL,
    "report_type" TEXT NOT NULL DEFAULT 'general',
    "duration" INTEGER NOT NULL DEFAULT 0,
    "word_count" INTEGER NOT NULL DEFAULT 0,
    "patient_id" TEXT,
    "doctor_id" TEXT,
    "doctor_name" TEXT,
    "audio_url" TEXT,
    "audio_storage_path" TEXT,
    "audio_mime_type" TEXT,
    "generated_report" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Report_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Template" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Template_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Patient" (
    "patient_id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "full_name" TEXT,
    "age" INTEGER,
    "gender" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "medical_history" TEXT,
    "allergies" TEXT,
    "diagnosis_history" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Patient_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "MedicalAudioSession" (
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
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalAudioSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "ip_address" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Report_user_id_idx" ON "Report"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Report_patient_id_idx" ON "Report"("patient_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Template_user_id_idx" ON "Template"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Setting_user_id_key_key" ON "Setting"("user_id", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Setting_user_id_idx" ON "Setting"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Patient_user_id_idx" ON "Patient"("user_id");

CREATE INDEX IF NOT EXISTS "MedicalAudioSession_user_id_idx" ON "MedicalAudioSession"("user_id");
CREATE INDEX IF NOT EXISTS "MedicalAudioSession_status_idx" ON "MedicalAudioSession"("processing_status");
CREATE INDEX IF NOT EXISTS "AuditLog_user_id_idx" ON "AuditLog"("user_id");
CREATE INDEX IF NOT EXISTS "AuditLog_resource_type_resource_id_idx" ON "AuditLog"("resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
