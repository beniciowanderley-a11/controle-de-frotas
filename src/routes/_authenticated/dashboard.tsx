import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Users, MapPin, Route as RouteIcon, Plus, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Painel — Frotas" }] }),
  component: Dashboard,
});

const STATUS_LABEL: Record<string, string> = {
  agendada: "Agendada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  agendada: "outline",
  em_andamento: "default",
  concluida: "secondary",
  cancelada: "destructive",
};

function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { data } = useQuery({
    queryKey: ["dashboard", isAdmin ? "admin" : user?.id],
    queryFn: async () => {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(); end.setHours(23, 59, 59, 999);

      if (isAdmin) {
        const [v, d, dest, t, today] = await Promise.all([
          supabase.from("vehicles").select("id", { count: "exact", head: true }),
          supabase.from("drivers").select("id", { count: "exact", head: true }),
          supabase.from("destinations").select("id", { count: "exact", head: true }),
          supabase.from("trips").select("id, status", { count: "exact" }),
          supabase
            .from("trips")
            .select("id, data_saida, data_retorno, status, motivo, vehicles(placa, modelo), drivers(nome), destinations(nome)")
            .in("status", ["agendada", "em_andamento"])
            .gte("data_saida", start.toISOString())
            .lte("data_saida", end.toISOString())
            .order("data_saida", { ascending: true }),
        ]);
        return {
          vehicles: v.count ?? 0,
          drivers: d.count ?? 0,
          destinations: dest.count ?? 0,
          trips: t.count ?? 0,
          emAndamento: (t.data ?? []).filter((x) => x.status === "em_andamento").length,
          today: today.data ?? [],
        };
      }

      const [t, today] = await Promise.all([
        supabase
          .from("trips")
          .select("id, status", { count: "exact" })
          .or(`created_by.eq.${user?.id},trip_passengers.user_id.eq.${user?.id}`),
        supabase
          .from("trips")
          .select("id, data_saida, data_retorno, status, motivo, vehicles(placa, modelo), drivers(nome), destinations(nome)")
          .in("status", ["agendada", "em_andamento"])
          .gte("data_saida", start.toISOString())
          .lte("data_saida", end.toISOString())
          .or(`created_by.eq.${user?.id},trip_passengers.user_id.eq.${user?.id}`)
          .order("data_saida", { ascending: true }),
      ]);

      return {
        trips: t.count ?? 0,
        emAndamento: (t.data ?? []).filter((x) => x.status === "em_andamento").length,
        today: today.data ?? [],
      };
    },
    enabled: !!user || isAdmin,
  });

  const stats = [
    { label: "Viagens", value: data?.trips ?? 0, icon: RouteIcon, accent: "text-primary" },
    { label: "Em andamento", value: data?.emAndamento ?? 0, icon: RouteIcon, accent: "text-success" },
  ];

  if (isAdmin) {
    stats.push(
      { label: "Veículos", value: data?.vehicles ?? 0, icon: Truck, accent: "text-accent" },
      { label: "Motoristas", value: data?.drivers ?? 0, icon: Users, accent: "text-accent" },
      { label: "Destinos", value: data?.destinations ?? 0, icon: MapPin, accent: "text-accent" }
    );
  }

  const hoje = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Painel</h1>
          <p className="text-muted-foreground text-sm">Visão geral da frota e das viagens.</p>
        </div>
        <Button asChild>
          <Link to="/viagens" search={{ new: 1 } as any}><Plus className="w-4 h-4 mr-1" /> Nova viagem</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <s.icon className={`w-4 h-4 ${s.accent}`} />
              </div>
              <p className="text-2xl font-bold mt-2">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Viagens de hoje</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Agendadas ou em andamento — {hoje}</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/viagens">Ver todas <ArrowRight className="w-3 h-3 ml-1" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {data?.today.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma viagem agendada ou em andamento para hoje.
            </p>
          ) : (
            <div className="space-y-2">
              {data?.today.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{t.destinations?.nome}</p>
                      <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {t.vehicles?.placa} • {t.drivers?.nome} • {format(new Date(t.data_saida), "HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
