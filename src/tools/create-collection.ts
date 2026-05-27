import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { getCollectionByName, refreshAll } from "../schema-cache.js";
import { buildCreateFields, FieldBuildError, type FriendlyFieldDef } from "../field-builder.js";
import { errorResult, jsonResult } from "./helpers.js";

const fieldDefSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  required: z.boolean().optional(),
  cases: z.array(z.string().min(1)).optional(),
  referenceCollection: z.string().optional(),
  allowedFileTypes: z.array(z.string().min(1)).optional(),
  contentType: z.enum(["auto", "markdown", "html"]).optional(),
});

export function registerCreateCollection(server: McpServer): void {
  server.registerTool(
    "framer_create_collection",
    {
      description:
        "Create a new CMS collection, optionally with an initial list of fields. " +
        "Fields are described in a flat shape: { name, type, required?, cases?, " +
        "referenceCollection?, allowedFileTypes?, contentType? }. " +
        "Supported types: string, formattedText, number, boolean, date, link, color, image, " +
        "file (requires allowedFileTypes), enum (requires cases), collectionReference / " +
        "multiCollectionReference (require referenceCollection), divider. " +
        "If you need a reference to another collection, create the target collection first. " +
        "After this call, you can immediately use framer_create_items on the new collection.",
      inputSchema: {
        name: z
          .string()
          .min(1)
          .max(80)
          .describe("Display name for the new collection (e.g. 'Authors')."),
        fields: z
          .array(fieldDefSchema)
          .max(50)
          .optional()
          .describe("Optional initial fields to add right after creation."),
      },
    },
    async ({ name, fields }) => {
      const framer = await getFramer();
      await refreshAll(framer);

      if (getCollectionByName(name)) {
        return errorResult(
          `A collection named '${name}' already exists. Use framer_add_fields to extend it.`,
        );
      }

      let createFields;
      if (fields && fields.length > 0) {
        try {
          createFields = buildCreateFields(fields as FriendlyFieldDef[]);
        } catch (err) {
          if (err instanceof FieldBuildError) return errorResult(err.message);
          throw err;
        }
      }

      const collection = await framer.createCollection(name);
      let addedFieldNames: string[] = [];
      if (createFields && createFields.length > 0) {
        const added = await collection.addFields(createFields);
        addedFieldNames = added.map((f) => f.name);
      }

      // Refresh so subsequent tools see the new collection.
      await refreshAll(framer);

      return jsonResult({
        created: collection.name,
        fields: addedFieldNames,
      });
    },
  );
}
