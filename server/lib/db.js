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
  if (!(await hasColumn("Report", "generated_report"))) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Report" ADD COLUMN "generated_report" TEXT;`);
  }
}
