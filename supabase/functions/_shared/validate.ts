// Server-side validation on every route. Hand-rolled rather than pulling zod
// into the edge bundle: the shapes are small and the error messages are ours.

export class Invalid extends Error {
  field: string;
  constructor(field: string, why: string) {
    super(`${field}: ${why}`); this.name = "Invalid"; this.field = field;
  }
}

export function str(v: unknown, field: string, max = 2000): string {
  if (typeof v !== "string") throw new Invalid(field, "must be text");
  const s = v.trim();
  if (!s) throw new Invalid(field, "cannot be empty");
  if (s.length > max) throw new Invalid(field, `cannot be longer than ${max}`);
  return s;
}

export function optStr(v: unknown, field: string, max = 2000): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return str(v, field, max);
}

export function uuid(v: unknown, field: string): string {
  const s = str(v, field, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
    throw new Invalid(field, "must be an id");
  }
  return s;
}

export function num(v: unknown, field: string, min: number, max: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new Invalid(field, "must be a number");
  if (n < min || n > max) throw new Invalid(field, `must be between ${min} and ${max}`);
  return n;
}

export function optNum(v: unknown, field: string, min: number, max: number): number | undefined {
  if (v === undefined || v === null) return undefined;
  return num(v, field, min, max);
}

export function isoDate(v: unknown, field: string): string {
  const s = str(v, field, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Invalid(field, "must be YYYY-MM-DD");
  return s;
}

/** Caps the params object so a client cannot post a megabyte of JSON. */
export function params(v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new Invalid("params", "must be an object");
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length > 24) throw new Invalid("params", "too many settings");
  if (JSON.stringify(o).length > 4000) throw new Invalid("params", "too large");
  return o;
}
