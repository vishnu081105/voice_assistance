import { afterEach, describe, expect, it, vi } from "vitest";

describe("audioEnhancementService", () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.AUDIO_NOISE_REDUCTION_ENABLED;
    delete process.env.AUDIO_VOLUME_NORMALIZATION_ENABLED;
  });

  it("builds a combined filter chain for transcription normalization", async () => {
    process.env.AUDIO_NOISE_REDUCTION_ENABLED = "true";
    process.env.AUDIO_VOLUME_NORMALIZATION_ENABLED = "true";

    const { audioEnhancementService } = await import("./audioEnhancementService.js");
    const filterChain = audioEnhancementService.getTranscriptionFilterChain();

    expect(filterChain).toContain("afftdn");
    expect(filterChain).toContain("dynaudnorm");
  });
});
