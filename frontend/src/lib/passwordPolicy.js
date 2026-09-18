// Client-side mirror of backend password policy (backend remains source of truth).
export const PASSWORD_RULES = [
  { key: "len", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "One uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "One lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "digit", label: "One number", test: (p) => /\d/.test(p) },
];

export function passwordValid(p) {
  return PASSWORD_RULES.every((r) => r.test(p));
}
