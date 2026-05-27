import type { Framer } from "./framer-client.js";

export type FieldType =
  | "string"
  | "formattedText"
  | "number"
  | "boolean"
  | "date"
  | "link"
  | "color"
  | "enum"
  | "image"
  | "file"
  | "collectionReference"
  | "multiCollectionReference"
  | "array"
  | "divider"
  | "unsupported";

export interface CachedEnumCase {
  id: string;
  name: string;
}

export interface CachedField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  /** Only for type === "enum". Lower-cased case-name → case id. */
  enumCases?: Map<string, CachedEnumCase>;
}

export interface CachedCollection {
  id: string;
  name: string;
  managedBy: "user" | "thisPlugin" | "anotherPlugin";
  /** Lower-cased field name → field. */
  fieldsByName: Map<string, CachedField>;
  /** Field id → field. */
  fieldsById: Map<string, CachedField>;
  /** Ordered for `describe` output. */
  orderedFields: CachedField[];
}

const collectionsByName = new Map<string, CachedCollection>();

export function clearCache(): void {
  collectionsByName.clear();
}

export async function refreshAll(framer: Framer): Promise<void> {
  clearCache();
  const collections = await framer.getCollections();
  for (const collection of collections) {
    const fields = await collection.getFields();
    const cached = buildCachedCollection(collection, fields);
    collectionsByName.set(cached.name.toLowerCase(), cached);
  }
}

function buildCachedCollection(
  collection: { id: string; name: string; managedBy: "user" | "thisPlugin" | "anotherPlugin" },
  fields: ReadonlyArray<{ id: string; name: string; type: string; required?: boolean; cases?: ReadonlyArray<{ id: string; name: string }> }>,
): CachedCollection {
  const fieldsByName = new Map<string, CachedField>();
  const fieldsById = new Map<string, CachedField>();
  const orderedFields: CachedField[] = [];

  for (const raw of fields) {
    const cached: CachedField = {
      id: raw.id,
      name: raw.name,
      type: raw.type as FieldType,
      required: Boolean(raw.required),
    };
    if (raw.type === "enum" && Array.isArray(raw.cases)) {
      const map = new Map<string, CachedEnumCase>();
      for (const c of raw.cases) map.set(c.name.toLowerCase(), { id: c.id, name: c.name });
      cached.enumCases = map;
    }
    fieldsByName.set(raw.name.toLowerCase(), cached);
    fieldsById.set(raw.id, cached);
    orderedFields.push(cached);
  }

  return {
    id: collection.id,
    name: collection.name,
    managedBy: collection.managedBy,
    fieldsByName,
    fieldsById,
    orderedFields,
  };
}

export function getCollectionByName(name: string): CachedCollection | undefined {
  return collectionsByName.get(name.toLowerCase());
}

export function listCollections(): CachedCollection[] {
  return [...collectionsByName.values()];
}

/** Levenshtein-ish: returns top suggestion if reasonably close. */
export function suggestName(target: string, candidates: Iterable<string>): string | null {
  const t = target.toLowerCase();
  let best: { name: string; score: number } | null = null;
  for (const name of candidates) {
    const score = distance(t, name.toLowerCase());
    if (best === null || score < best.score) best = { name, score };
  }
  if (!best) return null;
  if (best.score <= Math.max(2, Math.floor(target.length / 3))) return best.name;
  return null;
}

function distance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array<number>(n + 1);
  const curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(
        (curr[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j] ?? 0;
  }
  return prev[n] ?? 0;
}
