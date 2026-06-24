import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/veiculos")({
  head: () => ({ meta: [{ title: "Veículos — Frotas" }] }),
  component: VehiclesPage,
});

const schema = z.object({
  placa: z.string().trim().min(1, "Placa obrigatória").max(10),
  modelo: z.string().trim().min(1, "Modelo obrigatório").max(80),
  marca: z.string().trim().min(1, "Marca obrigatória").max(80),
  ano: z.coerce.number().int().min(1900).max(2100).optional().or(z.literal("").transform(() => undefined)),
  capacidade: z.coerce.number().int().min(1).max(100).optional().or(z.literal("").transform(() => undefined)),
});

function VehiclesPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vehicles").select("*").order("placa");
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const { error } = await supabase.from("vehicles").insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      toast.success("Veículo cadastrado");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("vehicles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vehicles"] }); toast.success("Removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      placa: fd.get("placa"), modelo: fd.get("modelo"), marca: fd.get("marca"),
      ano: fd.get("ano") || "", capacidade: fd.get("capacidade") || "",
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    create.mutate(parsed.data);
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Veículos</h1>
          <p className="text-muted-foreground text-sm">Frota disponível para viagens.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Novo veículo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar veículo</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Placa *</Label><Input name="placa" required maxLength={10} /></div>
                <div className="space-y-2"><Label>Ano</Label><Input name="ano" type="number" min={1900} max={2100} /></div>
              </div>
              <div className="space-y-2"><Label>Marca *</Label><Input name="marca" required maxLength={80} /></div>
              <div className="space-y-2"><Label>Modelo *</Label><Input name="modelo" required maxLength={80} /></div>
              <div className="space-y-2"><Label>Capacidade (passageiros)</Label><Input name="capacidade" type="number" min={1} max={100} /></div>
              <DialogFooter><Button type="submit" disabled={create.isPending}>Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : data?.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum veículo cadastrado.</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data?.map((v) => (
            <Card key={v.id} className="shadow-card">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-primary" />
                      <p className="font-mono font-bold tracking-wider">{v.placa}</p>
                    </div>
                    <p className="mt-2 font-medium">{v.marca} {v.modelo}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {v.ano && `${v.ano} • `}{v.capacidade ? `${v.capacidade} passageiros` : "—"}
                    </p>
                  </div>
                  {isAdmin && (
                    <Button variant="ghost" size="icon" onClick={() => confirm("Remover este veículo?") && del.mutate(v.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
