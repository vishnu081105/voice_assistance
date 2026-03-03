import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TRANSCRIPTION_TIMEOUT_MS = 5 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const language = (formData.get("language") as string) || "auto";

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "No audio file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[whisper-transcribe] Received audio: ${audioFile.size} bytes, type: ${audioFile.type}`);

    const arrayBuffer = await audioFile.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);
    const base64Audio = btoa(String.fromCharCode(...uint8));

    const mimeType = audioFile.type || "audio/webm";
    const format = mimeType.split("/")[1]?.split(";")[0] || "webm";

    console.log(`[whisper-transcribe] Sending to Gemini for transcription (format: ${format})...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);

    try {
      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "You are a highly accurate medical transcription assistant. Transcribe the audio precisely. Return ONLY the transcription text, nothing else. Do not add any commentary, labels, or formatting.",
            },
            {
              role: "user",
              content: [
                {
                  type: "input_audio",
                  input_audio: { data: base64Audio, format },
                },
                {
                  type: "text",
                  text: `Transcribe this medical audio accurately. Language: ${language}. Return only the transcribed text.`,
                },
              ],
            },
          ],
          temperature: 0,
          max_tokens: 4096,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[whisper-transcribe] Gateway error ${response.status}:`, errText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: `Transcription failed (${response.status})` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      let text = "";
      if (typeof content === "string") {
        text = content.trim();
      } else if (Array.isArray(content)) {
        text = content.map((p: any) => (typeof p === "string" ? p : p?.text || "")).join("").trim();
      }

      if (!text) {
        console.error("[whisper-transcribe] Empty transcription from AI");
        return new Response(JSON.stringify({ error: "No transcription received" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`[whisper-transcribe] Success: ${text.length} chars transcribed`);

      const estimatedDuration = Math.round(arrayBuffer.byteLength / 2000);

      return new Response(
        JSON.stringify({
          text,
          duration: estimatedDuration,
          language: language === "auto" ? "en" : language,
          segments: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error("[whisper-transcribe] Error:", e);
    const message = e instanceof Error ? e.message : "Unknown error";
    if (e instanceof DOMException && e.name === "AbortError") {
      return new Response(JSON.stringify({ error: "Transcription request timed out" }), {
        status: 504,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
