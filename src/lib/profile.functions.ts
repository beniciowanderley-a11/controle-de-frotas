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
    const update: any = {};
    if (data.full_name) update.full_name = data.full_name;
    if (data.masp) update.masp = data.masp;
    const { error } = await supabase.from("profiles").update(update).eq("id", userId);
    if (error) throw error;
    return { ok: true };
  });
