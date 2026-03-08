import { prisma, ensureDatabaseSchema } from "../server/lib/db.js";

async function main() {
  await ensureDatabaseSchema();
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
