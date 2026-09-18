import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Phone, Copy, MessageCircle, Play, Pause, RotateCcw, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { statusClasses, STATUS_LABEL, priorityClasses, digitsOnly } from "@/lib/leadConstants";

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

// Reusable manual dialer. Never auto-dials — a call starts only on explicit user action.
export default function CallActionModal({ open, onClose, lead, onLogDisposition }) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) { setSeconds(0); setRunning(false); if (timer.current) clearInterval(timer.current); }
  }, [open]);

  useEffect(() => {
    if (running) timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    else if (timer.current) clearInterval(timer.current);
    return () => timer.current && clearInterval(timer.current);
  }, [running]);

  if (!lead) return null;
  const copy = (num) => { navigator.clipboard?.writeText(num); toast.success("Number copied"); };
  const whatsapp = () => {
    window.open(`https://wa.me/${digitsOnly(lead.phone)}`, "_blank");
    api.post(`/leads/${lead.id}/whatsapp`).catch(() => {});
  };

  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between text-sm"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-800 dark:text-slate-200">{value}</span></div>
  ) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md" data-testid="call-action-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.name}
            <Badge className={statusClasses(lead.status)}>{STATUS_LABEL[lead.status] || lead.status}</Badge>
            <span className={`text-xs ${priorityClasses(lead.priority)}`}>{lead.priority}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-1.5 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <Row label="City" value={lead.city} />
          <Row label="Job" value={lead.job || lead.role_applied} />
          <Row label="Recruiter" value={lead.owner_name} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-500">Primary</p>
              <p className="text-lg font-semibold tracking-wide text-slate-900 dark:text-slate-100" data-testid="call-primary-phone">{lead.phone}</p>
            </div>
            <div className="flex gap-1.5">
              <Button size="icon" variant="outline" onClick={() => copy(lead.phone)} data-testid="call-copy-number"><Copy className="h-4 w-4" /></Button>
              <a href={`tel:${digitsOnly(lead.phone)}`} data-testid="call-dial-primary">
                <Button size="icon" className="bg-emerald-600 hover:bg-emerald-700"><Phone className="h-4 w-4" /></Button>
              </a>
            </div>
          </div>
          {lead.alt_phone && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div><p className="text-xs text-slate-500">Alternate</p><p className="font-medium text-slate-800 dark:text-slate-200">{lead.alt_phone}</p></div>
              <a href={`tel:${digitsOnly(lead.alt_phone)}`} data-testid="call-dial-alternate">
                <Button size="icon" variant="outline"><Phone className="h-4 w-4" /></Button>
              </a>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 p-3 text-center dark:border-slate-800">
          <p className="font-mono text-3xl font-bold text-indigo-600" data-testid="call-timer">{fmt(seconds)}</p>
          <div className="mt-2 flex justify-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setRunning((r) => !r)} data-testid="call-timer-toggle">
              {running ? <Pause className="mr-1 h-4 w-4" /> : <Play className="mr-1 h-4 w-4" />}{running ? "Pause" : "Start"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setSeconds(0); setRunning(false); }} data-testid="call-timer-reset"><RotateCcw className="mr-1 h-4 w-4" /> Reset</Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={whatsapp} data-testid="call-whatsapp"><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button>
          <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={() => { setRunning(false); onLogDisposition?.(seconds); }} data-testid="call-log-disposition"><ClipboardList className="mr-1 h-4 w-4" /> Log Disposition</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
