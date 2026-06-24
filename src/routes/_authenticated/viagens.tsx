import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Plus, Trash2, Calendar as CalIcon, MapPin, User, Truck, Pencil, UserPlus, Users as UsersIcon, X, Check, Phone } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/viagens")({
  head: () => ({ meta: [{ title: "Viagens — Frotas" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ new: s.new ? 1 : undefined }) as { new?: 1 },
  component: TripsPage,
});

const STATUS = [
  { v: "agendada", l: "Agendada" },
  { v: "em_andamento", l: "Em andamento" },
  { v: "concluida", l: "Concluída" },
  { v: "cancelada", l: "Cancelada" },
] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  agendada: "outline", em_andamento: "default", concluida: "secondary", cancelada: "destructive",
};

const tripSchema = z.object({
  vehicle_id: z.string().uuid("Selecione um veículo"),
  driver_id: z.string().uuid("Selecione um motorista"),
  destination_id: z.string().uuid("Selecione um destino principal"),
  data_saida: z.string().min(1, "Data de saída obrigatória"),
  data_retorno: z.string().optional().or(z.literal("")),
  motivo: z.string().trim().max(500).optional().or(z.literal("")),
  observacoes: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["agendada", "em_andamento", "concluida", "cancelada"]),
});

function TripsPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const search = useSearch({ from: "/_authenticated/viagens" }) as { new?: 1 };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(() => new Date());
  const [paxDialogTrip, setPaxDialogTrip] = useState<any | null>(null);
  const [initialPax, setInitialPax] = useState<string[]>([]);
  const [paxSearch, setPaxSearch] = useState("");

  useEffect(() => {
    if (search.new && isAdmin) {
      setEditing(null);
      setInitialPax([]);
      setOpen(true);
    }
  }, [search.new, isAdmin]);

  const { data: profiles } = useQuery({
    queryKey: ["profiles", "admin"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_profiles_admin");
      if (error) throw error;
      return (data ?? []).filter((p: any) => p.status === "ativo");
    },
  });

  const { data: trips, isLoading } = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select(`
          *,
          vehicles(placa, modelo, capacidade),
          drivers(nome, telefone),
          destinations(nome),
          trip_passengers(id, user_id, destination_id, added_by, profiles:user_id(full_name), destinations(nome))
        `)
        .order("data_saida", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: vehicles } = useQuery({
    queryKey: ["vehicles", "select"],
    queryFn: async () => (await supabase.from("vehicles").select("id, placa, modelo, capacidade").order("placa")).data ?? [],
  });
  const { data: drivers } = useQuery({
    queryKey: ["drivers", "select"],
    queryFn: async () => (await supabase.from("drivers").select("id, nome").order("nome")).data ?? [],
  });
  const { data: dests } = useQuery({
    queryKey: ["destinations", "select"],
    queryFn: async () => (await supabase.from("destinations").select("id, nome").order("nome")).data ?? [],
  });

  const saveTrip = useMutation({
    mutationFn: async (input: z.infer<typeof tripSchema> & { id?: string; passengers?: string[] }) => {
      const payload = {
        vehicle_id: input.vehicle_id,
        driver_id: input.driver_id,
        destination_id: input.destination_id,
        data_saida: new Date(input.data_saida).toISOString(),
        data_retorno: input.data_retorno ? new Date(input.data_retorno).toISOString() : null,
        motivo: input.motivo || null,
        observacoes: input.observacoes || null,
        status: input.status,
      };
      let tripId = input.id;
      if (input.id) {
        const { error } = await supabase.from("trips").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("trips").insert({ ...payload, created_by: user!.id }).select("id").single();
        if (error) throw error;
        tripId = data.id;
      }
      if (!input.id && input.passengers && input.passengers.length > 0 && tripId) {
        const rows = input.passengers.map((uid) => ({
          trip_id: tripId!,
          user_id: uid,
          destination_id: input.destination_id,
          added_by: user!.id,
        }));
        const { error } = await supabase.from("trip_passengers").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(editing ? "Viagem atualizada" : "Viagem registrada");
      setOpen(false);
      setEditing(null);
      setInitialPax([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delTrip = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("Viagem removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = tripSchema.safeParse({
      vehicle_id: fd.get("vehicle_id"),
      driver_id: fd.get("driver_id"),
      destination_id: fd.get("destination_id"),
      data_saida: fd.get("data_saida"),
      data_retorno: fd.get("data_retorno") ?? "",
      motivo: fd.get("motivo") ?? "",
      observacoes: fd.get("observacoes") ?? "",
      status: fd.get("status"),
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    if (parsed.data.data_retorno) {
      const ds = new Date(parsed.data.data_saida).getTime();
      const dr = new Date(parsed.data.data_retorno).getTime();
      if (dr < ds) {
        toast.error("A data/hora de retorno não pode ser anterior à de saída.");
        return;
      }
    }

    if (parsed.data.status === "cancelada" && !(parsed.data.motivo && parsed.data.motivo.trim().length > 0)) {
      toast.error("Para cancelar a viagem, informe o motivo do cancelamento no campo 'Motivo'.");
      return;
    }

    const ACTIVE = new Set(["agendada", "em_andamento"]);
    if (ACTIVE.has(parsed.data.status)) {
      const newStart = new Date(parsed.data.data_saida).getTime();
      const newEnd = parsed.data.data_retorno ? new Date(parsed.data.data_retorno).getTime() : newStart;
      const conflict = (trips ?? []).find((t: any) => {
        if (editing && t.id === editing.id) return false;
        if (!ACTIVE.has(t.status)) return false;
        if (t.vehicle_id !== parsed.data.vehicle_id && t.driver_id !== parsed.data.driver_id) return false;
        const oStart = new Date(t.data_saida).getTime();
        const oEnd = t.data_retorno ? new Date(t.data_retorno).getTime() : oStart;
        return newStart <= oEnd && oStart <= newEnd;
      });
      if (conflict) {
        const which = conflict.vehicle_id === parsed.data.vehicle_id ? "veículo" : "motorista";
        toast.error(`Conflito de ${which}: já existe viagem ativa para ${conflict.destinations?.nome ?? "outro destino"} em ${format(new Date(conflict.data_saida), "dd/MM/yyyy HH:mm")}. Conclua ou cancele aquela viagem antes.`);
        return;
      }
    }

    saveTrip.mutate({ ...parsed.data, id: editing?.id, passengers: editing ? undefined : initialPax });
  }

  function toLocalInput(iso?: string | null) {
    if (!iso) return "";
    const d = new Date(iso);
    const off = d.getTimezoneOffset();
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
  }

  const canDeleteTrip = (t: any) => isAdmin || t.created_by === user?.id;

  const tripsByDay = useMemo(() => {
    const map = new Map<string, number>();
    (trips ?? []).forEach((t) => {
      const key = format(new Date(t.data_saida), "yyyy-MM-dd");
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return map;
  }, [trips]);

  const filteredTrips = useMemo(() => {
    if (!selectedDate) return trips ?? [];
    return (trips ?? []).filter((t) => isSameDay(new Date(t.data_saida), selectedDate));
  }, [trips, selectedDate]);

  const noRefs = !vehicles?.length || !drivers?.length || !dests?.length;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Viagens</h1>
          <p className="text-muted-foreground text-sm">Calendário, vagas e passageiros de cada rota.</p>
        </div>
        {isAdmin && (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditing(null); setInitialPax([]); setPaxSearch(""); } }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setInitialPax([]); setOpen(true); }} disabled={noRefs}>
              <Plus className="w-4 h-4 mr-1" /> Nova viagem
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar viagem" : "Registrar viagem"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>Veículo *</Label>
                  <Select name="vehicle_id" defaultValue={editing?.vehicle_id} required>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {vehicles?.map((v: any) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.placa} — {v.modelo}{v.capacidade ? ` (${v.capacidade} lugares)` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Motorista *</Label>
                  <Select name="driver_id" defaultValue={editing?.driver_id} required>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {drivers?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Destino principal *</Label>
                  <Select name="destination_id" defaultValue={editing?.destination_id} required>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {dests?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Data/hora de saída *</Label>
                  <Input name="data_saida" type="datetime-local" required defaultValue={toLocalInput(editing?.data_saida)} />
                </div>
                <div className="space-y-2">
                  <Label>Data/hora de retorno</Label>
                  <Input name="data_retorno" type="datetime-local" defaultValue={toLocalInput(editing?.data_retorno)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input name="motivo" maxLength={500} defaultValue={editing?.motivo ?? ""} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea name="observacoes" rows={2} maxLength={1000} defaultValue={editing?.observacoes ?? ""} />
              </div>
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select name="status" defaultValue={editing?.status ?? "agendada"} required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!editing && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2"><UsersIcon className="w-4 h-4" /> Viajantes</Label>
                  <p className="text-xs text-muted-foreground">Selecione os usuários que farão a viagem. Eles desembarcarão no destino principal — você pode ajustar paradas individuais depois.</p>
                  <Input
                    placeholder="Buscar por nome, e-mail ou MASP..."
                    value={paxSearch}
                    onChange={(e) => setPaxSearch(e.target.value)}
                  />
                  <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                    {(() => {
                      const q = paxSearch.trim().toLowerCase();
                      const list = (profiles ?? []).filter((p: any) => {
                        if (!q) return true;
                        return (p.full_name ?? "").toLowerCase().includes(q)
                          || (p.email ?? "").toLowerCase().includes(q)
                          || (p.masp ?? "").toLowerCase().includes(q);
                      });
                      if (list.length === 0) return <p className="p-3 text-sm text-muted-foreground">Nenhum usuário encontrado.</p>;
                      return list.map((p: any) => {
                        const checked = initialPax.includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => {
                                setInitialPax((prev) => v ? [...prev, p.id] : prev.filter((x) => x !== p.id));
                              }}
                            />
                            <span className="text-sm flex-1 truncate">{p.full_name ?? p.email}</span>
                            {p.masp && <span className="text-xs text-muted-foreground tabular-nums">{p.masp}</span>}
                          </label>
                        );
                      });
                    })()}
                  </div>
                  {initialPax.length > 0 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Check className="w-3 h-3" /> {initialPax.length} viajante{initialPax.length > 1 ? "s" : ""} selecionado{initialPax.length > 1 ? "s" : ""}
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Use o botão "Passageiros" no card da viagem para gerenciar paradas individuais depois.
              </p>
              <DialogFooter>
                <Button type="submit" disabled={saveTrip.isPending}>{editing ? "Atualizar" : "Registrar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      {noRefs && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="py-4 text-sm">
            Antes de registrar uma viagem, cadastre pelo menos um <b>veículo</b>, um <b>motorista</b> e um <b>destino</b>.
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        <Card className="shadow-card h-fit">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold flex items-center gap-2"><CalIcon className="w-4 h-4" /> Calendário</p>
              {selectedDate && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)} className="h-7 px-2 text-xs">
                  <X className="w-3 h-3 mr-1" /> Limpar
                </Button>
              )}
            </div>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={ptBR}
              className={cn("p-0 pointer-events-auto")}
              modifiers={{
                hasTrip: (date) => tripsByDay.has(format(date, "yyyy-MM-dd")),
              }}
              modifiersClassNames={{
                hasTrip: "relative font-semibold text-primary after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:w-1 after:h-1 after:rounded-full after:bg-primary",
              }}
            />
            {selectedDate && (
              <p className="text-xs text-muted-foreground mt-3">
                Mostrando viagens de <b>{format(selectedDate, "dd/MM/yyyy")}</b>
              </p>
            )}
          </CardContent>
        </Card>

        <div className="space-y-3 min-w-0">
          {isLoading ? <p className="text-muted-foreground">Carregando...</p> : filteredTrips.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              {selectedDate ? "Nenhuma viagem nesta data." : "Nenhuma viagem registrada."}
            </CardContent></Card>
          ) : (
            filteredTrips.map((t: any) => {
              const s = STATUS.find((x) => x.v === t.status);
              const capacity = t.vehicles?.capacidade ?? null;
              const paxCount = t.trip_passengers?.length ?? 0;
              const remaining = capacity !== null ? Math.max(0, capacity - paxCount) : null;
              return (
                <Card key={t.id} className="shadow-card">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <MapPin className="w-4 h-4 text-accent" />
                          <p className="font-semibold text-base">{t.destinations?.nome}</p>
                          <Badge variant={STATUS_VARIANT[t.status]}>{s?.l}</Badge>
                          {capacity !== null && (
                            <Badge variant={remaining === 0 ? "destructive" : "secondary"}>
                              {paxCount}/{capacity} ocupados
                              {remaining !== null && remaining > 0 ? ` • ${remaining} vaga${remaining > 1 ? "s" : ""}` : ""}
                              {remaining === 0 ? " • lotado" : ""}
                            </Badge>
                          )}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2"><Truck className="w-3.5 h-3.5" /> {t.vehicles?.placa} — {t.vehicles?.modelo}</div>
                          <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> {t.drivers?.nome}{t.drivers?.telefone ? <span className="inline-flex items-center gap-1 ml-1"><Phone className="w-3 h-3" /> <a href={`tel:${t.drivers.telefone}`} className="hover:underline">{t.drivers.telefone}</a></span> : null}</div>
                          <div className="flex items-center gap-2"><CalIcon className="w-3.5 h-3.5" /> Saída: {format(new Date(t.data_saida), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                          {t.data_retorno && (
                            <div className="flex items-center gap-2"><CalIcon className="w-3.5 h-3.5" /> Retorno: {format(new Date(t.data_retorno), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</div>
                          )}
                        </div>
                        {t.motivo && <p className="text-sm"><span className="text-muted-foreground">Motivo:</span> {t.motivo}</p>}
                        {t.observacoes && <p className="text-sm italic text-muted-foreground">{t.observacoes}</p>}
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setPaxDialogTrip(t)}>
                          <UsersIcon className="w-4 h-4 mr-1" /> Passageiros
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="icon" onClick={() => { setEditing(t); setOpen(true); }}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}
                        {canDeleteTrip(t) && (
                          <Button variant="ghost" size="icon" onClick={() => confirm("Remover esta viagem?") && delTrip.mutate(t.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {paxCount > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Passageiros e paradas:</p>
                        <div className="flex flex-wrap gap-2">
                          {t.trip_passengers.map((p: any) => (
                            <div key={p.id} className="text-xs bg-muted px-2.5 py-1.5 rounded-md flex items-center gap-1.5">
                              <User className="w-3 h-3" />
                              <span className="font-medium">{p.profiles?.full_name ?? "Usuário"}</span>
                              <span className="text-muted-foreground">→ {p.destinations?.nome}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {paxDialogTrip && (
        <PassengersDialog
          trip={paxDialogTrip}
          dests={dests ?? []}
          onClose={() => setPaxDialogTrip(null)}
        />
      )}
    </div>
  );
}

function PassengersDialog({
  trip, dests, onClose,
}: { trip: any; dests: any[]; onClose: () => void }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [pickedUser, setPickedUser] = useState<string>("");
  const [pickedDest, setPickedDest] = useState<string>(trip.destination_id);

  const { data: users } = useQuery({
    queryKey: ["profiles", isAdmin ? "admin" : "self"],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.rpc("list_profiles_admin");
        if (error) throw error;
        return (data ?? []).filter((p: any) => p.status === "ativo");
      }
      const { data, error } = await supabase.rpc("get_my_profile");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: passengers, refetch } = useQuery({
    queryKey: ["trip_passengers", trip.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("trip_passengers")
        .select("id, user_id, destination_id, added_by, created_at, profiles:user_id(full_name), destinations(nome)")
        .eq("trip_id", trip.id)
        .order("created_at");
      return data ?? [];
    },
  });

  const [search, setSearch] = useState("");

  const capacity = trip.vehicles?.capacidade ?? null;
  const paxCount = passengers?.length ?? 0;
  const full = capacity !== null && paxCount >= capacity;
  const allAvailable = (users ?? []).filter(
    (u) => !(passengers ?? []).some((p: any) => p.user_id === u.id),
  );
  const availableUsers = isAdmin
    ? allAvailable
    : allAvailable.filter((u: any) => u.id === user?.id);
  const q = search.trim().toLowerCase();
  const filteredAvailable = q
    ? availableUsers.filter((u: any) =>
        (u.full_name ?? "").toLowerCase().includes(q)
        || (u.email ?? "").toLowerCase().includes(q)
        || (u.masp ?? "").toLowerCase().includes(q))
    : availableUsers;

  const addPax = useMutation({
    mutationFn: async () => {
      if (!pickedUser || !pickedDest) throw new Error("Selecione passageiro e ponto de desembarque");
      const { error } = await supabase.from("trip_passengers").insert({
        trip_id: trip.id,
        user_id: pickedUser,
        destination_id: pickedDest,
        added_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passageiro adicionado");
      setPickedUser("");
      refetch();
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePax = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trip_passengers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Passageiro removido");
      refetch();
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canRemove = (p: any) =>
    isAdmin || p.added_by === user?.id || p.user_id === user?.id;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Passageiros da viagem</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p><b>Destino principal:</b> {trip.destinations?.nome}</p>
            <p><b>Saída:</b> {format(new Date(trip.data_saida), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
            {capacity !== null && (
              <p><b>Vagas:</b> {paxCount}/{capacity} {full && <span className="text-destructive font-medium">(lotado)</span>}</p>
            )}
          </div>

          <div className="border rounded-lg divide-y">
            {paxCount === 0 ? (
              <p className="p-4 text-sm text-muted-foreground text-center">Nenhum passageiro ainda.</p>
            ) : (
              passengers!.map((p: any) => (
                <div key={p.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.profiles?.full_name ?? "Usuário"}</p>
                    <p className="text-xs text-muted-foreground truncate">Desembarca em: {p.destinations?.nome}</p>
                  </div>
                  {canRemove(p) && (
                    <Button variant="ghost" size="icon" onClick={() => removePax.mutate(p.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          {full ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-3 text-sm text-destructive">
                Capacidade do veículo esgotada. Não é possível adicionar mais passageiros.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium flex items-center gap-2"><UserPlus className="w-4 h-4" /> {isAdmin ? "Adicionar passageiro" : "Entrar nesta viagem"}</p>
              <div className="space-y-2">
                <Label>Usuário</Label>
                {isAdmin && (
                  <Input
                    placeholder="Buscar por nome, e-mail ou MASP..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                )}
                <Select value={pickedUser} onValueChange={setPickedUser}>
                  <SelectTrigger><SelectValue placeholder={isAdmin ? "Selecione um usuário do sistema" : "Selecione seu nome"} /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {filteredAvailable.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">
                        {isAdmin ? "Nenhum usuário encontrado." : "Você já está nesta viagem."}
                      </div>
                    ) : filteredAvailable.map((u: any) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name ?? u.email}{u.masp ? ` • ${u.masp}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Ponto de desembarque (parada)</Label>
                <Select value={pickedDest} onValueChange={setPickedDest}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {dests.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => addPax.mutate()} disabled={addPax.isPending || !pickedUser || !pickedDest} className="w-full">
                Adicionar
              </Button>
              <p className="text-xs text-muted-foreground">
                O usuário receberá uma notificação no sino quando for adicionado por outra pessoa.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
