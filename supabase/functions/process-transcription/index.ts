import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const transcription = typeof body?.transcription === "string" ? body.transcription.trim() : "";
    const enableDiarization = body?.enableDiarization !== false;
    const enhanceTerminology = body?.enhanceTerminology !== false;

    if (!transcription) {
      return new Response(JSON.stringify({ error: "Missing transcription" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[process-transcription] Processing ${transcription.length} chars, diarization=${enableDiarization}`);

    const systemPrompt =
      enableDiarization && enhanceTerminology
        ? "Label speakers as DOCTOR: and PATIENT:, and correct medical terminology while preserving meaning. Return only the processed text."
        : enableDiarization
          ? "Label speakers as DOCTOR: and PATIENT: only. Return only the processed text."
          : "Correct medical terminology and grammar only. Return only the processed text.";

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Process this medical transcription:\n\n${transcription}` },
        ],
        temperature: 0.2,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[process-transcription] Gateway error ${response.status}:`, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: `Enhancement failed (${response.status})` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    let processed = "";
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") processed = content.trim();
    else if (Array.isArray(content)) {
      processed = content.map((p: any) => (typeof p === "string" ? p : p?.text || "")).join("").trim();
    }

    if (!processed) {
      return new Response(JSON.stringify({ error: "AI returned empty content" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const speakers: string[] = [];
    processed.split("\n").forEach((line: string) => {
      if (line.startsWith("DOCTOR:") && !speakers.includes("Doctor")) speakers.push("Doctor");
      if (line.startsWith("PATIENT:") && !speakers.includes("Patient")) speakers.push("Patient");
    });

    console.log(`[process-transcription] Done. Speakers: ${speakers.join(", ") || "none"}`);

    return new Response(
      JSON.stringify({
        processed,
        original: transcription,
        speakers,
        hasDiarization: enableDiarization,
        hasEnhancement: enhanceTerminology,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[process-transcription] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
