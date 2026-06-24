import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { completeProfile } from "@/lib/profile.functions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/complete-profile")({
  head: () => ({ meta: [{ title: "Completar cadastro — Frotas" }] }),
  component: CompleteProfilePage,
});

function CompleteProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const completeFn = useServerFn(completeProfile);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = fd.get("full_name") as string;
    const masp = fd.get("masp") as string;
    setLoading(true);
    try {
      await completeFn({ full_name, masp });
      toast.success("Perfil atualizado");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Erro ao salvar perfil");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        <form onSubmit={handle} className="space-y-4 bg-card p-6 rounded shadow">
          <div>
            <Label htmlFor="full_name">Nome completo</Label>
            <Input id="full_name" name="full_name" required />
          </div>
          <div>
            <Label htmlFor="masp">MASP (opcional)</Label>
            <Input id="masp" name="masp" />
          </div>
          <Button type="submit" disabled={loading} className="w-full">Concluir cadastro</Button>
        </form>
      </div>
    </div>
  );
}
