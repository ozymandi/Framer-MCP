import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { listCollections, refreshAll } from "../schema-cache.js";
import { textResult } from "./helpers.js";

export function registerStatus(server: McpServer): void {
  server.registerTool(
    "framer_status",
    {
      description:
        "Use this first to check the connection and get a summary of the Framer project. " +
        "Returns: project name, number of collections, last production deployment. " +
        "Takes no arguments.",
      inputSchema: {},
    },
    async () => {
      const framer = await getFramer();
      const info = await framer.getProjectInfo();
      await refreshAll(framer);

      const cols = listCollections();
      const writable = cols.filter((c) => c.managedBy !== "anotherPlugin").length;

      const lines: string[] = [];
      lines.push(`Project: ${(info as { name?: string }).name ?? "(unknown)"}`);
      lines.push(`Collections: ${cols.length} total, ${writable} writable.`);
      if (cols.length > 0) {
        lines.push(`Names: ${cols.map((c) => c.name).join(", ")}`);
      }

      try {
        const deployments = await framer.getDeployments();
        const latest = Array.isArray(deployments) && deployments.length > 0 ? deployments[0] : null;
        if (latest && typeof latest === "object" && "createdAt" in latest) {
          lines.push(`Last deployment: ${String((latest as { createdAt: unknown }).createdAt)}`);
        } else {
          lines.push("Last deployment: none.");
        }
      } catch {
        // getDeployments is best-effort; don't fail the whole status if it errors.
      }

      return textResult(lines.join("\n"));
    },
  );

  // Silence unused-import lint for zod (kept for future schema use).
  void z;
}
