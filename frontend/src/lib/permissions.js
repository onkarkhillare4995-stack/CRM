// UI helpers mirroring backend permission keys. Backend remains the source of truth.
export const ROLE_LABEL = {
  admin: "Administrator",
  team_leader: "Team Leader",
  recruiter: "Recruiter",
};

export const ROLE_BADGE = {
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  team_leader: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  recruiter: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

export const SCOPE_LABEL = {
  admin: "Organization Wide",
  team_leader: "Team Scope",
  recruiter: "My Pipeline",
};

export const ACTION_LABEL = {
  view: "Read",
  create: "Create",
  update: "Update",
  delete: "Delete",
  export: "Export",
  manage_permissions: "Manage Perms",
};
