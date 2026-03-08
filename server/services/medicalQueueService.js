import { MedicalProcessingQueue } from "./medicalProcessingQueue.js";
import { medicalPipelineService } from "./medicalPipelineService.js";

const globalForMedicalQueue = globalThis;

const queue =
  globalForMedicalQueue.__medicalQueueService ||
  new MedicalProcessingQueue(async (job) => {
    await medicalPipelineService.processUpload(job);
  });

if (process.env.NODE_ENV !== "production") {
  globalForMedicalQueue.__medicalQueueService = queue;
}

export const medicalQueueService = queue;
