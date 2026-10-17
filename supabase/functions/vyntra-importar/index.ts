// VYNTRA · Importar cardápio do Cardápio Web — ponto de entrada (Edge Function). Lógica em core.js.
import { createClient } from "npm:@supabase/supabase-js@2";
import { makeHandler } from "./core.js";

const handle = makeHandler({
  createClient,
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
});

Deno.serve((req: Request) => handle(req));
