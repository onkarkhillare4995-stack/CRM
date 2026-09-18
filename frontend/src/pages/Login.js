import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/context/AuthContext";
import { api, formatApiError } from "@/lib/api";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    api.get("/auth/config").then((r) => setGoogleEnabled(!!r.data.google_enabled)).catch(() => {});
  }, []);

  const handleGoogle = () => {
    if (!window.google?.accounts?.id) {
      toast.error("Google Sign-In is not available right now.");
      return;
    }
    // Google Identity Services flow initializes here once the provider is configured.
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      toast.success("Welcome back");
      navigate(location.state?.from?.pathname || "/admin/dashboard", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-slate-900 p-12 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(79,70,229,0.35),transparent_55%)]" />
        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 font-bold">O</div>
          <span className="font-heading text-xl font-bold">OAKsphere CRM</span>
        </div>
        <div className="relative space-y-4">
          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight">
            Precision recruitment operations.
          </h1>
          <p className="max-w-md text-slate-300">
            Role-scoped pipelines, granular permissions, and an immutable audit trail — built for
            Admins, Team Leaders, and Recruiters.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-6">
            {[["Roles", "3"], ["Audit", "100%"], ["Scoped", "RBAC"]].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="font-heading text-2xl font-bold text-indigo-300">{v}</div>
                <div className="text-xs uppercase tracking-widest text-slate-400">{k}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-slate-500">© 2026 OAKsphere Recruitment CRM</div>
      </div>

      <div className="flex w-full items-center justify-center bg-slate-50 p-6 dark:bg-slate-950 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <h2 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Access your recruitment workspace.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email" type="email" required autoComplete="email"
                data-testid="login-email-input" value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link to="/forgot-password" className="text-xs font-medium text-indigo-600 hover:underline" data-testid="forgot-password-link">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password" type={showPw ? "text" : "password"} required autoComplete="current-password"
                  data-testid="login-password-input" value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button" onClick={() => setShowPw((s) => !s)} data-testid="login-password-toggle"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} data-testid="login-submit-button" className="w-full bg-indigo-600 hover:bg-indigo-700">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
          {googleEnabled && (
            <div className="mt-6">
              <div className="relative mb-4 text-center text-xs text-slate-400">
                <span className="relative z-10 bg-slate-50 px-2 dark:bg-slate-950">or</span>
                <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200 dark:bg-slate-800" />
              </div>
              <Button type="button" variant="outline" data-testid="google-signin-button" className="w-full" onClick={handleGoogle}>
                Continue with Google
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
