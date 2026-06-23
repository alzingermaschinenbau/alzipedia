// Alzipedia – Benutzerverwaltung (nur Admin)
// Supabase Edge Function. Nutzt den Service-Role-Key (serverseitig, NIE im Browser).
// Deploy:  supabase functions deploy alzi-admin
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden von Supabase automatisch bereitgestellt.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Wer darf Benutzer verwalten:
const ADMINS = ["martin@alzinger-maschinenbau.de"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return j({ error: "Service-Role nicht verfügbar." }, 500);

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    // Aufrufer prüfen: muss eingeloggter Admin sein
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    // E-Mail des Aufrufers ermitteln: zuerst über getUser, sonst aus den (bereits geprüften) JWT-Claims.
    let email = "";
    try {
      const { data } = await admin.auth.getUser(token);
      email = (data?.user?.email || "").toLowerCase();
    } catch (_) { /* ignore */ }
    if (!email) {
      try {
        const payload = JSON.parse(atob((token.split(".")[1] || "").replace(/-/g, "+").replace(/_/g, "/")));
        email = String(payload.email || "").toLowerCase();
      } catch (_) { /* ignore */ }
    }
    if (!email || ADMINS.indexOf(email) < 0) return j({ error: "Nur der Admin darf Benutzer verwalten." }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "list");

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return j({ error: error.message }, 500);
      const users = (data?.users || []).map((x: any) => ({
        id: x.id, email: x.email, created_at: x.created_at, last_sign_in_at: x.last_sign_in_at,
        perms: (x.app_metadata && x.app_metadata.perms) || null,
      }));
      return j({ users });
    }

    if (action === "create") {
      const mail = String(body.email || "").trim().toLowerCase();
      const pw = String(body.password || "");
      if (!mail || pw.length < 6) return j({ error: "E-Mail und Passwort (min. 6 Zeichen) erforderlich." }, 400);
      const perms = body.perms && typeof body.perms === "object" ? body.perms : undefined;
      const { data, error } = await admin.auth.admin.createUser({
        email: mail, password: pw, email_confirm: true,
        ...(perms ? { app_metadata: { perms } } : {}),
      });
      if (error) return j({ error: error.message }, 400);
      return j({ ok: true, id: data?.user?.id });
    }

    if (action === "perms") {
      const id = String(body.id || "");
      if (!id) return j({ error: "ID fehlt." }, 400);
      const perms = body.perms && typeof body.perms === "object" ? body.perms : {};
      const { error } = await admin.auth.admin.updateUserById(id, { app_metadata: { perms } });
      if (error) return j({ error: error.message }, 400);
      return j({ ok: true });
    }

    if (action === "password") {
      const id = String(body.id || "");
      const pw = String(body.password || "");
      if (!id || pw.length < 6) return j({ error: "Passwort (min. 6 Zeichen) erforderlich." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password: pw });
      if (error) return j({ error: error.message }, 400);
      return j({ ok: true });
    }

    if (action === "delete") {
      const id = String(body.id || "");
      if (!id) return j({ error: "ID fehlt." }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return j({ error: error.message }, 400);
      return j({ ok: true });
    }

    if (action === "usage") {
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await admin
        .from("usage_log").select("email,ts").gte("ts", since)
        .order("ts", { ascending: true }).limit(50000);
      if (error) return j({ error: error.message }, 500);
      return j({ rows: data || [] });
    }

    return j({ error: "Unbekannte Aktion." }, 400);
  } catch (e) {
    return j({ error: String((e && (e as any).message) || e) }, 500);
  }
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
