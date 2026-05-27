import type { CachedCollection, CachedField } from "./schema-cache.js";
import { getCollectionById, normalizeKey, suggestName } from "./schema-cache.js";
import type { Framer } from "./framer-client.js";
import {
  AssetUploadError,
  newAssetCache,
  resolveAssetValue,
  type AssetCache,
} from "./asset-uploader.js";
import {
  newReferenceCache,
  lookupSlugById,
  ReferenceResolveError,
  resolveMany,
  resolveOne,
  type ReferenceCache,
} from "./reference-resolver.js";

/**
 * Plain JSON value the client may send for a field.
 * Server wraps it into Framer's typed FieldDataEntry shape.
 *
 * `string[]` is accepted only for multiCollectionReference (array of slugs).
 */
export type PlainFieldValue = string | number | boolean | null | string[];

export class FieldEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldEncodeError";
  }
}

/** Field types we accept from plain values. */
const WRITABLE: ReadonlyArray<CachedField["type"]> = [
  "string",
  "formattedText",
  "number",
  "boolean",
  "date",
  "link",
  "color",
  "enum",
  "image",
  "file",
  "collectionReference",
  "multiCollectionReference",
];

export interface EncodeCaches {
  assets: AssetCache;
  references: ReferenceCache;
}

export function newEncodeCaches(): EncodeCaches {
  return { assets: newAssetCache(), references: newReferenceCache() };
}

/**
 * Convert `{ fieldName: plainValue }` into Framer's
 * `{ [fieldId]: { type, value } }` form.
 *
 * - Image/file fields auto-upload URLs and data URLs.
 * - Reference fields auto-resolve slugs to item ids.
 *
 * Throws FieldEncodeError, AssetUploadError, or ReferenceResolveError with
 * model-friendly messages.
 */
export async function encodeFieldData(
  framer: Framer,
  collection: CachedCollection,
  fields: Record<string, PlainFieldValue>,
  caches: EncodeCaches = newEncodeCaches(),
): Promise<Record<string, { type: string; value: unknown }>> {
  const out: Record<string, { type: string; value: unknown }> = {};

  for (const [rawName, rawValue] of Object.entries(fields)) {
    const field = collection.fieldsByName.get(normalizeKey(rawName));
    if (!field) {
      const known = [...new Set(collection.orderedFields.map((f) => f.name))];
      const hint = suggestName(rawName, known);
      throw new FieldEncodeError(
        `Collection '${collection.name}' has no field '${rawName}'.` +
          (hint ? ` Did you mean '${hint}'?` : ` Known fields: ${known.join(", ")}.`),
      );
    }
    if (!WRITABLE.includes(field.type)) {
      throw new FieldEncodeError(
        `Field '${field.name}' has type '${field.type}', which is not writable. ` +
          `Writable types: ${WRITABLE.join(", ")}.`,
      );
    }
    out[field.id] = await encodeOne(framer, field, rawValue, caches);
  }
  return out;
}

