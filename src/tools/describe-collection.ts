import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCollectionById, refreshAll } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

const WRITABLE_TYPES = new Set([
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
]);

export function registerDescribeCollection(server: McpServer): void {
  server.registerTool(
    "framer_describe_collection",
    {
      description:
        "Return the full schema of a collection. Call this before generating items so you " +
        "know what values to provide. Writable types: string, formattedText, number, boolean, " +
        "date, link, color, enum, image, file, collectionReference, multiCollectionReference.",
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe("Project alias. Required in multi-project mode."),
        collection: z
          .string()
          .min(1)
          .describe("Collection name as shown in Framer (case-insensitive)."),
      },
    },
    async ({ project, collection }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);
      const result = resolveCollection(alias, collection, { forWrite: false });
      if (!result.ok) return errorResult(result.error);
      const c = result.collection;

      const fields = c.orderedFields
        .filter((f) => f.type !== "divider")
        .map((f) => {
          const writable = WRITABLE_TYPES.has(f.type);
          const base: Record<string, unknown> = {
            name: f.name,
            key: f.key,
            type: f.type,
            required: f.required,
            recommended: writable,
          };
          if (f.enumCases) {
            base["enumCases"] = [...f.enumCases.values()].map((e) => e.name);
          }
          if (
            (f.type === "collectionReference" || f.type === "multiCollectionReference") &&
            f.referenceTargetCollectionId
          ) {
            const target = getCollectionById(alias, f.referenceTargetCollectionId);
            if (target) base["referenceCollection"] = target.name;
          }
          return base;
        });

      return jsonResult({
        instructions:
          "To create a complete-looking item, populate EVERY field marked recommended:true — " +
          "not only the required ones. Optional fields left empty will leave the published item " +
          "visibly incomplete. If you genuinely have no content for a recommended field, that is " +
          "fine, but do not skip a field just because it is not required. " +
          "When writing, you may use EITHER the human-readable `name` or the snake_case `key` " +
          "as the field key — the server matches both, case-insensitively, ignoring spaces. " +
          "For collectionReference fields, pass the SLUG of the target item. " +
          "For multiCollectionReference, pass an ARRAY of slugs. Call framer_list_items on the " +
          "`referenceCollection` first to see which slugs are available.",
        name: c.name,
        writable: c.managedBy !== "anotherPlugin",
        fields,
      });
    },
  );
}
