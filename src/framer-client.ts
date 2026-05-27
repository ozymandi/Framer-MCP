import { connect } from "framer-api";
import { config } from "./config.js";

export type Framer = Awaited<ReturnType<typeof connect>>;

let framerPromise: Promise<Framer> | null = null;

export function getFramer(): Promise<Framer> {
  if (!framerPromise) {
    framerPromise = connect(config.framerProjectUrl, config.framerApiKey);
  }
  return framerPromise;
}

export async function disconnectFramer(): Promise<void> {
  if (!framerPromise) return;
  try {
    const framer = await framerPromise;
    await framer.disconnect();
  } finally {
    framerPromise = null;
  }
}