async function encodeOne(
  framer: Framer,
  field: CachedField,
  value: PlainFieldValue,
  caches: EncodeCaches,
): Promise<{ type: string; value: unknown }> {
  if (value === null) {
    if (field.required) {
      throw new FieldEncodeError(
        `Field '${field.name}' is required and cannot be set to null.`,
      );
    }
    return { type: field.type, value: null };
  }

  switch (field.type) {
    case "string":
    case "formattedText": {
      if (typeof value !== "string") {
        throw new FieldEncodeError(
          `Field '${field.name}' expects a string, got ${describe(value)}.`,
        );
      }
      return { type: field.type, value };
    }
    case "link":
    case "color": {
      if (typeof value !== "string") {
        throw new FieldEncodeError(
          `Field '${field.name}' expects a string (${field.type}), got ${describe(value)}.`,
        );
      }
      return { type: field.type, value };
    }
    case "number": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        throw new FieldEncodeError(
          `Field '${field.name}' expects a number, got ${describe(value)}.`,
        );
      }
      return { type: "number", value };
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        throw new FieldEncodeError(
          `Field '${field.name}' expects a boolean, got ${describe(value)}.`,
        );
      }
      return { type: "boolean", value };
    }
    case "date": {
      if (typeof value === "string" || typeof value === "number") {
        return { type: "date", value };
      }
      throw new FieldEncodeError(
        `Field '${field.name}' expects an ISO date string or epoch number, got ${describe(value)}.`,
      );
    }
    case "enum": {
      if (typeof value !== "string") {
        throw new FieldEncodeError(
          `Field '${field.name}' expects an enum case name (string), got ${describe(value)}.`,
        );
      }
      const cases = field.enumCases;
      if (!cases || cases.size === 0) {
        throw new FieldEncodeError(`Field '${field.name}' has no enum cases defined.`);
      }
      const byName = cases.get(normalizeKey(value));
      if (byName) return { type: "enum", value: byName.id };
      const byId = [...cases.values()].find((c) => c.id === value);
      if (byId) return { type: "enum", value: byId.id };
      const known = [...cases.values()].map((c) => c.name);
      const hint = suggestName(value, known);
      throw new FieldEncodeError(
        `Field '${field.name}' has no enum case '${value}'.` +
          (hint ? ` Did you mean '${hint}'?` : ` Known cases: ${known.join(", ")}.`),
      );
    }
    case "image":
    case "file": {
      if (typeof value !== "string") {
        throw new FieldEncodeError(
          `Field '${field.name}' (${field.type}) expects a string: an asset id, an http(s) URL, or a data URL. Got ${describe(value)}.`,
        );
      }
      try {
        const asset = await resolveAssetValue(framer, field.type, value, caches.assets);
        return { type: field.type, value: asset.url };
      } catch (err) {
        if (err instanceof AssetUploadError) {
          throw new FieldEncodeError(`Field '${field.name}': ${err.message}`);
        }
        throw err;
      }
    }
    case "collectionReference": {
      if (typeof value !== "string") {
        throw new FieldEncodeError(
          `Field '${field.name}' (collectionReference) expects a single slug (string), got ${describe(value)}.`,
        );
      }
      try {
        const id = await resolveOne(framer, field, value, caches.references);
        return { type: "collectionReference", value: id };
      } catch (err) {
        if (err instanceof ReferenceResolveError) {
          throw new FieldEncodeError(err.message);
        }
        throw err;
      }
    }
    case "multiCollectionReference": {
      if (!Array.isArray(value)) {
        throw new FieldEncodeError(
          `Field '${field.name}' (multiCollectionReference) expects an array of slugs, got ${describe(value)}.`,
        );
      }
      for (const v of value) {
        if (typeof v !== "string") {
          throw new FieldEncodeError(
            `Field '${field.name}': every entry must be a slug string. Got ${describe(v)} in the array.`,
          );
        }
      }
      try {
        const ids = await resolveMany(framer, field, value, caches.references);
        return { type: "multiCollectionReference", value: ids };
      } catch (err) {
        if (err instanceof ReferenceResolveError) {
          throw new FieldEncodeError(err.message);
        }
        throw err;
      }
    }
    default:
      throw new FieldEncodeError(
        `Field '${field.name}' has unsupported type '${field.type}'.`,
      );
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/**
 * Decode Framer's stored FieldData back into a flat map of `fieldName → plainValue`.
 *
 * For reference fields, returns `{ slug, collection }` (or arrays thereof).
 * Asynchronous because reference decoding requires a live lookup.
 */
export async function decodeFieldData(
  framer: Framer,
  collection: CachedCollection,
  fieldData: Record<string, { type: string; value: unknown } | undefined>,
  caches: EncodeCaches = newEncodeCaches(),
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const field of collection.orderedFields) {
    if (field.type === "divider" || field.type === "unsupported") continue;
    const entry = fieldData[field.id];
    out[field.name] = entry ? await decodeEntry(framer, field, entry, caches) : null;
  }
  return out;
}

async function decodeEntry(
  framer: Framer,
  field: CachedField,
  entry: { type: string; value: unknown },
  caches: EncodeCaches,
): Promise<unknown> {
  const v = entry.value;
  if (v === undefined || v === null) return null;

  switch (field.type) {
    case "enum": {
      if (typeof v !== "string") return null;
      const found = field.enumCases ? [...field.enumCases.values()].find((c) => c.id === v) : null;
      return found ? found.name : v;
    }
    case "image":
    case "file": {
      if (v && typeof v === "object") {
        const o = v as { id?: string; url?: string };
        return { id: o.id ?? null, url: o.url ?? null };
      }
      return v;
    }
    case "collectionReference": {
      if (typeof v !== "string") return null;
      const targetId = field.referenceTargetCollectionId;
      if (!targetId) return v;
      const slug = await lookupSlugById(framer, targetId, v, caches.references);
      const collectionName = getCollectionById(targetId)?.name ?? null;
      return slug ? { slug, collection: collectionName } : { itemId: v, collection: collectionName };
    }
    case "multiCollectionReference": {
      const targetId = field.referenceTargetCollectionId;
      if (!targetId || !Array.isArray(v)) return v;
      const collectionName = getCollectionById(targetId)?.name ?? null;
      const out: unknown[] = [];
      for (const id of v) {
        if (typeof id !== "string") {
          out.push(id);
          continue;
        }
        const slug = await lookupSlugById(framer, targetId, id, caches.references);
        out.push(slug ? { slug, collection: collectionName } : { itemId: id, collection: collectionName });
      }
      return out;
    }
    case "array":
      return Array.isArray(v) ? `[array of ${v.length}]` : v;
    default:
      return v;
  }
}
