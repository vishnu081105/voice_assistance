import { medicalConfig } from "../lib/medical/medicalPaths.js";

class MedicalTranscriptionChannel {
  constructor() {
    this.clientsBySession = new Map();
    this.channelName = medicalConfig.channelName;
  }

  subscribe(sessionId, res) {
    if (!this.clientsBySession.has(sessionId)) {
      this.clientsBySession.set(sessionId, new Set());
    }

    const clients = this.clientsBySession.get(sessionId);
    clients.add(res);
  }

  unsubscribe(sessionId, res) {
    const clients = this.clientsBySession.get(sessionId);
    if (!clients) return;
    clients.delete(res);
    if (clients.size === 0) {
      this.clientsBySession.delete(sessionId);
    }
  }

  sendToClient(res, eventType, payload) {
    const envelope = JSON.stringify({
      channel: this.channelName,
      ...payload,
    });
    res.write(`event: ${eventType}\n`);
    res.write(`data: ${envelope}\n\n`);
  }

  emit(sessionId, eventType, payload) {
    const clients = this.clientsBySession.get(sessionId);
    if (!clients || clients.size === 0) return;

    for (const client of clients) {
      this.sendToClient(client, eventType, payload);
    }
  }
}

const globalForMedicalChannel = globalThis;

export const medicalTranscriptionChannel =
  globalForMedicalChannel.__medicalTranscriptionChannel || new MedicalTranscriptionChannel();

if (process.env.NODE_ENV !== "production") {
  globalForMedicalChannel.__medicalTranscriptionChannel = medicalTranscriptionChannel;
}
