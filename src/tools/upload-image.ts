import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getFramer } from "../framer-client.js";
import {
  AssetUploadError,
  newAssetCache,
  resolveAssetValue,
} from "../asset-uploader.js";
import { errorResult, jsonResult } from "./helpers.js";

export function registerUploadImage(server: McpServer): void {
  server.registerTool(
    "framer_upload_image",
    {
      description:
        "Upload an image to the project and return its asset id. " +
        "Use this when you want to reuse the same image across multiple items. " +
        "For one-off images, you can also pass the URL directly to framer_create_items " +
        "and the server will upload it automatically. " +
        "Input: a public http(s) URL or a data URL (e.g. 'data:image/png;base64,...'). " +
        "Allowed image types: png, jpeg, webp, gif, svg, avif.",
      inputSchema: {
        source: z
          .string()
          .min(1)
          .describe("Public URL or data URL of the image."),
        alt: z.string().optional().describe("Optional alt text."),
      },
    },
    async ({ source, alt }) => {
      const framer = await getFramer();
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
