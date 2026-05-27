import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerPublishAndDeploy(server: McpServer): void {
  server.registerTool(
    "framer_publish_and_deploy",
    {
      description:
        "Publish the current state of the project and deploy it to production in one step. " +
        "Run this after you have created, updated, or deleted CMS items and are ready to make " +
        "them live on the site.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
      },
    },
    async ({ project }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;

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
