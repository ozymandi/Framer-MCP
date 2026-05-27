import type { Framer } from "./framer-client.js";
import {
  getCollectionById,
  suggestName,
  type CachedField,
} from "./schema-cache.js";

export class ReferenceResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReferenceResolveError";
  }
}

/**
 * Per-call cache of `targetCollectionId → (slug → itemId)` so the same
 * target collection isn't queried twice within a single tool call.
 */
export type ReferenceCache = Map<string, Map<string, string>>;

export function newReferenceCache(): ReferenceCache {
  return new Map();
}

async function loadSlugIndex(
  framer: Framer,
  targetCollectionId: string,
  cache: ReferenceCache,
): Promise<Map<string, string>> {
  const existing = cache.get(targetCollectionId);
  if (existing) return existing;

  const collection = await framer.getCollection(targetCollectionId);
  if (!collection) {
    throw new ReferenceResolveError(
      `Target collection (id=${targetCollectionId}) does not exist in this project.`,
    );
  }
  const items = await collection.getItems();
  const index = new Map<string, string>();
  for (const item of items) index.set(item.slug, item.id);
  cache.set(targetCollectionId, index);
  return index;
}

/** Resolve a single slug into an item id within the field's target collection. */
export async function resolveOne(
  framer: Framer,
  field: CachedField,
  slug: string,
  cache: ReferenceCache,
): Promise<string> {
  const targetId = field.referenceTargetCollectionId;
  if (!targetId) {
    throw new ReferenceResolveError(
      `Field '${field.name}' is a reference field but its target collection is unknown.`,
    );
  }

  const index = await loadSlugIndex(framer, targetId, cache);
  const itemId = index.get(slug);
  if (itemId) return itemId;

  const targetCached = getCollectionById(targetId);
  const targetName = targetCached?.name ?? "(unknown)";
  const slugs = [...index.keys()];
  const hint = suggestName(slug, slugs);
  const sample = slugs.slice(0, 10).join(", ");
  throw new ReferenceResolveError(
    `Field '${field.name}' references collection '${targetName}'. ` +
      `Item with slug '${slug}' not found.` +
      (hint ? ` Did you mean '${hint}'?` : "") +
      (slugs.length === 0
        ? ` Target collection has no items.`
        : ` Available slugs (${slugs.length} total${slugs.length > 10 ? ", first 10 shown" : ""}): ${sample}.`),
  );
}

export async function resolveMany(
  framer: Framer,
  field: CachedField,
  slugs: ReadonlyArray<string>,
  cache: ReferenceCache,
): Promise<string[]> {
  const out: string[] = [];
  for (const slug of slugs) {
    out.push(await resolveOne(framer, field, slug, cache));
  }
  return out;
}

/**
 * Look up the slug of an item by its id OR by its slug (used when decoding).
 *
 * The Framer SDK sometimes serializes reference values back as slugs rather
 * than ids, so we accept either form.
 */
export async function lookupSlugById(
  framer: Framer,
  targetCollectionId: string,
  itemIdOrSlug: string,
  cache: ReferenceCache,
): Promise<string | null> {
  const index = await loadSlugIndex(framer, targetCollectionId, cache);
  // If the value matches a known slug directly, use it.
  if (index.has(itemIdOrSlug)) return itemIdOrSlug;
  // Otherwise scan for the id.
  for (const [slug, id] of index.entries()) {
    if (id === itemIdOrSlug) return slug;
  }
  return null;
}
