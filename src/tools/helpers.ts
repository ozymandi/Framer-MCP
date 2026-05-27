import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  getCollectionByName,
  listCollections,
  suggestName,
} from "../schema-cache.js";
import type { CachedCollection } from "../schema-cache.js";
import { config } from "../config.js";
import { getFramer, listProjects, lookupProject, type Framer } from "../framer-client.js";

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

export interface ProjectContext {
  alias: string;
  framer: Framer;
  projectName: string;
}

/**
 * Resolve the project arg passed in by the client.
 *
 * In single-project mode: ignores the arg (if any) and returns the
 * lone configured project.
 *
 * In multi-project mode: `project` is mandatory. Unknown aliases get a
 * friendly error + "Did you mean" hint and the full list of valid aliases.
 */
export async function resolveProject(
  arg: string | undefined,
): Promise<{ ok: true; ctx: ProjectContext } | { ok: false; error: string }> {
  if (!config.multiProject) {
    const single = config.projects[0];
    if (!single) {
      return { ok: false, error: "Server has no projects configured." };
    }
    const framer = await getFramer(single.alias);
    return { ok: true, ctx: { alias: normAlias(single.alias), framer, projectName: single.alias } };
  }

  if (!arg || typeof arg !== "string" || arg.length === 0) {
    const aliases = listProjects().map((p) => p.alias);
    return {
      ok: false,
      error:
        `This server hosts multiple projects. Specify 'project' with one of: ` +
        `${aliases.join(", ")}. Call framer_list_projects to see all.`,
    };
  }

  const proj = lookupProject(arg);
  if (!proj) {
    const aliases = listProjects().map((p) => p.alias);
    const hint = suggestName(arg, aliases);
    return {
      ok: false,
      error:
        `Project '${arg}' is not configured.` +
        (hint ? ` Did you mean '${hint}'?` : "") +
        ` Available: ${aliases.join(", ")}.`,
    };
  }
  const framer = await getFramer(proj.alias);
  return { ok: true, ctx: { alias: normAlias(proj.alias), framer, projectName: proj.alias } };
}

function normAlias(input: string): string {
  return input.toLowerCase().replace(/[\s_-]+/g, "");
}

export function resolveCollection(
  alias: string,
  name: string,
  opts: { forWrite: boolean },
): { ok: true; collection: CachedCollection } | { ok: false; error: string } {
  const collection = getCollectionByName(alias, name);
  if (!collection) {
    const known = listCollections(alias).map((c) => c.name);
    const hint = suggestName(name, known);
    return {
      ok: false,
      error:
        `Collection '${name}' not found.` +
        (hint
          ? ` Did you mean '${hint}'?`
          : known.length > 0
            ? ` Known collections: ${known.join(", ")}.`
            : " No collections in this project."),
    };
  }
  if (opts.forWrite && collection.managedBy === "anotherPlugin") {
    return {
      ok: false,
      error: `Collection '${collection.name}' is managed by another plugin and cannot be modified through this server.`,
    };
  }
  return { ok: true, collection };
}
