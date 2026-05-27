/**
 * Smoke test driver. Exercises all 8 tools against a running framer-mcp.
 * Run separately after `npm run dev`:
 *   npx tsx src/smoke.ts
 */
import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const port = process.env.MCP_PORT ?? "3000";
const token = process.env.MCP_AUTH_TOKEN;
if (!token) throw new Error("MCP_AUTH_TOKEN missing");

const url = new URL(`http://127.0.0.1:${port}/mcp`);

const transport = new StreamableHTTPClientTransport(url, {
  requestInit: { headers: { Authorization: `Bearer ${token}` } },
});

const client = new Client({ name: "framer-mcp-smoke", version: "0.1.0" });

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

  await step("1. framer_status", () => call("framer_status"));
  await step("2. framer_list_collections", () => call("framer_list_collections"));

  // Find a writable collection to operate on.
  const listRes = await client.callTool({ name: "framer_list_collections", arguments: {} });
  const listText = pickText(listRes as { content?: Array<{ type: string; text?: string }> });
  const parsed = JSON.parse(listText) as Array<{
    name: string;
    writable: boolean;
    fieldNames: string[];
  }>;
  const target = parsed.find((c) => c.writable && c.fieldNames.length > 0);
  if (!target) {
    console.log("\nNo writable collection with fields found. Aborting CRUD smoke test.");
    await client.close();
    return;
  }
  console.log(`\nUsing collection '${target.name}' for CRUD tests.`);

  await step("3. framer_describe_collection", () =>
    call("framer_describe_collection", { collection: target.name }),
  );

  const descRes = await client.callTool({
    name: "framer_describe_collection",
    arguments: { collection: target.name },
  });
  const desc = JSON.parse(
    pickText(descRes as { content?: Array<{ type: string; text?: string }> }),
  ) as {
    fields: Array<{ name: string; type: string; required: boolean; enumCases?: string[] }>;
  };

  // Build a sample value per writable field.
  const sample = (type: string, fieldName: string, idx: number, enumCases?: string[]): unknown => {
    switch (type) {
      case "string":
      case "formattedText":
        return `MCP smoke ${idx} — ${fieldName}`;
      case "number":
        return idx;
      case "boolean":
        return idx % 2 === 0;
      case "date":
        return new Date().toISOString();
      case "link":
        return "https://example.com/mcp-smoke";
      case "color":
        return "#ff8800";
      case "enum":
        return enumCases && enumCases.length > 0 ? enumCases[0] : null;
      default:
        return null;
    }
  };

  const buildFields = (idx: number): Record<string, unknown> => {
    const fields: Record<string, unknown> = {};
    for (const f of desc.fields) {
      const writable = [
        "string",
        "formattedText",
        "number",
        "boolean",
        "date",
        "link",
        "color",
        "enum",
      ].includes(f.type);
      if (!writable) continue;
      fields[f.name] = sample(f.type, f.name, idx, f.enumCases);
    }
    return fields;
  };

  const slugs = [`mcp-smoke-a-${Date.now()}`, `mcp-smoke-b-${Date.now()}`];

  await step("4. framer_list_items (before)", () =>
    call("framer_list_items", { collection: target.name, limit: 3 }),
  );

  await step("5. framer_create_items", () =>
    call("framer_create_items", {
      collection: target.name,
      items: [
        { slug: slugs[0], fields: buildFields(1) },
        { slug: slugs[1], fields: buildFields(2) },
      ],
    }),
  );

  await step("6. framer_update_items", () =>
    call("framer_update_items", {
      collection: target.name,
      items: [{ slug: slugs[0], fields: buildFields(99) }],
    }),
  );

  await step("7. framer_delete_items", () =>
    call("framer_delete_items", { collection: target.name, slugs }),
  );

  await step("8. framer_publish_and_deploy", () => call("framer_publish_and_deploy"));

  await client.close();
}

main().catch((err) => {
  console.error("Smoke driver failed:", err);
  process.exit(1);
});
