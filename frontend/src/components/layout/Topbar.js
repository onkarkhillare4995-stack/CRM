import { useState } from "react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { Moon, Sun, LogOut, KeyRound, Menu, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABEL } from "@/lib/permissions";
import RoleBadge from "@/components/RoleBadge";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import QuickActions from "@/components/QuickActions";
import NotificationBell from "@/components/NotificationBell";

function initials(name = "") {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "U";
}

export default function Topbar({ onMenu }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [pwOpen, setPwOpen] = useState(false);
  const [q, setQ] = useState("");

  const doLogout = async () => { await logout(); navigate("/login"); };
  const search = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/admin/leads?search=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 sm:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} data-testid="mobile-menu-button">
          <Menu className="h-5 w-5" />
        </Button>
        <span className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100 sm:text-base" data-testid="product-label">
          Recruitment CRM
        </span>
      </div>

      <form onSubmit={search} className="relative hidden max-w-xs flex-1 lg:block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search candidates…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="global-search-input" />
      </form>

      <div className="flex items-center gap-1.5">
        <QuickActions />
        <NotificationBell />
        <Button variant="ghost" size="icon" data-testid="theme-toggle" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2" data-testid="profile-menu-trigger">
              <Avatar className="h-8 w-8"><AvatarFallback className="bg-indigo-600 text-xs text-white">{initials(user?.name)}</AvatarFallback></Avatar>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">{user?.name}</span>
                <span className="block text-xs text-slate-500">{ROLE_LABEL[user?.role]}</span>
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900">
            <DropdownMenuLabel className="space-y-1">
              <div className="truncate font-medium text-slate-900 dark:text-slate-100">{user?.name}</div>
              <div className="truncate text-xs font-normal text-slate-500">{user?.email}</div>
              <div className="pt-1"><RoleBadge role={user?.role} /></div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setPwOpen(true)} data-testid="change-password-menu-item">
              <KeyRound className="mr-2 h-4 w-4" /> Change password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={doLogout} data-testid="logout-button" className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <ChangePasswordDialog open={pwOpen} onClose={() => setPwOpen(false)} />
    </header>
  );
}
