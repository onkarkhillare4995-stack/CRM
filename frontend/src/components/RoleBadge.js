import { cn } from "@/lib/utils";
import { ROLE_BADGE, ROLE_LABEL } from "@/lib/permissions";

export default function RoleBadge({ role, className }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium", ROLE_BADGE[role], className)}
      data-testid={`role-badge-${role}`}
    >
      {ROLE_LABEL[role] || role}
    </span>
  );
}
