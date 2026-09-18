import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";

// Unread count derived from live work queues (overdue/today follow-ups + interviews).
export default function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);

  const load = () => api.get("/my-day").then((r) => {
    const steps = r.data.steps || [];
    const relevant = steps.filter((s) => ["overdue_followups", "today_followups", "interview_confirmations", "joining_confirmations"].includes(s.key) && s.count > 0);
    setItems(relevant.map((s) => ({ key: s.key, title: s.title, count: s.count })));
  }).catch(() => {});

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);

  const total = items.reduce((a, b) => a + b.count, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="notification-bell">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white" data-testid="notification-count">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-white dark:bg-slate-900">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-slate-500">You're all caught up 🎉</div>
        ) : items.map((it) => (
          <DropdownMenuItem key={it.key} onClick={() => navigate("/admin/my-day")} data-testid={`notif-${it.key}`} className="flex items-center justify-between">
            <span>{it.title}</span>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">{it.count}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
