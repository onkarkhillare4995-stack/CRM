import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { PASSWORD_RULES, passwordValid } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordValid(password)) return toast.error("Password does not meet the policy");
    if (password !== confirm) return toast.error("Passwords do not match");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. Please sign in.");
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Set a new password</h2>
        {!token ? (
          <p className="mt-4 text-sm text-red-600" data-testid="reset-no-token">
            Missing or invalid reset link. <Link to="/forgot-password" className="underline">Request a new one</Link>.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">New password</Label>
                <button type="button" onClick={() => setShow((s) => !s)} data-testid="reset-password-toggle" className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{show ? "Hide" : "Show"}
                </button>
              </div>
              <Input id="password" type={show ? "text" : "password"} required data-testid="reset-password-input" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type={show ? "text" : "password"} required data-testid="reset-confirm-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <ul className="grid grid-cols-2 gap-1 text-xs">
              {PASSWORD_RULES.map((r) => {
                const ok = r.test(password);
                return (
                  <li key={r.key} className={cn("flex items-center gap-1", ok ? "text-emerald-600" : "text-slate-400")}>
                    <Check className={cn("h-3 w-3", ok ? "opacity-100" : "opacity-30")} /> {r.label}
                  </li>
                );
              })}
            </ul>
            <Button type="submit" disabled={loading} data-testid="reset-submit-button" className="w-full bg-indigo-600 hover:bg-indigo-700">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update password
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
