import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ENHANCEMENT_PROMPT = `You are a medical transcription enhancement specialist. Your task is to improve the accuracy and quality of speech-to-text transcriptions for medical professionals.

ENHANCEMENT RULES:
1. Fix common speech recognition errors (homophones, misheard words)
2. Correct medical terminology spelling and usage
3. Add proper punctuation and capitalization
4. Fix grammar while preserving the speaker's intent
5. Expand common medical abbreviations when appropriate
6. Maintain the original meaning - do not add or remove information
7. Format numbers, dosages, and measurements correctly
8. Preserve any patient IDs, names, or specific values mentioned

MEDICAL TERMINOLOGY FOCUS:
- Correctly spell drug names (e.g., "metformin" not "met for men")
- Fix anatomical terms (e.g., "myocardial" not "my oh cardial")
- Correct procedure names and diagnoses
- Ensure proper medical abbreviations (e.g., "BP" for blood pressure)

OUTPUT RULES:
- Return ONLY the enhanced transcription
- Do not add explanations or notes
- Do not use markdown formatting
- Keep the same overall structure and content`;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { transcription, patient_name, patient_id } = body;

    if (!transcription || typeof transcription !== 'string') {
      return new Response(
        JSON.stringify({ error: "Missing or invalid transcription field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (transcription.trim().length < 3) {
      return new Response(
        JSON.stringify({ error: "Transcription too short to enhance" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize patient fields if provided
    const patientName = typeof patient_name === 'string' && patient_name.trim() ? String(patient_name).trim() : null;
    const patientId = typeof patient_id === 'string' || typeof patient_id === 'number' ? String(patient_id) : null;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY environment variable is not set");
      return new Response(
        JSON.stringify({ error: "AI service configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Enhancing transcription of length: ${transcription.length}` + (patientId ? ` for patient_id=${patientId}` : '') + (patientName ? ` patient_name=${patientName}` : ''));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: ENHANCEMENT_PROMPT },
          { 
            role: "user", 
            content: `Please enhance and correct this medical transcription:\n\n${transcription}` 
          },
          // Provide patient metadata to the model so it can preserve or reference it where appropriate
          ...(patientId || patientName ? [{ role: "user", content: `Patient metadata: ${patientId ? `ID: ${patientId}` : ''}${patientId && patientName ? ' | ' : ''}${patientName ? `Name: ${patientName}` : ''}` }] : []),
        ],
        temperature: 0.1, // Low temperature for consistent corrections
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`AI gateway error: ${response.status} - ${errorText}`);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI usage limit reached. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: `AI service error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const enhancedText = data.choices?.[0]?.message?.content?.trim();

    if (!enhancedText) {
      return new Response(
        JSON.stringify({ error: "Failed to get enhanced transcription" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully enhanced transcription. Original: ${transcription.length} chars, Enhanced: ${enhancedText.length} chars`);

    // Return enhanced transcription and echo patient metadata (if provided)
    return new Response(
      JSON.stringify({ 
        enhanced: enhancedText,
        original: transcription,
        patient_name: patientName,
        patient_id: patientId,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (e) {
    console.error("enhance-transcription function error:", e);
    
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    
    return new Response(
      JSON.stringify({ error: `Internal server error: ${errorMessage}` }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
