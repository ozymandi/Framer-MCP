import type { CreateField } from "framer-api";
import { getCollectionByName, suggestName, listCollections } from "./schema-cache.js";

/**
 * Client-friendly field definition. Server maps to Framer's CreateField union.
 *
 * `referenceCollection` is the human-readable display name of the target
 * collection (server resolves to collectionId).
 */
export interface FriendlyFieldDef {
  name: string;
  type: string;
  required?: boolean;
  cases?: string[];
  referenceCollection?: string;
  allowedFileTypes?: string[];
  contentType?: "auto" | "markdown" | "html";
}

export class FieldBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldBuildError";
  }
}

const SIMPLE_TYPES = new Set([
  "boolean",
  "color",
  "number",
  "string",
  "image",
  "link",
  "date",
]);

const RECOGNIZED_TYPES = new Set([
  ...SIMPLE_TYPES,
  "formattedText",
  "file",
  "enum",
  "collectionReference",
  "multiCollectionReference",
  "divider",
]);

/**
 * Translate a list of friendly field definitions into Framer's CreateField shape.
 * Throws FieldBuildError with helpful messages.
 */
export function buildCreateFields(defs: ReadonlyArray<FriendlyFieldDef>): CreateField[] {
  const out: CreateField[] = [];
  const seenNames = new Set<string>();
  for (const def of defs) {
    if (!def.name || typeof def.name !== "string") {
      throw new FieldBuildError(`Field is missing a 'name'.`);
    }
    const nameKey = def.name.toLowerCase();
    if (seenNames.has(nameKey)) {
      throw new FieldBuildError(`Duplicate field name in this call: '${def.name}'.`);
    }
    seenNames.add(nameKey);

    const type = def.type;
    if (!RECOGNIZED_TYPES.has(type)) {
      throw new FieldBuildError(
        `Field '${def.name}': unknown type '${type}'. ` +
          `Supported: ${[...RECOGNIZED_TYPES].join(", ")}.`,
      );
    }

    const required = def.required === true;

    if (SIMPLE_TYPES.has(type)) {
      // boolean/color/number have no `required` in their Create type; rest do.
      if (type === "boolean" || type === "color" || type === "number") {
        out.push({ type, name: def.name } as CreateField);
      } else {
        out.push({ type, name: def.name, required } as CreateField);
      }
      continue;
    }

    if (type === "formattedText") {
      out.push({
        type,
        name: def.name,
        required,
        ...(def.contentType ? { contentType: def.contentType } : {}),
      } as CreateField);
      continue;
    }

    if (type === "file") {
      if (!Array.isArray(def.allowedFileTypes) || def.allowedFileTypes.length === 0) {
        throw new FieldBuildError(
          `Field '${def.name}' (file): allowedFileTypes is required (e.g. ["pdf", "md"]).`,
        );
      }
      out.push({
        type,
        name: def.name,
        required,
        allowedFileTypes: def.allowedFileTypes,
      } as CreateField);
      continue;
    }

    if (type === "enum") {
      if (!Array.isArray(def.cases) || def.cases.length === 0) {
        throw new FieldBuildError(
          `Field '${def.name}' (enum): provide at least one case via 'cases: [..]'.`,
        );
      }
      out.push({
        type,
        name: def.name,
        cases: def.cases.map((c) => ({ name: c })),
      } as CreateField);
      continue;
    }

    if (type === "collectionReference" || type === "multiCollectionReference") {
      if (!def.referenceCollection) {
        throw new FieldBuildError(
          `Field '${def.name}' (${type}): provide the target collection via 'referenceCollection'.`,
        );
      }
      const target = getCollectionByName(def.referenceCollection);
      if (!target) {
        const known = listCollections().map((c) => c.name);
        const hint = suggestName(def.referenceCollection, known);
        throw new FieldBuildError(
          `Field '${def.name}': referenceCollection '${def.referenceCollection}' not found.` +
            (hint ? ` Did you mean '${hint}'?` : ` Known: ${known.join(", ")}.`),
        );
      }
      out.push({
        type,
        name: def.name,
        collectionId: target.id,
        required,
      } as CreateField);
      continue;
    }

    if (type === "divider") {
      out.push({ type, name: def.name } as CreateField);
      continue;
    }
  }
  return out;
}
