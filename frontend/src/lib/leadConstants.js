// Shared lead constants + label maps + datetime helpers. Backend remains source of truth.
export const STATUS_LABEL = {
  new: "New", contacted: "Contacted", interested: "Interested", lineup: "Interview Lineup",
  selected: "Selected", joined: "Joined", not_interested: "Not Interested",
  rejected: "Rejected", invalid: "Invalid Lead",
};
export const STATUS_OPTIONS = Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label }));

export const ACTIVE_STATUSES = ["new", "contacted", "interested", "lineup", "selected"];
export const FINAL_STATUSES = ["joined", "not_interested", "rejected", "invalid"];
export const REASON_REQUIRED_STATUSES = ["rejected", "not_interested", "invalid"];

export const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" },
];

export const GENDER_OPTIONS = [
  { value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" },
];

export const CONNECTED_OUTCOMES = [
  { value: "connected_interested", label: "Connected – Interested" },
  { value: "not_interested", label: "Not Interested" },
  { value: "callback_requested", label: "Callback Requested" },
  { value: "interview_scheduled", label: "Interview Scheduled" },
  { value: "already_working", label: "Already Working" },
  { value: "salary_issue", label: "Salary Issue" },
  { value: "location_issue", label: "Location Issue" },
  { value: "job_mismatch", label: "Job Mismatch" },
];
export const NOT_CONNECTED_OUTCOMES = [
  { value: "no_answer", label: "No Answer" },
  { value: "busy", label: "Busy" },
  { value: "switched_off", label: "Switched Off" },
  { value: "unreachable", label: "Unreachable" },
  { value: "invalid_number", label: "Invalid Number" },
  { value: "whatsapp_only", label: "WhatsApp Only" },
  { value: "call_back_later", label: "Call Back Later" },
];
export const DISPOSITION_LABEL = Object.fromEntries(
  [...CONNECTED_OUTCOMES, ...NOT_CONNECTED_OUTCOMES].map((o) => [o.value, o.label])
);
export const CALLBACK_OUTCOMES = ["callback_requested", "call_back_later"];
export const AUTO_FINAL_MAP = { not_interested: "not_interested", invalid_number: "invalid" };

export const INTERVIEW_TYPES = [
  { value: "walkin", label: "Walk-in" }, { value: "telephonic", label: "Telephonic" },
  { value: "virtual", label: "Virtual" }, { value: "f2f", label: "Face to Face" },
];

export const TASK_CATEGORIES = [
  { value: "candidate_followup", label: "Candidate follow-up" },
  { value: "client_followup", label: "Client follow-up" },
  { value: "vendor_followup", label: "Vendor follow-up" },
  { value: "interview_prep", label: "Interview prep" },
  { value: "marketing_task", label: "Marketing task" },
  { value: "general_admin", label: "General admin" },
];
export const TASK_CATEGORY_LABEL = Object.fromEntries(TASK_CATEGORIES.map((c) => [c.value, c.label]));

export const SAVED_VIEWS = [
  { key: "all", label: "All" }, { key: "fresh", label: "Fresh Leads" },
  { key: "not_called", label: "Not Called" }, { key: "todays_followups", label: "Today's Follow-ups" },
  { key: "overdue", label: "Overdue" }, { key: "no_followup", label: "No Follow-up" },
  { key: "no_answer", label: "No Answer" }, { key: "interested", label: "Interested" },
  { key: "hot", label: "Hot Leads" }, { key: "interviews", label: "Interviews" },
  { key: "attendance_pending", label: "Attendance Pending" }, { key: "selected", label: "Selected" },
  { key: "joining_this_week", label: "Joining This Week" }, { key: "joined", label: "Joined" },
  { key: "rejected_lost", label: "Rejected / Lost" },
];

export function statusClasses(status) {
  const map = {
    new: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    contacted: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    interested: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    lineup: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    selected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    joined: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    not_interested: "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    invalid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  };
  return map[status] || "bg-slate-100 text-slate-600";
}

export function priorityClasses(p) {
  return {
    high: "text-red-600 dark:text-red-400 font-semibold",
    medium: "text-amber-600 dark:text-amber-400",
    low: "text-slate-500",
  }[p] || "text-slate-500";
}

const pad = (n) => String(n).padStart(2, "0");
export function toDatetimeLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function nextWorkingSuggestion() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return toDatetimeLocal(d);
}
export function quickFollowup(kind) {
  const d = new Date();
  if (kind === "1h") d.setHours(d.getHours() + 1);
  else if (kind === "today5") d.setHours(17, 0, 0, 0);
  else if (kind === "tom10") { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
  else if (kind === "2days") { d.setDate(d.getDate() + 2); d.setHours(10, 0, 0, 0); }
  return toDatetimeLocal(d);
}
export function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function digitsOnly(s) {
  return (s || "").replace(/\D/g, "");
}
