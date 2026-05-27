import type { Framer } from "./framer-client.js";
import { config } from "./config.js";

export class AssetUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssetUploadError";
  }
}

export type AssetKind = "image" | "file";

export interface ResolvedAsset {
  id: string;
  url: string;
}

const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/avif",
]);

/**
 * Per-call cache so the same URL within one request isn't fetched + uploaded twice.
 * Created fresh in each tool call.
 */
export type AssetCache = Map<string, ResolvedAsset>;

export function newAssetCache(): AssetCache {
  return new Map();
}

/**
 * Resolve a string value the LLM provided for an image/file field into a
 * concrete uploaded asset on the Framer side.
 *
 * Accepted inputs:
 *  - asset id   (no `://`, no `data:` prefix) — returned without re-uploading;
 *    url is unknown in this case.
 *  - URL        (http(s)://...) → uploaded via SDK
 *  - data URL   (data:<mime>;base64,...) → decoded, uploaded via SDK
 */
export async function resolveAssetValue(
  framer: Framer,
  kind: AssetKind,
  value: string,
  cache: AssetCache,
  alt: string | undefined = undefined,
): Promise<ResolvedAsset> {
  if (value.length === 0) {
    throw new AssetUploadError("Empty asset value.");
  }

  const cached = cache.get(value);
  if (cached) return cached;

  if (value.startsWith("data:")) {
    const asset = await uploadFromDataUrl(framer, kind, value, alt);
    cache.set(value, asset);
    return asset;
  }

  if (/^https?:\/\//i.test(value)) {
    const asset = await uploadFromUrl(framer, kind, value, alt);
    cache.set(value, asset);
    return asset;
  }

  if (/^[\w.-]{6,128}$/.test(value)) {
    return { id: value, url: value };
  }

  throw new AssetUploadError(
    `Asset value '${truncate(value)}' is neither an asset id, an http(s) URL, nor a data URL.`,
  );
}

async function uploadFromUrl(
  framer: Framer,
  kind: AssetKind,
  url: string,
  alt: string | undefined,
): Promise<ResolvedAsset> {
  const name = guessNameFromUrl(url);
  if (kind === "image") {
    const asset = await framer.uploadImage({ image: url, name, ...(alt ? { altText: alt } : {}) });
    return { id: asset.id, url: asset.url };
  }
  const asset = await framer.uploadFile({ file: url, name });
  return { id: asset.id, url: asset.url };
}

async function uploadFromDataUrl(
  framer: Framer,
  kind: AssetKind,
  dataUrl: string,
  alt: string | undefined,
): Promise<ResolvedAsset> {
  const parsed = parseDataUrl(dataUrl);
  if (parsed.bytes.byteLength > config.maxAssetBytes) {
    throw new AssetUploadError(
      `Asset payload is ${formatBytes(parsed.bytes.byteLength)}; ` +
        `limit is ${formatBytes(config.maxAssetBytes)} (set MAX_ASSET_BYTES to override).`,
    );
  }
  if (kind === "image" && !ALLOWED_IMAGE_MIME.has(parsed.mimeType)) {
    throw new AssetUploadError(
      `Unsupported image MIME type '${parsed.mimeType}'. ` +
        `Allowed: ${[...ALLOWED_IMAGE_MIME].join(", ")}.`,
    );
  }

  const name = `upload.${mimeToExtension(parsed.mimeType)}`;

  if (kind === "image") {
    const asset = await framer.uploadImage({
      image: { bytes: parsed.bytes, mimeType: parsed.mimeType },
      name,
      ...(alt ? { altText: alt } : {}),
    });
    return { id: asset.id, url: asset.url };
  }
  const asset = await framer.uploadFile({
    file: { bytes: parsed.bytes, mimeType: parsed.mimeType },
    name,
  });
  return { id: asset.id, url: asset.url };
}

interface ParsedDataUrl {
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
}

function parseDataUrl(input: string): ParsedDataUrl {
  // data:[<mediatype>][;base64],<data>
  const match = /^data:([^;,]+)?(?:;([^,]+))?,(.*)$/s.exec(input);
  if (!match) throw new AssetUploadError("Malformed data URL.");
  const [, rawMime, rawParams, rawPayload] = match;
  const mimeType = (rawMime ?? "application/octet-stream").toLowerCase();
  const isBase64 = (rawParams ?? "").split(";").some((p) => p.trim().toLowerCase() === "base64");
  const payload = rawPayload ?? "";

  const buf = isBase64
    ? Buffer.from(payload, "base64")
    : Buffer.from(decodeURIComponent(payload), "utf8");
  // Copy into a freshly-allocated ArrayBuffer (not SharedArrayBuffer) so the
  // resulting Uint8Array matches Framer's expected `Uint8Array<ArrayBuffer>`.
  const ab = new ArrayBuffer(buf.byteLength);
  const bytes = new Uint8Array(ab);
  bytes.set(buf);
  return { mimeType, bytes };
}

function guessNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    if (last && last.length > 0) return decodeURIComponent(last);
  } catch {
    // ignore
  }
  return "upload";
}

function mimeToExtension(mime: string): string {
  const m: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/svg+xml": "svg",
    "image/avif": "avif",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "text/markdown": "md",
    "application/json": "json",
  };
  return m[mime] ?? "bin";
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function truncate(s: string): string {
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}
