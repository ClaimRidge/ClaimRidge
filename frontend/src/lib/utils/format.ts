import { formatDistanceToNow, format } from "date-fns";

export function formatJod(amount: number): string {
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} JOD`;
}

export function formatRelativeTime(dateStr: string): string {
  return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
}

export function formatDateJO(dateStr: string): string {
  return format(new Date(dateStr), "dd/MM/yyyy");
}

export function maskNationalId(id: string | null): string {
  if (!id || id.length < 4) return "****";
  return `****${id.slice(-4)}`;
}

export function computeAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
