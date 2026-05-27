/**
 * Smoke test for asset upload — separate from the main flow.
 * Exercises:
 *   1. framer_upload_image with a public URL.
 *   2. framer_upload_image with a data URL.
 *   3. framer_create_items with an image field set by URL (implicit upload).
 *   4. framer_list_items round-trip — verify the image surfaces with a Framer URL.
 *   5. cleanup.
 * Requires a running server (`npm run dev`) and a Blog-like collection with
 * a writable image field.
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const port = process.env.MCP_PORT ?? "3000";
const token = process.env.MCP_AUTH_TOKEN;
if (!token) throw new Error("MCP_AUTH_TOKEN missing");

// 1x1 transparent PNG — tiny payload to test the data URL path without touching the network.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

// A real, stable public image. placehold.co serves a generated PNG.
const PUBLIC_IMAGE_URL = "https://placehold.co/256x256.png";

const url = new URL(`http://127.0.0.1:${port}/mcp`);
const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});
const client = new Client({ name: "framer-mcp-asset-smoke", version: "0.1.0" });

function pickText(result: { content?: Array<{ type: string; text?: string }> }): string {
  const first = result.content?.find((c) => c.type === "text");
  return first?.text ?? "(no text)";
}

async function call(name: string, args: Record<string, unknown> = {}): Promise<string> {
  const start = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args });
    const elapsed = Date.now() - start;
    const text = pickText(res as { content?: Array<{ type: string; text?: string }> });
    const isErr = (res as { isError?: boolean }).isError ? " [isError=true]" : "";
    return `[${elapsed}ms]${isErr}\n${text}`;
  } catch (e) {
    const elapsed = Date.now() - start;
    return `[${elapsed}ms] THREW: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function step(title: string, body: () => Promise<string>): Promise<void> {
  console.log(`\n=== ${title} ===`);
  console.log(await body());
}

async function main(): Promise<void> {
  await client.connect(transport);

  // Find a collection that has a writable image field.
  const listRes = await client.callTool({ name: "framer_list_collections", arguments: {} });
  const collections = JSON.parse(
    pickText(listRes as { content?: Array<{ type: string; text?: string }> }),
  ) as Array<{ name: string; writable: boolean; fieldNames: string[] }>;

  let targetCollection: string | null = null;
  let imageFieldName: string | null = null;
  for (const col of collections) {
    if (!col.writable) continue;
    const descRes = await client.callTool({
      name: "framer_describe_collection",
      arguments: { collection: col.name },
    });
    const desc = JSON.parse(
      pickText(descRes as { content?: Array<{ type: string; text?: string }> }),
    ) as { fields: Array<{ name: string; type: string; required: boolean }> };
    const img = desc.fields.find((f) => f.type === "image" && !f.required);
    if (img) {
      targetCollection = col.name;
      imageFieldName = img.name;
      // also need the required string field for slug + title
      break;
    }
  }
  if (!targetCollection || !imageFieldName) {
    console.log("No writable collection with a non-required image field. Aborting.");
    await client.close();
    return;
  }
  console.log(
    `Using collection '${targetCollection}', image field '${imageFieldName}'.`,
  );

  // Get the title field name (first required string) for valid item creation.
  const descRes = await client.callTool({
    name: "framer_describe_collection",
    arguments: { collection: targetCollection },
  });
  const desc = JSON.parse(
    pickText(descRes as { content?: Array<{ type: string; text?: string }> }),
  ) as { fields: Array<{ name: string; type: string; required: boolean }> };
  const titleField = desc.fields.find((f) => f.type === "string" && f.required);
  if (!titleField) {
    console.log("Collection has no required string field for a title. Aborting.");
    await client.close();
    return;
  }

  await step("1. framer_upload_image (public URL)", () =>
    call("framer_upload_image", { source: PUBLIC_IMAGE_URL, alt: "Smoke test" }),
  );

  await step("2. framer_upload_image (data URL)", () =>
    call("framer_upload_image", { source: TINY_PNG_DATA_URL }),
  );

  const slugA = `mcp-asset-a-${Date.now()}`;
  const slugB = `mcp-asset-b-${Date.now()}`;

  await step("3. framer_create_items with image URL (implicit upload)", () =>
    call("framer_create_items", {
      collection: targetCollection,
      items: [
        {
          slug: slugA,
          fields: {
            [titleField.name]: "MCP asset smoke A",
            [imageFieldName]: PUBLIC_IMAGE_URL,
          },
        },
        {
          slug: slugB,
          fields: {
            [titleField.name]: "MCP asset smoke B",
            [imageFieldName]: TINY_PNG_DATA_URL,
          },
        },
      ],
    }),
  );

  await step("4. framer_list_items (verify image present)", async () => {
    const res = await client.callTool({
      name: "framer_list_items",
      arguments: { collection: targetCollection, limit: 100 },
    });
    const parsed = JSON.parse(
      pickText(res as { content?: Array<{ type: string; text?: string }> }),
    ) as { items: Array<{ slug: string; fields: Record<string, unknown> }> };
    const justOurs = parsed.items.filter((i) => i.slug === slugA || i.slug === slugB);
    return JSON.stringify(
      justOurs.map((i) => ({ slug: i.slug, image: i.fields[imageFieldName] })),
      null,
      2,
    );
  });

  await step("5. cleanup (delete smoke items)", () =>
    call("framer_delete_items", { collection: targetCollection, slugs: [slugA, slugB] }),
  );

  await client.close();
}

main().catch((err) => {
  console.error("Asset smoke failed:", err);
  process.exit(1);
});
