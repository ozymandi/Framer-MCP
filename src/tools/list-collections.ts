import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { listCollections, refreshAll } from "../schema-cache.js";
import { jsonResult } from "./helpers.js";

export function registerListCollections(server: McpServer): void {
  server.registerTool(
    "framer_list_collections",
    {
      description:
        "List all CMS collections in the project. " +
        "Returns: array of { name, itemCount, fieldNames, writable }. " +
        "Use 'name' in subsequent tool calls. Takes no arguments.",
      inputSchema: {},
    },
    async () => {
      const framer = await getFramer();
      await refreshAll(framer);

      const cached = listCollections();
      const collections = await framer.getCollections();
      const itemCountById = new Map<string, number>();
      for (const c of collections) {
        const items = await c.getItems();
        itemCountById.set(c.id, items.length);
      }

      const out = cached.map((c) => ({
        name: c.name,
        itemCount: itemCountById.get(c.id) ?? 0,
        fieldNames: c.orderedFields
          .filter((f) => f.type !== "divider")
          .map((f) => f.name),
        writable: c.managedBy !== "anotherPlugin",
      }));

      return jsonResult(out);
    },
  );
}
