import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { normalizeKey, refreshAll, suggestName } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

export function registerReorderFields(server: McpServer): void {
  server.registerTool(
    "framer_reorder_fields",
    {
      description:
        "Reorder fields in a collection's schema. Pass field names in the desired order; unknown " +
        "names are reported. Unspecified existing fields keep their relative order at the tail.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        collection: z.string().min(1).describe("Collection name."),
        fieldNames: z
          .array(z.string().min(1))
          .min(1)
          .max(100)
          .describe("Field names (display or snake_case) in the desired final order."),
      },
    },
    async ({ project, collection, fieldNames }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);
      const result = resolveCollection(alias, collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const knownDisplayNames = [...new Set(cached.orderedFields.map((f) => f.name))];
      const notFound: { name: string; hint: string | null }[] = [];
      const resolvedIds: string[] = [];
      const usedIds = new Set<string>();

      for (const name of fieldNames) {
        const field = cached.fieldsByName.get(normalizeKey(name));
        if (!field) {
          notFound.push({ name, hint: suggestName(name, knownDisplayNames) });
          continue;
        }
        if (usedIds.has(field.id)) continue;
        usedIds.add(field.id);
        resolvedIds.push(field.id);
      }

      if (notFound.length > 0) {
        const lines = notFound.map(
          (n) => `'${n.name}' not found` + (n.hint ? ` (did you mean '${n.hint}'?)` : ""),
        );
        return errorResult(
          `Some fields could not be resolved: ${lines.join("; ")}. No changes made. ` +
            `Available fields: ${knownDisplayNames.join(", ")}.`,
        );
      }

      // Append untouched fields at the end.
      for (const f of cached.orderedFields) {
        if (!usedIds.has(f.id)) resolvedIds.push(f.id);
      }

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);
      await framerColl.setFieldOrder(resolvedIds);

      await refreshAll(framer, alias);

      return jsonResult({
        collection: cached.name,
        ordered: fieldNames,
      });
    },
  );
}
