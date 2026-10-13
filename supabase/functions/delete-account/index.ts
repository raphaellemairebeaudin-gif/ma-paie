import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return jsonResponse({ error: "Authentification requise." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Missing Supabase environment configuration for delete-account.");
    return jsonResponse({ error: "La suppression du compte n’est pas configurée sur le serveur." }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userResult, error: userError } = await authClient.auth.getUser(tokenMatch[1]);
  if (userError || !userResult.user) {
    return jsonResponse({ error: "La session est invalide ou expirée." }, 401);
  }

  let body: { action?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "La demande est invalide." }, 400);
  }

  const user = userResult.user;
  if (body.action === "send-code") {
    if (!user.email) {
      return jsonResponse({ error: "Aucune adresse courriel n’est associée à ce compte." }, 400);
    }

    const { error: sendError } = await authClient.auth.signInWithOtp({
      email: user.email,
      options: { shouldCreateUser: false },
    });
    if (sendError) {
      console.error("Account deletion confirmation email failed:", sendError.message);
      const detail = sendError.message.replace(/[\r\n]+/g, " ").slice(0, 300);
      return jsonResponse({
        error: `Supabase n’a pas pu envoyer le code de confirmation. Détail : ${detail}`,
      }, 502);
    }

    return jsonResponse({ success: true });
  }

  if (body.action !== "confirm" || typeof body.code !== "string" || !/^\d{6}$/.test(body.code)) {
    return jsonResponse({ error: "La demande de confirmation est invalide." }, 400);
  }

  if (!user.email) {
    return jsonResponse({ error: "Aucune adresse courriel n’est associée à ce compte." }, 400);
  }

  const { data: verification, error: verificationError } = await authClient.auth.verifyOtp({
    email: user.email,
    token: body.code,
    type: "email",
  });
  if (verificationError || !verification.user || verification.user.id !== user.id) {
    return jsonResponse({ error: "Le code est invalide ou expiré. Vérifie le code ou demande-en un nouveau." }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: plaidItems, error: plaidItemsError } = await adminClient.from("plaid_items")
    .select("item_id")
    .eq("user_id", user.id);
  if (plaidItemsError) {
    console.error("Could not load Plaid connections before account deletion:", plaidItemsError.message);
    return jsonResponse({ error: "Supabase n’a pas pu vérifier les connexions bancaires avant la suppression. Réessaie plus tard." }, 500);
  }
  if (plaidItems && plaidItems.length > 0) {
    const plaidResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/plaid`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenMatch[1]}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "disconnect-all" }),
    });
    const plaidResult = await plaidResponse.json() as { success?: boolean; error?: string };
    if (!plaidResponse.ok || plaidResult.success !== true) {
      const detail = typeof plaidResult.error === "string" ? plaidResult.error : "Déconnecte d’abord les banques Plaid, puis réessaie.";
      return jsonResponse({ error: `Impossible de révoquer les connexions bancaires : ${detail}` }, 502);
    }
  }
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Supabase user deletion failed:", deleteError.message);
    return jsonResponse({ error: "Supabase n’a pas pu supprimer le compte. Réessaie plus tard." }, 500);
  }

  return jsonResponse({ success: true });
});
