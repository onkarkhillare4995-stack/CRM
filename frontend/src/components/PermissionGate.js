import { useAuth } from "@/context/AuthContext";

// Convenience gate for hiding UI. Never a security boundary — backend enforces.
export default function PermissionGate({ permission, children, fallback = null }) {
  const { hasPermission } = useAuth();
  if (!hasPermission(permission)) return fallback;
  return children;
}
