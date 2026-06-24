import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const attachAuthPriority = createMiddleware({ type: "function" }).client(async ({ next }) => {
  try {
    const { data } = await supabase.auth.getSession();
    const supToken = data.session?.access_token;
    if (supToken) return next({ headers: { Authorization: `Bearer ${supToken}` } });
  } catch (e) {
    // ignore
  }

  if (typeof window !== "undefined") {
    const quick = localStorage.getItem("APP_QUICK_JWT");
    if (quick) return next({ headers: { Authorization: `Bearer ${quick}` } });
  }

  return next({ headers: {} });
});
