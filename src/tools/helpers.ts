import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getCollectionByName, suggestName, listCollections } from "../schema-cache.js";
import type { CachedCollection } from "../schema-cache.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Resolve a collection by user-facing name, with a friendly error
 * (including a "did you mean" suggestion) if not found, and a guard
 * against plugin-managed collections which cannot be modified by us.
 */
export function resolveCollection(
  name: string,
  opts: { forWrite: boolean },
): { ok: true; collection: CachedCollection } | { ok: false; error: string } {
  const collection = getCollectionByName(name);
  if (!collection) {
    const known = listCollections().map((c) => c.name);
    const hint = suggestName(name, known);
    return {
      ok: false,
      error:
        `Collection '${name}' not found.` +
        (hint
          ? ` Did you mean '${hint}'?`
          : known.length > 0
            ? ` Known collections: ${known.join(", ")}.`
            : " No collections in this project."),
    };
  }
  if (opts.forWrite && collection.managedBy === "anotherPlugin") {
    return {
      ok: false,
      error: `Collection '${collection.name}' is managed by another plugin and cannot be modified through this server.`,
    };
  }
  return { ok: true, collection };
}
