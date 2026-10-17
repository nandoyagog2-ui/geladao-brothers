// VYNTRA · Conector de IA (MCP) — ponto de entrada na Supabase (Edge Function)
// A lógica fica em core.js. Publicar sem "Verify JWT": o próprio conector confere o login
// (precisa responder 401 com o endereço do login pro Claude conseguir conectar).
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeHandler } from "./core.js";

const handle = makeHandler({
  createClient,
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  publicUrl: Deno.env.get("MCP_PUBLIC_URL") || undefined,
});

Deno.serve(async (req: Request) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "server_error", message: String((e as Error)?.message || e) }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
