import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const completeProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ full_name: z.string().min(2).optional(), masp: z.string().optional() })
      .parse(data)
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    const { error } = await supabase.rpc("update_profile_by_user_id", {
      _user_id: userId,
      _full_name: data.full_name ?? null,
      _masp: data.masp ?? null,
    });
    if (error) throw error;
    return { ok: true };
  });
