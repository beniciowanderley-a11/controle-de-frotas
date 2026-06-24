import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Acesso — Frotas" }] }),
  component: AuthPage,
});

const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .max(255)
    .refine(
      (email) => email.toLowerCase().endsWith("@educacao.mg.gov.br"),
      { message: "Apenas e-mails @educacao.mg.gov.br podem acessar" }
    ),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    async function syncSession() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }

      if (
        typeof window !== "undefined" &&
        (window.location.href.includes("access_token") ||
          window.location.href.includes("refresh_token") ||
          window.location.href.includes("type=magiclink"))
      ) {
        setNotice("Finalizando login... Aguarde um momento.");
        const { data, error } = await supabase.auth.getSessionFromUrl();
        if (error) {
          console.error(error);
          toast.error("Erro ao processar o login de redirecionamento.");
          setNotice("Não foi possível completar o login. Tente novamente.");
          return;
        }
        if (data.session) {
          window.history.replaceState({}, document.title, window.location.pathname);
          navigate({ to: "/dashboard", replace: true });
          return;
        }
        toast.error("Login inválido ou expirado.");
      }
    }

    syncSession();
  }, [navigate]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      email: fd.get("email"),
    };
    const parsed = emailSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: { emailRedirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
      setNotice("Enviamos um link de acesso para o seu e-mail. Abra-o e retorne a esta página.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao enviar link de acesso");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-sidebar via-sidebar to-primary">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-6 text-sidebar-foreground">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center shadow-elev">
            <Truck className="w-7 h-7 text-accent-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Controle de Frotas</h1>
          <p className="text-sm opacity-80">Gestão de viagens corporativas</p>
        </div>
        <Card className="shadow-elev">
          <CardHeader>
            <CardTitle>Acesso ao sistema</CardTitle>
            <CardDescription>Use seu e-mail @educacao.mg.gov.br para entrar.</CardDescription>
          </CardHeader>
          <CardContent>
            {notice ? (
              <div className="rounded-lg border border-border/50 bg-muted p-4 text-sm text-foreground">
                {notice}
              </div>
            ) : null}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" name="email" type="email" required maxLength={255} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                Enviar link de acesso
              </Button>
            </form>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-sidebar-foreground/70">
          Apenas e-mails @educacao.mg.gov.br podem acessar esta plataforma.
        </p>
      </div>
    </div>
  );
}
