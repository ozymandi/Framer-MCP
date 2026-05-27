import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import {
  AssetUploadError,
  newAssetCache,
  resolveAssetValue,
} from "../asset-uploader.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerUploadFile(server: McpServer): void {
  server.registerTool(
    "framer_upload_file",
    {
      description:
        "Upload a non-image file (PDF, text, etc.) to the project and return its asset id. " +
        "Use this when you want to reuse the same file across multiple items. " +
        "For one-off files, pass the URL directly to framer_create_items and the server " +
        "will upload it automatically. " +
        "Input: a public http(s) URL or a data URL.",
      inputSchema: {
        source: z
          .string()
          .min(1)
          .describe("Public URL or data URL of the file."),
      },
    },
    async ({ source }) => {
      const framer = await getFramer();
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
