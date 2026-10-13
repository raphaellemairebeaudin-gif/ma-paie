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

function plaidBaseUrl(environment: string): string {
  const urls: Record<string, string> = {
    sandbox: "https://sandbox.plaid.com",
    development: "https://development.plaid.com",
    production: "https://production.plaid.com",
  };
  const url = urls[environment];
  if (!url) throw new Error("PLAID_ENV doit être sandbox, development ou production.");
  return url;
}

async function plaidRequest(
  baseUrl: string,
  clientId: string,
  secret: string,
  path: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = data as { error_code?: string; error_message?: string };
    throw new Error(`${error.error_code || "PLAID_ERROR"}: ${error.error_message || "La requête Plaid a échoué."}`);
  }
  return data as Record<string, unknown>;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function encryptAccessToken(token: string, keyText: string) {
  const keyBytes = decodeBase64(keyText);
  if (keyBytes.length !== 32) {
    throw new Error("PLAID_TOKEN_ENCRYPTION_KEY doit être une clé Base64 de 32 octets.");
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(token),
  );
  return {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    nonce: btoa(String.fromCharCode(...nonce)),
  };
}

async function decryptAccessToken(ciphertext: string, nonce: string, keyText: string): Promise<string> {
  const keyBytes = decodeBase64(keyText);
  if (keyBytes.length !== 32) {
    throw new Error("PLAID_TOKEN_ENCRYPTION_KEY doit être une clé Base64 de 32 octets.");
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(nonce) },
    key,
    decodeBase64(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

type PlaidAccount = {
  account_id: string;
  type: string;
  name: string;
  official_name?: string | null;
  mask?: string | null;
  balances?: {
    current?: number | null;
    available?: number | null;
    iso_currency_code?: string | null;
    unofficial_currency_code?: string | null;
  };
};

async function syncItemAccounts(
  db: ReturnType<typeof createClient>,
  item: { item_id: string; user_id: string; institution_name: string; access_token_ciphertext: string; access_token_nonce: string },
  environment: string,
  clientId: string,
  secret: string,
  encryptionKey: string,
): Promise<number> {
  const accessToken = await decryptAccessToken(item.access_token_ciphertext, item.access_token_nonce, encryptionKey);
  const data = await plaidRequest(plaidBaseUrl(environment), clientId, secret, "/accounts/balance/get", {
    access_token: accessToken,
  });
  const accounts = data.accounts as PlaidAccount[];
  const rows = accounts
    .filter((account) => account.type === "depository" || account.type === "credit")
    .flatMap((account) => {
      const currency = account.balances?.iso_currency_code || account.balances?.unofficial_currency_code;
      if (currency !== "CAD") return [];
      const balance = account.type === "credit"
        ? account.balances?.current
        : account.balances?.current ?? account.balances?.available;
      if (balance === null || balance === undefined || !Number.isFinite(balance)) return [];
      if (Math.abs(balance) > 9999999999.99) {
        throw new Error("Un solde Plaid dépasse la limite prise en charge par l’application.");
      }
      const isCredit = account.type === "credit";
      const signedBalance = isCredit ? -Math.abs(balance) : balance;
      const accountLabel = `${item.institution_name} · ${account.official_name || account.name}${account.mask ? ` • ${account.mask}` : ""}`.slice(0, 80);
      return [{
        user_id: item.user_id,
        account_type: isCredit ? "credit" : "debit",
        name: accountLabel,
        signed_balance: signedBalance,
        balance_direction: signedBalance < 0 ? "negative" : "positive",
        plaid_item_id: item.item_id,
        plaid_account_id: account.account_id,
      }];
    });

  if (rows.length) {
    const { error } = await db.from("app_accounts").upsert(rows, { onConflict: "plaid_account_id" });
    if (error) throw new Error(`Enregistrement des soldes impossible : ${error.message}`);
  }
  const { data: existingAccounts, error: existingError } = await db.from("app_accounts")
    .select("plaid_account_id")
    .eq("user_id", item.user_id)
    .eq("plaid_item_id", item.item_id);
  if (existingError) throw new Error(`Vérification des comptes synchronisés impossible : ${existingError.message}`);
  const currentIds = new Set(rows.map((row) => row.plaid_account_id));
  const staleIds = (existingAccounts || [])
    .map((account: { plaid_account_id: string }) => account.plaid_account_id)
    .filter((accountId: string) => !currentIds.has(accountId));
  if (staleIds.length) {
    const { error } = await db.from("app_accounts").delete()
      .eq("user_id", item.user_id)
      .eq("plaid_item_id", item.item_id)
      .in("plaid_account_id", staleIds);
    if (error) throw new Error(`Nettoyage des comptes synchronisés impossible : ${error.message}`);
  }
  return rows.length;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return jsonResponse({ error: "Authentification requise." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SB_SERVICE_ROLE_KEY");
  const plaidClientId = Deno.env.get("PLAID_CLIENT_ID");
  const plaidSecret = Deno.env.get("PLAID_SECRET");
  const plaidEnvironment = Deno.env.get("PLAID_ENV") || "sandbox";
  const encryptionKey = Deno.env.get("PLAID_TOKEN_ENCRYPTION_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !plaidClientId || !plaidSecret || !encryptionKey) {
    console.error("Missing server configuration for Plaid.");
    return jsonResponse({ error: "La connexion bancaire n’est pas encore configurée sur le serveur." }, 500);
  }

  let baseUrl: string;
  try {
    baseUrl = plaidBaseUrl(plaidEnvironment);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Configuration Plaid invalide." }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${tokenMatch[1]}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return jsonResponse({ error: "La session est invalide ou expirée." }, 401);
  const user = userData.user;
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { action?: unknown; public_token?: unknown; institution_name?: unknown; item_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "La demande est invalide." }, 400);
  }

  try {
    if (body.action === "create-link-token") {
      const data = await plaidRequest(baseUrl, plaidClientId, plaidSecret, "/link/token/create", {
        client_name: "Budget App",
        country_codes: ["CA"],
        language: "fr",
        user: { client_user_id: user.id },
        products: ["transactions"],
      });
      return jsonResponse({ link_token: data.link_token });
    }

    if (body.action === "exchange-public-token") {
      if (
        typeof body.public_token !== "string" ||
        !body.public_token ||
        typeof body.institution_name !== "string" ||
        !body.institution_name.trim()
      ) {
        return jsonResponse({ error: "La connexion bancaire est incomplète." }, 400);
      }
      const exchanged = await plaidRequest(baseUrl, plaidClientId, plaidSecret, "/item/public_token/exchange", {
        public_token: body.public_token,
      }) as { access_token: string; item_id: string };
      const encrypted = await encryptAccessToken(exchanged.access_token, encryptionKey);
      const { error: insertError } = await db.from("plaid_items").insert({
        item_id: exchanged.item_id,
        user_id: user.id,
        institution_name: body.institution_name.slice(0, 100),
        access_token_ciphertext: encrypted.ciphertext,
        access_token_nonce: encrypted.nonce,
      });
      if (insertError) throw new Error(`Enregistrement de la connexion impossible : ${insertError.message}`);

      const item = {
        item_id: exchanged.item_id,
        user_id: user.id,
        institution_name: body.institution_name.slice(0, 100),
        access_token_ciphertext: encrypted.ciphertext,
        access_token_nonce: encrypted.nonce,
      };
      const accountCount = await syncItemAccounts(db, item, plaidEnvironment, plaidClientId, plaidSecret, encryptionKey);
      if (!accountCount) {
        await plaidRequest(baseUrl, plaidClientId, plaidSecret, "/item/remove", { access_token: exchanged.access_token });
        const { error: cleanupError } = await db.from("plaid_items")
          .delete().eq("item_id", exchanged.item_id).eq("user_id", user.id);
        if (cleanupError) throw new Error(`Aucun compte CAD n’a été trouvé et la connexion n’a pas pu être nettoyée : ${cleanupError.message}`);
        return jsonResponse({ error: "Plaid n’a trouvé aucun compte compatible avec un solde en dollars canadiens." }, 422);
      }
      const { data: accounts, error: accountError } = await db.from("app_accounts")
        .select("id,user_id,account_type,name,signed_balance,balance_direction,created_at,plaid_item_id,plaid_account_id")
        .eq("user_id", user.id)
        .eq("plaid_item_id", exchanged.item_id);
      if (accountError) throw new Error(`Lecture des soldes impossible : ${accountError.message}`);
      return jsonResponse({ success: true, accounts });
    }

    if (body.action === "refresh-balances") {
      const { data: items, error: itemsError } = await db.from("plaid_items")
        .select("item_id,user_id,institution_name,access_token_ciphertext,access_token_nonce")
        .eq("user_id", user.id);
      if (itemsError) throw new Error(`Lecture des connexions bancaires impossible : ${itemsError.message}`);
      for (const item of items || []) {
        await syncItemAccounts(db, item, plaidEnvironment, plaidClientId, plaidSecret, encryptionKey);
      }
      const { data: accounts, error: accountError } = await db.from("app_accounts")
        .select("id,user_id,account_type,name,signed_balance,balance_direction,created_at,plaid_item_id,plaid_account_id")
        .eq("user_id", user.id)
        .not("plaid_item_id", "is", null)
        .order("created_at", { ascending: true });
      if (accountError) throw new Error(`Lecture des soldes impossible : ${accountError.message}`);
      return jsonResponse({ success: true, accounts });
    }

    if (body.action === "disconnect" && typeof body.item_id === "string") {
      const { data: item, error: itemError } = await db.from("plaid_items")
        .select("item_id,access_token_ciphertext,access_token_nonce")
        .eq("item_id", body.item_id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (itemError) throw new Error(`Lecture de la connexion impossible : ${itemError.message}`);
      if (!item) return jsonResponse({ error: "Cette connexion bancaire est introuvable." }, 404);
      const accessToken = await decryptAccessToken(item.access_token_ciphertext, item.access_token_nonce, encryptionKey);
      await plaidRequest(baseUrl, plaidClientId, plaidSecret, "/item/remove", { access_token: accessToken });
      const { error: deleteAccountsError } = await db.from("app_accounts")
        .delete().eq("user_id", user.id).eq("plaid_item_id", item.item_id);
      if (deleteAccountsError) throw new Error(`Suppression des comptes importés impossible : ${deleteAccountsError.message}`);
      const { error: deleteItemError } = await db.from("plaid_items")
        .delete().eq("item_id", item.item_id).eq("user_id", user.id);
      if (deleteItemError) throw new Error(`Suppression de la connexion impossible : ${deleteItemError.message}`);
      return jsonResponse({ success: true });
    }

    if (body.action === "disconnect-all") {
      const { data: items, error: itemsError } = await db.from("plaid_items")
        .select("item_id,access_token_ciphertext,access_token_nonce")
        .eq("user_id", user.id);
      if (itemsError) throw new Error(`Lecture des connexions bancaires impossible : ${itemsError.message}`);
      for (const item of items || []) {
        const accessToken = await decryptAccessToken(item.access_token_ciphertext, item.access_token_nonce, encryptionKey);
        await plaidRequest(baseUrl, plaidClientId, plaidSecret, "/item/remove", { access_token: accessToken });
        const { error: deleteAccountsError } = await db.from("app_accounts")
          .delete().eq("user_id", user.id).eq("plaid_item_id", item.item_id);
        if (deleteAccountsError) throw new Error(`Suppression des comptes importés impossible : ${deleteAccountsError.message}`);
        const { error: deleteItemError } = await db.from("plaid_items")
          .delete().eq("item_id", item.item_id).eq("user_id", user.id);
        if (deleteItemError) throw new Error(`Suppression de la connexion impossible : ${deleteItemError.message}`);
      }
      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: "Action Plaid inconnue." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "La demande Plaid a échoué.";
    console.error("Plaid request failed:", message);
    return jsonResponse({ error: message.slice(0, 300) }, 502);
  }
});
