import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AssetUploadError,
  newAssetCache,
  resolveAssetValue,
} from "../asset-uploader.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerUploadFile(server: McpServer): void {
  server.registerTool(
    "framer_upload_file",
    {
      description:
        "Upload a non-image file (PDF, text, etc.) to the project and return its asset id. " +
        "Input: a public http(s) URL or a data URL.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        source: z.string().min(1).describe("Public URL or data URL of the file."),
      },
    },
    async ({ project, source }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;

      try {
        const asset = await resolveAssetValue(framer, "file", source, newAssetCache());
        return jsonResult({ assetId: asset.id, url: asset.url });
      } catch (err) {
        if (err instanceof AssetUploadError) return errorResult(err.message);
        return errorResult(
          `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  );
}
