import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  framerApiKey: required("FRAMER_API_KEY"),
  framerProjectUrl: required("FRAMER_PROJECT_URL"),
  mcpAuthToken: required("MCP_AUTH_TOKEN"),
  port: Number(process.env.MCP_PORT ?? 3000),
  maxAssetBytes: Number(process.env.MAX_ASSET_BYTES ?? 50 * 1024 * 1024),
};
