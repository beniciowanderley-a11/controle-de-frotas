import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Acesso — Frotas" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
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
          window.location.href.includes("type=oauth"))
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

  async function handleGoogleLogin() {
    setNotice("Abrindo Google para autenticação...");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Erro ao iniciar login com Google");
      setNotice(null);
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
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Clique no botão abaixo para autenticar com sua conta Google.
                Se você estiver logado no Google, bastará selecionar o e-mail correto.
              </p>
              <Button className="w-full" onClick={handleGoogleLogin}>
                Entrar com Google
              </Button>
            </div>
          </CardContent>
        </Card>
        <p className="mt-4 text-center text-xs text-sidebar-foreground/70">
          Apenas e-mails @educacao.mg.gov.br podem acessar esta plataforma.
        </p>
      </div>
    </div>
  );
}
