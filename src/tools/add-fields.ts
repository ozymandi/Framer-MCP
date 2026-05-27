import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { refreshAll } from "../schema-cache.js";
import { buildCreateFields, FieldBuildError, type FriendlyFieldDef } from "../field-builder.js";
import { errorResult, jsonResult, resolveCollection, resolveProject } from "./helpers.js";

const fieldDefSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
  cases: z.array(z.string().min(1)).optional(),
  referenceCollection: z.string().optional(),
  allowedFileTypes: z.array(z.string().min(1)).optional(),
  contentType: z.enum(["auto", "markdown", "html"]).optional(),
});

export function registerAddFields(server: McpServer): void {
  server.registerTool(
    "framer_add_fields",
    {
      description:
        "Add one or more new fields to an existing collection. Same field shape as " +
        "framer_create_collection. Cannot duplicate existing field names — call " +
        "framer_describe_collection first if unsure.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        collection: z.string().min(1).describe("Collection name."),
        fields: z.array(fieldDefSchema).min(1).max(50),
      },
    },
    async ({ project, collection, fields }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { alias, framer } = proj.ctx;

      await refreshAll(framer, alias);
      const result = resolveCollection(alias, collection, { forWrite: true });
      if (!result.ok) return errorResult(result.error);
      const cached = result.collection;

      const existingNames = new Set(cached.orderedFields.map((f) => f.name.toLowerCase()));
      const dup = (fields as FriendlyFieldDef[]).find((f) =>
        existingNames.has(f.name.toLowerCase()),
      );
      if (dup) {
        return errorResult(
          `Collection '${cached.name}' already has a field named '${dup.name}'.`,
        );
      }

      let createFields;
      try {
        createFields = buildCreateFields(alias, fields as FriendlyFieldDef[]);
      } catch (err) {
        if (err instanceof FieldBuildError) return errorResult(err.message);
        throw err;
      }

      const framerColl = await framer.getCollection(cached.id);
      if (!framerColl) return errorResult(`Collection '${collection}' disappeared.`);
      const added = await framerColl.addFields(createFields);

      await refreshAll(framer, alias);

      return jsonResult({ collection: cached.name, added: added.map((f) => f.name) });
    },
  );
}
