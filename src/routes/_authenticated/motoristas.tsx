import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, User, Pencil, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/motoristas")({
  head: () => ({ meta: [{ title: "Motoristas — Frotas" }] }),
  component: DriversPage,
});

const schema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(120),
  cnh: z.string().trim().max(30).optional().or(z.literal("").transform(() => undefined)),
  telefone: z.string().trim().max(30).optional().or(z.literal("").transform(() => undefined)),
});

type Driver = { id: string; nome: string; telefone: string | null; cnh?: string | null };

function DriversPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["drivers", isAdmin ? "admin" : "basic"],
    queryFn: async () => {
      if (isAdmin) {
        const { data, error } = await supabase.rpc("list_drivers_admin");
        if (error) throw error;
        return (data ?? []) as Driver[];
      }
      const { data, error } = await supabase.from("drivers").select("id, nome, telefone").order("nome");
      if (error) throw error;
      return (data ?? []) as Driver[];
    },
  });

  const create = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const { error } = await supabase.from("drivers").insert(input);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drivers"] }); toast.success("Motorista cadastrado"); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & z.infer<typeof schema>) => {
      const { error } = await supabase.from("drivers").update(input).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drivers"] }); toast.success("Motorista atualizado"); setEditing(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["drivers"] }); toast.success("Removido"); },
    onError: (e: Error) => toast.error(e.message),
  });

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ nome: fd.get("nome"), cnh: fd.get("cnh") || "", telefone: fd.get("telefone") || "" });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    create.mutate(parsed.data);
  }

  function submitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({ nome: fd.get("nome"), cnh: fd.get("cnh") || "", telefone: fd.get("telefone") || "" });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    update.mutate({ id: editing.id, ...parsed.data });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((m) =>
      m.nome.toLowerCase().includes(q) ||
      (m.telefone ?? "").toLowerCase().includes(q) ||
      ((m as any).cnh ?? "").toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Motoristas</h1>
          <p className="text-muted-foreground text-sm">Motoristas habilitados para conduzir as viagens.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-1" /> Novo motorista</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Cadastrar motorista</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input name="nome" required maxLength={120} /></div>
              <div className="space-y-2"><Label>CNH</Label><Input name="cnh" maxLength={30} /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input name="telefone" maxLength={30} /></div>
              <DialogFooter><Button type="submit" disabled={create.isPending}>Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, telefone ou CNH..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando...</p> : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">{search ? "Nenhum motorista encontrado." : "Nenhum motorista cadastrado."}</CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m) => (
            <Card key={m.id} className="shadow-card">
              <CardContent className="p-5 flex items-start justify-between gap-2">
                <div className="flex gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.nome}</p>
                    {(m as any).cnh && <p className="text-xs text-muted-foreground">CNH: {(m as any).cnh}</p>}
                    {m.telefone && <p className="text-xs text-muted-foreground">{m.telefone}</p>}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(m)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => confirm("Remover este motorista?") && del.mutate(m.id)}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar motorista</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={submitEdit} className="space-y-4">
              <div className="space-y-2"><Label>Nome *</Label><Input name="nome" required maxLength={120} defaultValue={editing.nome} /></div>
              <div className="space-y-2"><Label>CNH</Label><Input name="cnh" maxLength={30} defaultValue={(editing as any).cnh ?? ""} /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input name="telefone" maxLength={30} defaultValue={editing.telefone ?? ""} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="submit" disabled={update.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
