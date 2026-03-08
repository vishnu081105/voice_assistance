import crypto from "node:crypto";
import { config } from "../config.js";

const ENCRYPTION_PREFIX = "enc:v1:";
const ALGORITHM = "aes-256-gcm";

function toSerializablePayload(data) {
  if (Buffer.isBuffer(data)) {
    return {
      kind: "buffer",
      content: data,
    };
  }

  if (data !== null && typeof data === "object") {
    return {
      kind: "json",
      content: Buffer.from(JSON.stringify(data), "utf8"),
    };
  }

  return {
    kind: "string",
    content: Buffer.from(String(data ?? ""), "utf8"),
  };
}

function serializeEnvelope(envelope) {
  return `${ENCRYPTION_PREFIX}${Buffer.from(JSON.stringify(envelope), "utf8").toString("base64")}`;
}

function parseEnvelope(encryptedData) {
  const value = Buffer.isBuffer(encryptedData)
    ? encryptedData.toString("utf8")
    : String(encryptedData ?? "");

  if (!value.startsWith(ENCRYPTION_PREFIX)) {
    return null;
  }

  const encoded = value.slice(ENCRYPTION_PREFIX.length);
  const raw = Buffer.from(encoded, "base64").toString("utf8");
  return JSON.parse(raw);
}

export const encryptionService = {
  isEncryptedValue(value) {
    const text = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
    return text.startsWith(ENCRYPTION_PREFIX);
  },

  encryptData(data) {
    const payload = toSerializablePayload(data);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, config.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(payload.content), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return serializeEnvelope({
      kind: payload.kind,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      data: encrypted.toString("base64"),
    });
  },

  decryptData(encryptedData) {
    const envelope = parseEnvelope(encryptedData);
    if (!envelope) {
      return Buffer.isBuffer(encryptedData) ? encryptedData : String(encryptedData ?? "");
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      config.encryptionKey,
      Buffer.from(String(envelope.iv || ""), "base64")
    );
    decipher.setAuthTag(Buffer.from(String(envelope.authTag || ""), "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(String(envelope.data || ""), "base64")),
      decipher.final(),
    ]);

    if (envelope.kind === "buffer") {
      return decrypted;
    }
    if (envelope.kind === "json") {
      return JSON.parse(decrypted.toString("utf8") || "{}");
    }
    return decrypted.toString("utf8");
  },
};

export const { encryptData, decryptData } = encryptionService;
