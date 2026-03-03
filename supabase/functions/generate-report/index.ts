import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GEMINI_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 2;

function cleanOutput(text: string): string {
  return String(text || "").replace(/\*+/g, "").replace(/#+/g, "").trim();
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === "string" ? p : typeof p?.text === "string" ? p.text : "")).join("").trim();
  }
  if (content && typeof (content as any).text === "string") return (content as any).text;
  return "";
}

function extractJsonBlock(text: string): Record<string, unknown> | null {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { /* continue */ }
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) { try { return JSON.parse(fenced[1].trim()); } catch { /* continue */ } }
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) { try { return JSON.parse(raw.slice(first, last + 1)); } catch { /* continue */ } }
  return null;
}

interface StructuredReport {
  summary: string;
  symptoms: string[];
  diagnosis: string;
  treatment_plan: string;
  recommendations: string[];
}

function normalizeReport(input: any): StructuredReport {
  const obj = input && typeof input === "object" ? input : {};
  return {
    summary: typeof obj.summary === "string" ? cleanOutput(obj.summary) : "",
    symptoms: Array.isArray(obj.symptoms) ? obj.symptoms.map((s: any) => cleanOutput(String(s))).filter(Boolean) : [],
    diagnosis: typeof obj.diagnosis === "string" ? cleanOutput(obj.diagnosis) : "",
    treatment_plan: typeof obj.treatment_plan === "string" ? cleanOutput(obj.treatment_plan) : "",
    recommendations: Array.isArray(obj.recommendations) ? obj.recommendations.map((s: any) => cleanOutput(String(s))).filter(Boolean) : [],
  };
}

function hasContent(r: StructuredReport): boolean {
  return Boolean(r.summary || r.diagnosis || r.treatment_plan || r.symptoms.length || r.recommendations.length);
}

function formatReport(r: StructuredReport): string {
  return [
    `Summary:\n${r.summary || "N/A"}`,
    `Symptoms:\n${r.symptoms.length ? r.symptoms.map((s) => `- ${s}`).join("\n") : "- N/A"}`,
    `Diagnosis:\n${r.diagnosis || "N/A"}`,
    `Treatment Plan:\n${r.treatment_plan || "N/A"}`,
    `Recommendations:\n${r.recommendations.length ? r.recommendations.map((s) => `- ${s}`).join("\n") : "- N/A"}`,
  ].join("\n\n");
}

const reportPrompts: Record<string, string> = {
  general: "General clinical report",
  soap: "SOAP report",
  diagnostic: "Diagnostic report",
};

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const body = await req.json();
    const transcription = typeof body?.transcription === "string" ? body.transcription.trim() : "";
    const reportType = typeof body?.reportType === "string" && reportPrompts[body.reportType] ? body.reportType : "general";
    const patientId = typeof body?.patient_id === "string" && body.patient_id.trim() ? body.patient_id.trim() : null;
    const doctorId = typeof body?.doctor_id === "string" && body.doctor_id.trim() ? body.doctor_id.trim() : null;
    const doctorName = typeof body?.doctor_name === "string" && body.doctor_name.trim() ? body.doctor_name.trim() : null;
    const patientDetails = body?.patient_details && typeof body.patient_details === "object" ? body.patient_details : {};
    const doctorDetails = body?.doctor_details && typeof body.doctor_details === "object" ? body.doctor_details : {};
    const persist = body?.persist === true;

    if (!transcription) {
      return new Response(JSON.stringify({ error: "Missing transcription" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[generate-report] Type: ${reportType}, persist: ${persist}, transcription: ${transcription.length} chars`);

    const prompt = [
      "Generate a structured medical report from the consultation transcript.",
      `Report style: ${reportPrompts[reportType]}.`,
      "Return ONLY valid JSON with this exact schema:",
      '{"summary":"","symptoms":[""],"diagnosis":"","treatment_plan":"","recommendations":[""]}',
      "Rules: Use only transcript facts. No fabrication. Keep arrays of short strings. Concise clinical summary.",
      `Patient: ${JSON.stringify(patientDetails)}`,
      `Doctor: ${JSON.stringify(doctorDetails)}`,
      `Transcript:\n${transcription}`,
    ].join("\n");

    let structuredReport: StructuredReport | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

        const response = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are an expert medical report assistant. Return ONLY strict JSON matching the requested schema. No markdown, no commentary." },
              { role: "user", content: prompt },
            ],
            temperature: 0.2,
            max_tokens: 2048,
            response_format: { type: "json_object" },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errText = await response.text();
          console.error(`[generate-report] Attempt ${attempt + 1} gateway error ${response.status}:`, errText);
          if (response.status === 429) {
            return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (response.status === 402) {
            return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          throw new Error(`AI error (${response.status})`);
        }

        const data = await response.json();
        const content = extractTextContent(data?.choices?.[0]?.message?.content);
        const json = extractJsonBlock(content);
        if (!json) throw new Error("AI returned invalid JSON");

        const report = normalizeReport(json);
        if (!hasContent(report)) throw new Error("Generated report is empty");

        structuredReport = report;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.error(`[generate-report] Attempt ${attempt + 1} failed:`, lastError.message);
        if (attempt < MAX_RETRIES) await sleep(500 * Math.pow(2, attempt));
      }
    }

    if (!structuredReport) {
      return new Response(JSON.stringify({ error: lastError?.message || "Failed to generate report" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reportContent = formatReport(structuredReport);
    let reportId: string | null = null;

    if (persist) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Get user from auth header
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
          const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
          });
          const { data: { user } } = await userClient.auth.getUser();

          if (user) {
            const wordCount = transcription.split(/\s+/).filter(Boolean).length;
            const { data: inserted, error: insertErr } = await supabase
              .from("reports")
              .insert({
                user_id: user.id,
                transcription,
                report_content: reportContent,
                report_type: reportType,
                duration: 0,
                word_count: wordCount,
                patient_id: patientId,
                doctor_name: doctorName,
              })
              .select("id")
              .single();

            if (insertErr) {
              console.error("[generate-report] DB insert error:", insertErr);
            } else {
              reportId = inserted?.id || null;
            }
          }
        }
      } catch (dbErr) {
        console.error("[generate-report] Persist error:", dbErr);
        // Don't fail the response, report was generated successfully
      }
    }

    console.log(`[generate-report] Success. Report ID: ${reportId || "not persisted"}`);

    return new Response(
      JSON.stringify({
        ...structuredReport,
        report_content: reportContent,
        report_id: reportId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[generate-report] Error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
