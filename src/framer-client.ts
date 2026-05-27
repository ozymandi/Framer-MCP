import { connect } from "framer-api";
import { config, type ProjectConfig } from "./config.js";

export type Framer = Awaited<ReturnType<typeof connect>>;

function normalizeAlias(input: string): string {
  return input.toLowerCase().replace(/[\s_-]+/g, "");
}

const projectsByAlias = new Map<string, ProjectConfig>();
for (const p of config.projects) projectsByAlias.set(normalizeAlias(p.alias), p);

const framerPromises = new Map<string, Promise<Framer>>();

export function listProjects(): ProjectConfig[] {
  return [...config.projects];
}

export function lookupProject(alias: string): ProjectConfig | undefined {
  return projectsByAlias.get(normalizeAlias(alias));
}

export function getFramer(alias: string): Promise<Framer> {
  const norm = normalizeAlias(alias);
  const existing = framerPromises.get(norm);
  if (existing) return existing;

  const project = projectsByAlias.get(norm);
  if (!project) {
    return Promise.reject(new Error(`Project alias '${alias}' is not configured.`));
  }
  const p = connect(project.url, project.apiKey);
  framerPromises.set(norm, p);
  return p;
}

export async function disconnectAll(): Promise<void> {
  const promises = [...framerPromises.values()];
  framerPromises.clear();
  for (const promise of promises) {
    try {
      const framer = await promise;
      await framer.disconnect();
    } catch {
      // Best-effort.
    }
  }
}
