import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Shield, ShieldOff, User as UserIcon, Ban, CheckCircle2, Pencil, AlertTriangle, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { deleteAppUser } from "@/lib/admin-users.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Administração — Frotas" }] }),
  beforeLoad: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles").select("role")
      .eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

type UserRow = {
  id: string;
  full_name: string | null;
  email: string;
  masp: string | null;
  status: string;
  isAdmin: boolean;
};

function AdminPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [blockConfirm, setBlockConfirm] = useState<{ u: UserRow; futureTrips: Array<{ id: string; data_saida: string; destino: string | null }> } | null>(null);
  const [search, setSearch] = useState("");
  const deleteFn = useServerFn(deleteAppUser);
  const deleteUser = useMutation({
    mutationFn: async (id: string) => deleteFn({ data: { userId: id } }),
    onSuccess: () => {
      toast.success("Usuário excluído");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setDeleting(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_profiles_admin");
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id, full_name: p.full_name, email: p.email, masp: p.masp, status: p.status, isAdmin: p.is_admin,
      })) as UserRow[];
    },
  });

  const setRole = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error && !error.message.includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Permissão atualizada");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateProfile = useMutation({
    mutationFn: async (p: { id: string; full_name?: string; masp?: string; status?: string }) => {
      const { id, ...rest } = p;
      const { error } = await supabase.from("profiles").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function requestBlock(u: UserRow) {
    // Fetch future trips this user is in
    const { data: tp } = await supabase
      .from("trip_passengers")
      .select("trip_id, trips!inner(id, data_saida, destinations(nome))")
      .eq("user_id", u.id);
    const now = new Date();
    type TripRel = { id: string; data_saida: string; destinations: { nome: string | null } | null };
    const future = (tp ?? [])
      .map((r) => r.trips as unknown as TripRel)
      .filter((t) => t && new Date(t.data_saida) > now)
      .map((t) => ({ id: t.id, data_saida: t.data_saida, destino: t.destinations?.nome ?? null }));
    if (future.length === 0) {
      updateProfile.mutate({ id: u.id, status: "bloqueado" });
      return;
    }
    setBlockConfirm({ u, futureTrips: future });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
          <Shield className="w-7 h-7 text-accent" /> Administração
        </h1>
        <p className="text-muted-foreground text-sm">Gerencie usuários, MASP, acesso e administradores.</p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Pesquisar por nome, e-mail ou MASP..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="shadow-card">
        <CardContent className="p-0 divide-y">
          {(() => {
            const q = search.trim().toLowerCase();
            const filtered = q
              ? (users ?? []).filter((u) =>
                  (u.full_name ?? "").toLowerCase().includes(q) ||
                  u.email.toLowerCase().includes(q) ||
                  (u.masp ?? "").toLowerCase().includes(q)
                )
              : (users ?? []);
            if (filtered.length === 0) {
              return <div className="p-6 text-center text-sm text-muted-foreground">{q ? "Nenhum usuário encontrado." : "Nenhum usuário."}</div>;
            }
            return filtered.map((u) => {
            const isSelf = u.id === user?.id;
            const blocked = u.status === "bloqueado";
            return (
              <div key={u.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{u.full_name ?? u.email}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {u.email} {u.masp && <span className="ml-1">· MASP {u.masp}</span>}
                    </p>
                  </div>
                  {u.isAdmin && <Badge variant="secondary"><Shield className="w-3 h-3 mr-1" /> Admin</Badge>}
                  {blocked && <Badge variant="destructive"><Ban className="w-3 h-3 mr-1" /> Bloqueado</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setEditing(u)}>
                    <Pencil className="w-4 h-4 mr-1" /> Editar
                  </Button>
                  {blocked ? (
                    <Button size="sm" variant="outline"
                      disabled={updateProfile.isPending}
                      onClick={() => updateProfile.mutate({ id: u.id, status: "ativo" })}>
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Desbloquear
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline"
                      disabled={isSelf || updateProfile.isPending}
                      onClick={() => requestBlock(u)}>
                      <Ban className="w-4 h-4 mr-1" /> Bloquear
                    </Button>
                  )}
                  {u.isAdmin ? (
                    <Button variant="outline" size="sm"
                      disabled={isSelf || setRole.isPending}
                      onClick={() => confirm(`Remover privilégios de admin de ${u.full_name ?? u.email}?`) && setRole.mutate({ userId: u.id, makeAdmin: false })}>
                      <ShieldOff className="w-4 h-4 mr-1" /> Rebaixar
                    </Button>
                  ) : (
                    <Button size="sm"
                      disabled={setRole.isPending}
                      onClick={() => setRole.mutate({ userId: u.id, makeAdmin: true })}>
                      <Shield className="w-4 h-4 mr-1" /> Promover
                    </Button>
                  )}
                  <Button variant="outline" size="sm"
                    disabled={isSelf || deleteUser.isPending}
                    onClick={() => setDeleting(u)}>
                    <Trash2 className="w-4 h-4 mr-1 text-destructive" /> Excluir
                  </Button>
                </div>
              </div>
            );
          });
          })()}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>Atualize o nome ou MASP do funcionário.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const full_name = String(fd.get("full_name") ?? "").trim();
                const masp = String(fd.get("masp") ?? "").replace(/\D/g, "");
                if (!/^[0-9]{8}$/.test(masp)) {
                  toast.error("MASP deve conter 8 dígitos numéricos");
                  return;
                }
                updateProfile.mutate(
                  { id: editing.id, full_name, masp },
                  { onSuccess: () => setEditing(null) },
                );
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Nome completo</Label>
                <Input name="full_name" defaultValue={editing.full_name ?? ""} required maxLength={120} />
              </div>
              <div className="space-y-2">
                <Label>MASP</Label>
                <Input name="masp" defaultValue={editing.masp ?? ""} maxLength={8} pattern="[0-9]{8}" required />
              </div>
              <div className="text-xs text-muted-foreground">E-mail: {editing.email}</div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                <Button type="submit" disabled={updateProfile.isPending}>Salvar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Block confirm dialog */}
      <Dialog open={!!blockConfirm} onOpenChange={(o) => !o && setBlockConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Atenção: viagens futuras
            </DialogTitle>
            <DialogDescription>
              {blockConfirm?.u.full_name ?? blockConfirm?.u.email} está em {blockConfirm?.futureTrips.length} viagem(ns) futura(s).
              Ao bloquear, o acesso é revogado imediatamente, mas o usuário permanecerá listado nessas viagens até que você o remova manualmente.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-60 overflow-auto text-sm space-y-1 border rounded-md p-2">
            {blockConfirm?.futureTrips.map((t) => (
              <div key={t.id} className="flex justify-between gap-2">
                <span>{new Date(t.data_saida).toLocaleString("pt-BR")}</span>
                <span className="text-muted-foreground">{t.destino ?? "—"}</span>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockConfirm(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!blockConfirm) return;
                updateProfile.mutate(
                  { id: blockConfirm.u.id, status: "bloqueado" },
                  { onSuccess: () => setBlockConfirm(null) },
                );
              }}
            >
              <Ban className="w-4 h-4 mr-1" /> Bloquear acesso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" /> Excluir usuário
            </DialogTitle>
            <DialogDescription>
              Esta ação é permanente. O usuário <b>{deleting?.full_name ?? deleting?.email}</b> será removido do sistema, incluindo seu login, perfil e participação em viagens passadas. Não é possível desfazer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deleteUser.isPending}
              onClick={() => deleting && deleteUser.mutate(deleting.id)}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
