import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  AssetUploadError,
  newAssetCache,
  resolveAssetValue,
} from "../asset-uploader.js";
import { errorResult, jsonResult, resolveProject } from "./helpers.js";

export function registerUploadImage(server: McpServer): void {
  server.registerTool(
    "framer_upload_image",
    {
      description:
        "Upload an image to the project and return its asset id. Use this when you want to " +
        "reuse the same image across multiple items. For one-off images, pass the URL directly " +
        "to framer_create_items. Input: a public http(s) URL or a data URL.",
      inputSchema: {
        project: z.string().optional().describe("Project alias. Required in multi-project mode."),
        source: z.string().min(1).describe("Public URL or data URL of the image."),
        alt: z.string().optional().describe("Optional alt text."),
      },
    },
    async ({ project, source, alt }) => {
      const proj = await resolveProject(project);
      if (!proj.ok) return errorResult(proj.error);
      const { framer } = proj.ctx;

      try {
        const asset = await resolveAssetValue(framer, "image", source, newAssetCache(), alt);
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
