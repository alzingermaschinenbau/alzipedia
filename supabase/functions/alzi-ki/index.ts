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
    const mode = String(body.mode || "answer");
    let model = String(body.model || "claude-opus-4-8");
    if (!ALLOWED.includes(model)) model = "claude-opus-4-8";

    const client = new Anthropic({ apiKey: key });

    // Trainingsmodus: EINE neue, noch nicht abgedeckte Fachfrage generieren.
    if (mode === "frage") {
      const qsystem =
`Du baust gemeinsam mit einem Maschinen-Experten eine Wissensdatenbank zur Alzinger Siebmaschine Lepton 5100 auf.
Deine Aufgabe: Stelle GENAU EINE neue, konkrete Fachfrage zum Lepton 5100, deren Antwort NICHT bereits im unten bereitgestellten Wissen steht.
Regeln:
- Unten findest du, was BEREITS dokumentiert (Betriebsanleitung/Serviceliste/Datenblätter) bzw. schon gelernt ist. Frage NICHT nach Dingen, die dort schon stehen – auch nicht sinngemäß oder umformuliert.
- Ziel sind LÜCKEN: Erfahrungswissen aus der Praxis, Einstellungen für bestimmte Materialien/Situationen, undokumentierte Tricks/Kniffe, häufige Bedienfehler – Wissen, das in keiner Anleitung steht.
- Frag praxisnah und beantwortbar – ein konkretes Detail pro Frage.
- Gib NUR die Frage aus: kein Vorwort, keine Nummerierung, keine Erklärung, KEINE "VORSCHLÄGE"-Zeile.
- Sprache: ${lang}.

BEREITS VORHANDENES WISSEN (nicht danach fragen):
${context || "(noch nichts)"}`;
      const qr = await client.messages.create({
        model,
        max_tokens: 200,
        system: qsystem,
        messages: [{ role: "user", content: "Bitte die nächste neue Fachfrage zum Lepton 5100." }],
      });
      const qtext = (qr.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(" ").trim();
      return j({ answer: qtext, model });
    }

    const system =
`Du bist der Alzinger Service-Assistent für die Siebmaschine Lepton 5100 und ähnliche Alzinger-Maschinen.
Du hilfst Servicetechnikern und Bedienern bei Störungssuche, Einstellungen und Wartung – praxisnah und konkret.

Regeln:
- Stütze dich VORRANGIG auf die unten bereitgestellte WISSENSBASIS (Störungen, Anleitungen, Handbücher, Maschinen-Daten, Datenblätter).
- Einträge, die als "GEPRÜFTE EXPERTEN-ANTWORT (verbindlich)" markiert sind, stammen direkt vom Maschinen-Experten. Behandle sie als verbindlich und richtig – sie haben Vorrang vor allen anderen Quellen und vor deinem Allgemeinwissen.
- Wenn dir für eine sichere Diagnose eine Angabe fehlt (z. B. eingestellte Siebneigung, Fehlercode, Modell, Material), STELLE ZUERST eine kurze, gezielte Rückfrage – statt zu raten.
- Antworte mit konkreten, nummerierten Prüf- und Handlungsschritten.
- WICHTIG: Wenn die Antwort im bereitgestellten Dokumenttext steht, GIB SIE KONKRET WIEDER (Werte, Schritte, Parameter). Verweise NICHT nur auf "siehe Dokument/Blatt XY" – fasse den relevanten Inhalt verständlich zusammen und nenne das Dokument nur zusätzlich als Quelle.
- Die Auszüge unter "Aus dem Dokument … (relevante Stellen)" sind bereits die passenden Textstellen aus den Handbüchern/Betriebsanleitungen – nutze sie aktiv zum Beantworten.
- Nenne Parameter/Werte nur, wenn sie in der Wissensbasis stehen oder fachlich allgemein gültig sind. Erfinde KEINE Fehlercodes, Seriennummern oder Parameter.
- Wenn die Wissensbasis nichts hergibt, sage das ehrlich und gib bestmögliche allgemeine Hinweise, klar als allgemein gekennzeichnet.
- Fasse dich kurz. Antworte in der Sprache des Nutzers (Standard: ${lang}).
- Wenn eine kurze Auswahl die Diagnose voranbringt (z. B. bei einer Rückfrage), hänge als ALLERLETZTE Zeile genau dieses Format an: "VORSCHLÄGE: Option A | Option B | Option C" (max. 4 kurze Optionen). Wenn keine Auswahl sinnvoll ist, lass diese Zeile komplett weg.

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
