import { logger } from "../utils/logger.js";

class MedicalProcessingQueue {
  constructor(processor) {
    this.processor = processor;
    this.queue = [];
    this.running = false;
  }

  enqueue(job) {
    this.queue.push(job);
    this.kickoff();
  }

  kickoff() {
    if (this.running) return;
    this.running = true;
    setImmediate(() => {
      this.processLoop().catch((error) => {
        logger.error("medical_queue.fatal_error", {
          error_code: error?.code || "MEDICAL_QUEUE_FAILURE",
          error_name: error?.name || "Error",
        });
      });
    });
  }

  async processLoop() {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      try {
        await this.processor(job);
      } catch (error) {
        logger.error("medical_queue.job_failed", {
          uploadId: job?.uploadId,
          error_code: error?.code || "MEDICAL_QUEUE_FAILURE",
          error_name: error?.name || "Error",
        });
      }
    }
    this.running = false;

    if (this.queue.length > 0) {
      this.kickoff();
    }
  }
}

export { MedicalProcessingQueue };
