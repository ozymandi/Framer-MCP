import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

export function registerAllTools(server: McpServer): void {
  registerStatus(server);
  registerListCollections(server);
  registerDescribeCollection(server);
  registerListItems(server);
  registerCreateItems(server);
  registerUpdateItems(server);
  registerDeleteItems(server);
  registerUploadImage(server);
  registerUploadFile(server);
  registerPublishAndDeploy(server);
}
