import { ensureDatabaseSchema } from "../db.js";

let schemaReadyPromise = null;

export async function ensureMedicalAudioSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = ensureDatabaseSchema();
  }

  await schemaReadyPromise;
}
