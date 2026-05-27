import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const rawTransport = (process.env.MCP_TRANSPORT ?? "http").toLowerCase();
if (rawTransport !== "http" && rawTransport !== "stdio") {
  throw new Error(`MCP_TRANSPORT must be "http" or "stdio", got "${rawTransport}"`);
}
const transport = rawTransport as "http" | "stdio";

export const config = {
  transport,
  framerApiKey: required("FRAMER_API_KEY"),
  framerProjectUrl: required("FRAMER_PROJECT_URL"),
  // HTTP-only knobs. Required only when MCP_TRANSPORT=http.
  mcpAuthToken: transport === "http" ? required("MCP_AUTH_TOKEN") : "",
  port: Number(process.env.MCP_PORT ?? 3000),
  maxAssetBytes: Number(process.env.MAX_ASSET_BYTES ?? 50 * 1024 * 1024),
};
