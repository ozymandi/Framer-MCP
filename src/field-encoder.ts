import type { CachedCollection, CachedField } from "./schema-cache.js";
import { normalizeKey, suggestName } from "./schema-cache.js";
import type { Framer } from "./framer-client.js";
import {
  AssetUploadError,
  newAssetCache,
  resolveAssetValue,
  type AssetCache,
} from "./asset-uploader.js";

/**
 * Plain JSON value the client may send for a field.
 * Server wraps it into Framer's typed FieldDataEntry shape.
 */
export type PlainFieldValue = string | number | boolean | null;

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
];

/**
 * Convert `{ fieldName: plainValue }` into Framer's
 * `{ [fieldId]: { type, value } }` form.
 *
 * Image/file fields automatically upload from URLs and data URLs.
 *
 * Throws FieldEncodeError or AssetUploadError with model-friendly messages.
 */
export async function encodeFieldData(
  framer: Framer,
  collection: CachedCollection,
  fields: Record<string, PlainFieldValue>,
  cache: AssetCache = newAssetCache(),
): Promise<Record<string, { type: string; value: unknown; alt?: string }>> {
  const out: Record<string, { type: string; value: unknown; alt?: string }> = {};

  for (const [rawName, rawValue] of Object.entries(fields)) {
    const field = collection.fieldsByName.get(normalizeKey(rawName));
    if (!field) {
      const known = [...collection.fieldsByName.values()].map((f) => f.name);
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
    out[field.id] = await encodeOne(framer, field, rawValue, cache);
  }
  return out;
}

async function encodeOne(
  framer: Framer,
  field: CachedField,
  value: PlainFieldValue,
  cache: AssetCache,
): Promise<{ type: string; value: unknown; alt?: string }> {
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
        const asset = await resolveAssetValue(framer, field.type, value, cache);
        return { type: field.type, value: asset.url };
      } catch (err) {
        if (err instanceof AssetUploadError) {
          throw new FieldEncodeError(`Field '${field.name}': ${err.message}`);
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
 */
export function decodeFieldData(
  collection: CachedCollection,
  fieldData: Record<string, { type: string; value: unknown } | undefined>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of collection.orderedFields) {
    if (field.type === "divider" || field.type === "unsupported") continue;
    const entry = fieldData[field.id];
    out[field.name] = entry ? decodeEntry(field, entry) : null;
  }
  return out;
}

function decodeEntry(field: CachedField, entry: { type: string; value: unknown }): unknown {
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
      // Asset objects expose `url` and `id`. Expose `url` so the LLM can verify
      // and `id` so it can be re-used in further writes.
      if (v && typeof v === "object") {
        const o = v as { id?: string; url?: string };
        return { id: o.id ?? null, url: o.url ?? null };
      }
      return v;
    }
    case "collectionReference":
    case "multiCollectionReference":
      return v;
    case "array":
      return Array.isArray(v) ? `[array of ${v.length}]` : v;
    default:
      return v;
  }
}
