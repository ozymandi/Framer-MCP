import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { refreshAll } from "../schema-cache.js";
import { errorResult, jsonResult, resolveCollection } from "./helpers.js";

export function registerDescribeCollection(server: McpServer): void {
  server.registerTool(
    "framer_describe_collection",
    {
      description:
        "Return the full schema of a collection: every field with its name, type, " +
        "whether it is required, and (for enum fields) the list of allowed case names. " +
        "Call this before generating items so you know what values to provide. " +
        "Writable field types: string, formattedText, number, boolean, date, link, color, enum.",
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
        .map((f) => ({
          name: f.name,
          type: f.type,
          required: f.required,
          ...(f.enumCases ? { enumCases: [...f.enumCases.values()].map((e) => e.name) } : {}),
        }));

      return jsonResult({
        name: c.name,
        writable: c.managedBy !== "anotherPlugin",
        fields,
      });
    },
  );
}
