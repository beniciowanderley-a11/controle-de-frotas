import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signJwt } from "@/lib/jwt";

export const quickLogin = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ email: z.string().email() }).parse(data))
  .handler(async ({ data }) => {
    const email = (data.email as string).toLowerCase();
    if (!email.endsWith("@educacao.mg.gov.br")) {
      throw new Error("E-mail não autorizado");
    }

    // Find existing profile
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (selErr) {
      console.error("quickLogin select error:", selErr);
      throw selErr;
    }

    let userId: string;
    if (existing && (existing as any).id) {
      userId = (existing as any).id;
    } else {
      const id = typeof crypto !== "undefined" && (crypto as any).randomUUID ? (crypto as any).randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
      const { data: ins, error: insErr } = await supabaseAdmin
        .from("profiles")
        .insert({ id, email, status: "active" })
        .select("id")
        .maybeSingle();
      if (insErr) {
        console.error("quickLogin insert error:", insErr);
        throw insErr;
      }
      userId = (ins as any).id;
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Missing JWT_SECRET environment variable");

    const token = signJwt({ sub: userId, email }, secret, 60 * 60 * 24 * 7);
    return { token, userId };
  });
