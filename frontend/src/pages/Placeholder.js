import { Construction } from "lucide-react";
import { Card } from "@/components/ui/card";

// Honest placeholder for modules delivered in later prompts. No fake data or actions.
export default function Placeholder({ title }) {
  return (
    <div className="space-y-6" data-testid="placeholder-page">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
      <Card className="flex flex-col items-center justify-center gap-3 p-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-900/30">
          <Construction className="h-7 w-7" />
        </div>
        <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-slate-100">Module not yet available</h2>
        <p className="max-w-md text-sm text-slate-500">
          This module will be delivered in an upcoming build. The foundation (auth, roles, scoping,
          audit) it depends on is already in place.
        </p>
      </Card>
    </div>
  );
}
