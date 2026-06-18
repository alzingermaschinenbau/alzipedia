// Alzipedia – Service-KI (RAG über die eigene Datenbank)
// Supabase Edge Function. Holt den Anthropic-API-Key sicher aus den Function-Secrets.
// Deploy:  supabase functions deploy alzi-ki
// Secret:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
import Anthropic from "npm:@anthropic-ai/sdk@^0.40.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Erlaubte Modelle (Kosten/Qualität). Standard: Sonnet 4.6.
const ALLOWED = ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-8"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) return j({ error: "ANTHROPIC_API_KEY fehlt in den Function-Secrets." }, 500);

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const context = String(body.context || "");
    const lang = String(body.lang || "de");
    let model = String(body.model || "claude-opus-4-8");
    if (!ALLOWED.includes(model)) model = "claude-opus-4-8";

    const client = new Anthropic({ apiKey: key });

    const system =
`Du bist der Alzinger Service-Assistent für die Siebmaschine Lepton 5100 und ähnliche Alzinger-Maschinen.
Du hilfst Servicetechnikern und Bedienern bei Störungssuche, Einstellungen und Wartung – praxisnah und konkret.

Regeln:
- Stütze dich VORRANGIG auf die unten bereitgestellte WISSENSBASIS (Störungen, Anleitungen, Handbücher, Maschinen-Daten, Datenblätter).
- Wenn dir für eine sichere Diagnose eine Angabe fehlt (z. B. eingestellte Siebneigung, Fehlercode, Modell, Material), STELLE ZUERST eine kurze, gezielte Rückfrage – statt zu raten.
- Antworte mit konkreten, nummerierten Prüf- und Handlungsschritten.
- Nenne Parameter/Werte nur, wenn sie in der Wissensbasis stehen oder fachlich allgemein gültig sind. Erfinde KEINE Fehlercodes, Seriennummern oder Parameter.
- Wenn die Wissensbasis nichts hergibt, sage das ehrlich und gib bestmögliche allgemeine Hinweise, klar als allgemein gekennzeichnet.
- Fasse dich kurz. Antworte in der Sprache des Nutzers (Standard: ${lang}).

WISSENSBASIS:
${context || "(keine passenden Inhalte gefunden)"}`;

    const resp = await client.messages.create({
      model,
      max_tokens: 1200,
      system,
      messages: messages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || ""),
      })),
    });

    const answer = (resp.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    return j({ answer, model });
  } catch (e) {
    return j({ error: String((e && (e as any).message) || e) }, 500);
  }
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
