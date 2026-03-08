class MedicalRuntimeStore {
  constructor() {
    this.transcriptBySession = new Map();
    this.statusBySession = new Map();
    this.errorBySession = new Map();
  }

  initialize(sessionId) {
    this.transcriptBySession.set(sessionId, []);
    this.statusBySession.set(sessionId, "uploaded");
    this.errorBySession.delete(sessionId);
  }

  appendTranscriptChunk(sessionId, chunk) {
    const existing = this.transcriptBySession.get(sessionId) || [];
    existing.push(chunk);
    this.transcriptBySession.set(sessionId, existing);
  }

  replaceTranscript(sessionId, transcript) {
    this.transcriptBySession.set(sessionId, Array.isArray(transcript) ? [...transcript] : []);
  }

  getTranscript(sessionId) {
    return this.transcriptBySession.get(sessionId) || [];
  }

  setStatus(sessionId, status) {
    this.statusBySession.set(sessionId, status);
  }

  getStatus(sessionId) {
    return this.statusBySession.get(sessionId) || null;
  }

  setError(sessionId, errorPayload) {
    this.errorBySession.set(sessionId, errorPayload);
  }

  getError(sessionId) {
    return this.errorBySession.get(sessionId) || null;
  }
}

const globalForMedicalRuntimeStore = globalThis;

export const medicalRuntimeStore =
  globalForMedicalRuntimeStore.__medicalRuntimeStore || new MedicalRuntimeStore();

if (process.env.NODE_ENV !== "production") {
  globalForMedicalRuntimeStore.__medicalRuntimeStore = medicalRuntimeStore;
}
