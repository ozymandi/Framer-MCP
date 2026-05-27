import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "../config.js";
import { registerListProjects } from "./list-projects.js";
import { registerStatus } from "./status.js";
import { registerListCollections } from "./list-collections.js";
import { registerDescribeCollection } from "./describe-collection.js";
import { registerListItems } from "./list-items.js";
import { registerCreateItems } from "./create-items.js";
import { registerUpdateItems } from "./update-items.js";
import { registerDeleteItems } from "./delete-items.js";
import { registerPublishAndDeploy } from "./publish.js";
import { registerUploadImage } from "./upload-image.js";
import { registerUploadFile } from "./upload-file.js";
import { registerCreateCollection } from "./create-collection.js";
import { registerAddFields } from "./add-fields.js";
import { registerRemoveFields } from "./remove-fields.js";
import { registerAddEnumCases } from "./add-enum-cases.js";
// Expert-mode tools (registered only when MCP_EXPERT_MODE=true).
import { registerGetChangedPaths } from "./get-changed-paths.js";
import { registerListDeployments } from "./list-deployments.js";
import { registerListRedirects } from "./list-redirects.js";
import { registerAddRedirects } from "./add-redirects.js";
import { registerRemoveRedirects } from "./remove-redirects.js";
import { registerReorderItems } from "./reorder-items.js";
import { registerReorderFields } from "./reorder-fields.js";

export function registerAllTools(server: McpServer): void {
  // Always-on (simple) tools.
  registerListProjects(server);
  registerStatus(server);
  registerListCollections(server);
  registerDescribeCollection(server);
  registerListItems(server);
  registerCreateItems(server);
  registerUpdateItems(server);
  registerDeleteItems(server);
  registerUploadImage(server);
  registerUploadFile(server);
  registerCreateCollection(server);
  registerAddFields(server);
  registerRemoveFields(server);
  registerAddEnumCases(server);
  registerPublishAndDeploy(server);

  // Expert-mode extensions.
  if (config.expertMode) {
    registerGetChangedPaths(server);
    registerListDeployments(server);
    registerListRedirects(server);
    registerAddRedirects(server);
    registerRemoveRedirects(server);
    registerReorderItems(server);
    registerReorderFields(server);
  }
}
