import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { normalizeKey, refreshAll, suggestName } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection } from "./helpers.js";

export function registerAddEnumCases(server: McpServer): void {
  server.registerTool(
    "framer_add_enum_cases",
    {
      description:
        "Add new case options to an existing enum field. Use this when a collection has an " +
        "enum field (like 'Category' or 'Status') and you need to introduce new values. " +
        "Existing items keep their current values; new cases simply become selectable.",
      inputSchema: {
        collection: z.string().min(1).describe("Collection name."),
        field: z.string().min(1).describe("Enum field name (display name or snake_case key)."),
        cases: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("New case names to add. Existing cases are ignored (no duplicates)."),
      },
    },
    async ({ collection, field, cases }) => {
      const framer = await getFramer();
      await refreshAll(framer);

      const result = resolveCollection(collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const fieldCache = cached.fieldsByName.get(normalizeKey(field));
      if (!fieldCache) {
        const known = [...new Set(cached.orderedFields.map((f) => f.name))];
        const hint = suggestName(field, known);
        return errorResult(
          `Collection '${cached.name}' has no field '${field}'.` +
            (hint ? ` Did you mean '${hint}'?` : ` Known fields: ${known.join(", ")}.`),
        );
      }
      if (fieldCache.type !== "enum") {
        return errorResult(
          `Field '${fieldCache.name}' is type '${fieldCache.type}', not 'enum'. ` +
            `Cannot add enum cases.`,
        );
      }

      // Find the matching live Field instance on the Framer side.
      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);
      const liveFields = await framerColl.getFields();
      const liveField = liveFields.find((f) => f.id === fieldCache.id);
      if (!liveField || liveField.type !== "enum") {
        return errorResult(`Enum field '${fieldCache.name}' could not be opened for edit.`);
      }

      const existingCaseNames = new Set(
        (fieldCache.enumCases ? [...fieldCache.enumCases.values()].map((c) => c.name) : []).map(
          (n) => n.toLowerCase(),
        ),
      );

      const added: string[] = [];
      const skipped: string[] = [];

      for (const caseName of cases) {
        if (existingCaseNames.has(caseName.toLowerCase())) {
          skipped.push(caseName);
          continue;
        }
        const created = await (liveField as { addCase: (a: { name: string }) => Promise<unknown> })
          .addCase({ name: caseName });
        if (created) added.push(caseName);
      }

      await refreshAll(framer);

      return jsonResult({
        collection: cached.name,
        field: fieldCache.name,
        added,
        skipped,
      });
    },
  );
}
