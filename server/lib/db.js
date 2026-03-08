import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

async function hasColumn(tableName, columnName) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => row?.name === columnName);
}

export async function ensureDatabaseSchema() {
  await prisma.$executeRawUnsafe(`
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
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Patient_user_id_idx" ON "Patient"("user_id");
  `);

  if (!(await hasColumn("Report", "doctor_id"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Report" ADD COLUMN "doctor_id" TEXT;`);
  }
  if (!(await hasColumn("User", "role"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'doctor';`
    );
  }
  if (!(await hasColumn("Report", "generated_report"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Report" ADD COLUMN "generated_report" TEXT;`);
  }
  if (!(await hasColumn("Report", "audio_storage_path"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Report" ADD COLUMN "audio_storage_path" TEXT;`);
  }
  if (!(await hasColumn("Report", "audio_mime_type"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Report" ADD COLUMN "audio_mime_type" TEXT;`);
  }

  await prisma.$executeRawUnsafe(`
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
      "raw_transcription_text" TEXT,
      "corrected_transcription_text" TEXT,
      "transcript_confidence" REAL,
      "transcript_review_required" INTEGER NOT NULL DEFAULT 0,
      "transcript_validation_status" TEXT,
      "transcript_validation_issues" TEXT,
      "structured_medical_data" TEXT,
      "transcript_path" TEXT,
      "report_path" TEXT,
      "report_html_path" TEXT,
      "error_message" TEXT,
      "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "MedicalAudioSession_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MedicalAudioSession_user_id_idx" ON "MedicalAudioSession"("user_id");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "MedicalAudioSession_status_idx" ON "MedicalAudioSession"("processing_status");
  `);

  if (!(await hasColumn("MedicalAudioSession", "audio_file_path"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "MedicalAudioSession" ADD COLUMN "audio_file_path" TEXT;`);
  }
  if (!(await hasColumn("MedicalAudioSession", "transcription_text"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcription_text" TEXT;`);
  }
  if (!(await hasColumn("MedicalAudioSession", "audio_mime_type"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "MedicalAudioSession" ADD COLUMN "audio_mime_type" TEXT;`);
  }
  if (!(await hasColumn("MedicalAudioSession", "raw_transcription_text"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "raw_transcription_text" TEXT;`
    );
  }
  if (!(await hasColumn("MedicalAudioSession", "corrected_transcription_text"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "corrected_transcription_text" TEXT;`
    );
  }
  if (!(await hasColumn("MedicalAudioSession", "transcript_confidence"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_confidence" REAL;`
    );
  }
  if (!(await hasColumn("MedicalAudioSession", "transcript_review_required"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_review_required" INTEGER NOT NULL DEFAULT 0;`
    );
  }
  if (!(await hasColumn("MedicalAudioSession", "transcript_validation_status"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_validation_status" TEXT;`
    );
  }
  if (!(await hasColumn("MedicalAudioSession", "transcript_validation_issues"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "transcript_validation_issues" TEXT;`
    );
  }
  if (!(await hasColumn("MedicalAudioSession", "structured_medical_data"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "MedicalAudioSession" ADD COLUMN "structured_medical_data" TEXT;`
    );
  }

  await prisma.$executeRawUnsafe(`
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
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_user_id_idx" ON "AuditLog"("user_id");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_resource_type_resource_id_idx" ON "AuditLog"("resource_type", "resource_id");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
  `);
}
