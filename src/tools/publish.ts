import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerPublishAndDeploy(server: McpServer): void {
  server.registerTool(
    "framer_publish_and_deploy",
    {
      description:
        "Publish the current state of the project and deploy it to production in one step. " +
        "Run this after you have created, updated, or deleted CMS items and are ready to " +
        "make them live on the site. Returns the production hostnames.",
      inputSchema: {},
    },
    async () => {
      const framer = await getFramer();
      try {
        const { deployment } = await framer.publish();
        const hostnames = await framer.deploy(deployment.id);
        const primary = Array.isArray(hostnames)
          ? hostnames.find((h: { isPrimary?: boolean }) => h.isPrimary)
          : null;
        return jsonResult({
          deploymentId: deployment.id,
          primaryUrl: primary ? `https://${(primary as { hostname: string }).hostname}` : null,
          hostnames: Array.isArray(hostnames)
            ? hostnames.map((h: { hostname: string }) => h.hostname)
            : [],
        });
      } catch (err) {
        return errorResult(
          `Publish/deploy failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}
