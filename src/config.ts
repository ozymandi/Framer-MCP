import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export interface ProjectConfig {
  alias: string;
  url: string;
  apiKey: string;
}

const rawTransport = (process.env.MCP_TRANSPORT ?? "http").toLowerCase();
if (rawTransport !== "http" && rawTransport !== "stdio") {
  throw new Error(`MCP_TRANSPORT must be "http" or "stdio", got "${rawTransport}"`);
}
const transport = rawTransport as "http" | "stdio";

function normalizeAlias(input: string): string {
  return input.toLowerCase().replace(/[\s_-]+/g, "");
}

function loadProjects(): { projects: ProjectConfig[]; multi: boolean } {
  const projectsFile = process.env.FRAMER_PROJECTS_FILE;
  if (projectsFile) {
    const fullPath = resolve(projectsFile);
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(fullPath, "utf8"));
    } catch (err) {
      throw new Error(
        `Failed to read FRAMER_PROJECTS_FILE at ${fullPath}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
    if (!Array.isArray(raw) || raw.length === 0) {
      throw new Error(
        `${fullPath} must contain a non-empty JSON array of { alias, url, apiKey } entries.`,
      );
    }
    const seen = new Set<string>();
    const projects: ProjectConfig[] = [];
    for (const [i, entry] of raw.entries()) {
      if (
        !entry ||
        typeof entry !== "object" ||
        typeof (entry as { alias?: unknown }).alias !== "string" ||
        typeof (entry as { url?: unknown }).url !== "string" ||
        typeof (entry as { apiKey?: unknown }).apiKey !== "string"
      ) {
        throw new Error(`${fullPath}[${i}]: each entry needs { alias, url, apiKey } strings.`);
      }
      const cfg = entry as ProjectConfig;
      const norm = normalizeAlias(cfg.alias);
      if (seen.has(norm)) {
        throw new Error(`${fullPath}: duplicate (post-normalization) alias '${cfg.alias}'.`);
      }
      seen.add(norm);
      projects.push(cfg);
    }
    return { projects, multi: true };
  }

  // Backward-compat single-project mode.
  const url = required("FRAMER_PROJECT_URL");
  const apiKey = required("FRAMER_API_KEY");
  return { projects: [{ alias: "default", url, apiKey }], multi: false };
}

const { projects, multi } = loadProjects();

const expertMode = (process.env.MCP_EXPERT_MODE ?? "").toLowerCase() === "true";

export const config = {
  transport,
  projects,
  multiProject: multi,
  expertMode,
  // HTTP-only knobs. Required only when MCP_TRANSPORT=http.
  mcpAuthToken: transport === "http" ? required("MCP_AUTH_TOKEN") : "",
  port: Number(process.env.MCP_PORT ?? 3000),
  maxAssetBytes: Number(process.env.MAX_ASSET_BYTES ?? 50 * 1024 * 1024),
};
