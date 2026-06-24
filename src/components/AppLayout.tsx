import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Route as RouteIcon, Truck, Users, MapPin, LogOut, Menu, Shield } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "@/components/NotificationsBell";

const NAV = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard, adminOnly: false },
  { to: "/viagens", label: "Viagens", icon: RouteIcon, adminOnly: false },
  { to: "/veiculos", label: "Veículos", icon: Truck, adminOnly: true },
  { to: "/motoristas", label: "Motoristas", icon: Users, adminOnly: true },
  { to: "/destinos", label: "Destinos", icon: MapPin, adminOnly: true },
  { to: "/admin", label: "Administração", icon: Shield, adminOnly: true },
] as const;

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, isAdmin } = useAuth();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar text-sidebar-foreground flex flex-col transition-transform md:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-sidebar-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center">
              <Truck className="w-5 h-5 text-accent-foreground" />
            </div>
            <div>
              <p className="font-bold text-base leading-tight">Frotas</p>
              <p className="text-xs opacity-70">Controle de viagens</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const active = location.pathname === item.to || location.pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "hover:bg-sidebar-accent/50"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 mb-2 text-xs">
            <div className="flex items-center gap-2 opacity-90 truncate">
              {isAdmin && <Shield className="w-3 h-3 text-accent" />}
              <span className="truncate">{user?.email}</span>
            </div>
            <p className="opacity-60 mt-0.5">{isAdmin ? "Administrador" : "Usuário"}</p>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-sidebar-accent/50"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 md:ml-64 flex flex-col min-w-0">
        <header className="h-14 border-b bg-card flex items-center px-4 gap-3 sticky top-0 z-20">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          <p className="font-semibold md:hidden">Frotas</p>
          <div className="flex-1" />
          <NotificationsBell />
        </header>
        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
