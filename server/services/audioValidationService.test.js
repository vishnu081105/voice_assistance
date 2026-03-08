import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args) => spawnMock(...args),
  default: {
    spawn: (...args) => spawnMock(...args),
  },
}));

describe("audioValidationService", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts valid audio buffers when ffprobe metadata is healthy", async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      queueMicrotask(() => {
        child.stdout.emit(
          "data",
          JSON.stringify({
            format: { duration: "12.5", size: "1024" },
            streams: [{ codec_type: "audio", codec_name: "mp3", sample_rate: "16000", channels: 1 }],
          })
        );
        child.emit("close", 0);
      });
      return child;
    });

    const { audioValidationService } = await import("./audioValidationService.js");
    const result = await audioValidationService.validateAudioBuffer({
      buffer: Buffer.from("test-audio"),
      fileName: "consultation.mp3",
      mimeType: "audio/mpeg",
    });

    expect(result.durationSeconds).toBe(12.5);
    expect(result.codecName).toBe("mp3");
    expect(result.mimeType).toBe("audio/mpeg");
  });

  it("rejects unsupported extensions before probing", async () => {
    const { audioValidationService } = await import("./audioValidationService.js");

    await expect(
      audioValidationService.validateAudioBuffer({
        buffer: Buffer.from("test-audio"),
        fileName: "consultation.txt",
        mimeType: "text/plain",
      })
    ).rejects.toMatchObject({
      code: "UNSUPPORTED_FORMAT",
    });

    expect(spawnMock).not.toHaveBeenCalled();
  });
});
