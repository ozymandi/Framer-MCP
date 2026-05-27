import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { refreshAll } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection } from "./helpers.js";

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
]);

export function registerDescribeCollection(server: McpServer): void {
  server.registerTool(
    "framer_describe_collection",
    {
      description:
        "Return the full schema of a collection: every field with its name, type, " +
        "whether it is required, and (for enum fields) the list of allowed case names. " +
        "Call this before generating items so you know what values to provide. " +
        "Writable field types: string, formattedText, number, boolean, date, link, color, enum, image, file. " +
        "Image and file fields accept a public http(s) URL, a data URL, or an existing asset id.",
      inputSchema: {
        collection: z
          .string()
          .min(1)
          .describe("Collection name as shown in Framer (case-insensitive)."),
      },
    },
    async ({ collection }) => {
      const framer = await getFramer();
      await refreshAll(framer);

      const result = resolveCollection(collection, { forWrite: false });
      if (!result.ok) return errorResult(result.error);
      const c = result.collection;

      const fields = c.orderedFields
        .filter((f) => f.type !== "divider")
        .map((f) => {
          const writable = WRITABLE_TYPES.has(f.type);
          return {
            name: f.name,
            key: f.key,
            type: f.type,
            required: f.required,
            recommended: writable,
            ...(f.enumCases ? { enumCases: [...f.enumCases.values()].map((e) => e.name) } : {}),
          };
        });

      return jsonResult({
        instructions:
          "To create a complete-looking item, populate EVERY field marked recommended:true — " +
          "not only the required ones. Optional fields left empty will leave the published item " +
          "visibly incomplete (missing dates, images, author info, body text, etc.). " +
          "If you genuinely have no content for a recommended field, that is fine, but do not " +
          "skip a field just because it is not required. " +
          "When writing, you may use EITHER the human-readable `name` (e.g. \"Author Name\") OR " +
          "the snake_case `key` (e.g. \"author_name\") as the field key in the `fields` object — " +
          "the server matches both, case-insensitively, ignoring spaces/dashes/underscores.",
        name: c.name,
        writable: c.managedBy !== "anotherPlugin",
        fields,
      });
    },
  );
}
