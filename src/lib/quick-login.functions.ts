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

    const { data: userIdData, error: rpcErr } = await supabaseAdmin.rpc(
      "get_or_create_profile_by_email",
      { _email: email }
    );
    if (rpcErr) {
      console.error("quickLogin rpc error:", rpcErr);
      throw rpcErr;
    }
    const userId = (userIdData as any) as string;
    if (!userId) {
      throw new Error("Não foi possível criar ou localizar o perfil");
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("Missing JWT_SECRET environment variable");

    const token = signJwt({ sub: userId, email }, secret, 60 * 60 * 24 * 7);
    return { token, userId };
  });
