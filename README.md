# Framer MCP

An MCP (Model Context Protocol) server that lets any LLM client — capable
(Claude) or small (Gemma-class) — read and write Framer CMS content,
upload assets, edit collection schemas, and publish a Framer site.

The server itself never calls an LLM. The connected client model is the
generator; this server is the writer.

---

## What it does

- Lists Framer projects (single or multi), collections, and CMS items.
- Creates, updates, and deletes CMS items in bulk.
- Uploads images and files from public URLs or data URLs — the server
  fetches and hands them to the Framer SDK transparently.
- Resolves `collectionReference` and `multiCollectionReference` fields
  by slug, so the LLM never has to deal with internal item ids.
- Creates and edits collections, fields, and enum cases — full schema
  scaffolding from chat.
- Publishes and deploys.
- In expert mode, exposes URL redirects, deployment history, item /
  field reorder, and a paths-changed-since-last-deploy view.

Designed so a small local model (Gemma, Llama, Mistral) can drive it
with the same reliability as Claude:

- All field, collection, and project identifiers hidden from the client.
- Field names accept any form: `"Author Name"`, `"author_name"`,
  `"author-name"`, `"AuthorName"` all match the same field.
- Each `framer_create_items` call returns a per-item completeness
  report (`4/10 fields filled — empty: Date, Image, ...`) so the
  model knows what to fill next.
- Errors carry Did-you-mean suggestions.

---

## Quick start

### 1. Clone and build

```cmd
git clone https://github.com/ozymandi/Framer-MCP.git
cd Framer-MCP
setup.bat
```

`setup.bat` runs `npm install` + `npm run build`, producing
`dist/server.js`. Manually: `npm install && npm run build`.

Requires Node.js 22 or newer.

### 2. Get a Framer API key

In Framer, open your project. Settings (Cmd+K → "open settings") →
API Keys → create one. It looks like `fr_xxxxxxxxxxxxxxxxxxxxxxxxxxx`
and is bound to that one project.

### 3. Configure

Single-project (`.env`):

```env
FRAMER_API_KEY=fr_...
FRAMER_PROJECT_URL=https://framer.com/projects/My-Project--xxxxx
MCP_AUTH_TOKEN=any-random-string   # only needed for HTTP transport
```

Multi-project — create `projects.json` (gitignored by default):

```json
[
  {
    "alias": "portfolio",
    "url": "https://framer.com/projects/Portfolio--abc",
    "apiKey": "fr_aaa"
  },
  {
    "alias": "blog",
    "url": "https://framer.com/projects/Blog--xyz",
    "apiKey": "fr_bbb"
  }
]
```

and in `.env`:

```env
FRAMER_PROJECTS_FILE=./projects.json
```

When `FRAMER_PROJECTS_FILE` is set, the single-project env vars are
ignored. Each project needs its own API key.

### 4. Run

```cmd
npm start          # production (dist/server.js)
npm run dev        # dev with tsx watch
```

The server defaults to **HTTP transport** on `:3000`. For desktop MCP
clients (LM Studio, Claude Desktop) you usually want **stdio** —
managed by the client. See below.

---

## Integrate with an MCP client

### LM Studio

Edit `mcp.json` (Program tab → Edit mcp.json). Add a `framer` entry:

```json
{
  "mcpServers": {
    "framer": {
      "command": "node",
      "args": [
        "E:/Projects/framer mcp/dist/server.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "FRAMER_PROJECTS_FILE": "E:/Projects/framer mcp/projects.json"
      }
    }
  }
}
```

Replace the paths with your own absolute paths. For single-project,
swap `FRAMER_PROJECTS_FILE` for `FRAMER_API_KEY` + `FRAMER_PROJECT_URL`.

Restart LM Studio. The model's tool list should now include 15
`framer_*` tools (or 22 with expert mode on).

### Claude Desktop

Same shape, file is `claude_desktop_config.json` under the platform-
specific config directory.

### HTTP (any client)

If a client speaks Streamable HTTP MCP directly, point it at:

```
POST  http://localhost:3000/mcp
Authorization: Bearer <MCP_AUTH_TOKEN>
```

HTTP is the default transport; use `MCP_TRANSPORT=stdio` to switch.

---

## Configuration reference

| Env var                  | Required          | Description                                              |
|--------------------------|-------------------|----------------------------------------------------------|
| `FRAMER_API_KEY`         | single mode       | Framer API key, bound to one project.                    |
| `FRAMER_PROJECT_URL`     | single mode       | Full project URL.                                        |
| `FRAMER_PROJECTS_FILE`   | multi mode        | Path to a JSON array of `{ alias, url, apiKey }`.        |
| `MCP_TRANSPORT`          | no (`http`)       | `http` or `stdio`.                                       |
| `MCP_AUTH_TOKEN`         | HTTP transport    | Bearer token clients must pass.                          |
| `MCP_PORT`               | no (`3000`)       | HTTP listen port.                                        |
| `MCP_EXPERT_MODE`        | no (`false`)      | `true` registers seven extra tools (see below).          |
| `MAX_ASSET_BYTES`        | no (50 MiB)       | Hard cap on a single image/file payload.                 |

---

## Tools

### Simple — always on (15)

| Tool                            | Purpose                                                         |
|---------------------------------|-----------------------------------------------------------------|
| `framer_list_projects`          | Configured project aliases + current modes.                     |
| `framer_status`                 | Project name, collection count, last deploy.                    |
| `framer_list_collections`       | All collections with item counts and field names.               |
| `framer_describe_collection`    | Full schema. Read before writing.                               |
| `framer_list_items`             | Items in a collection (slug + field map). Paginated.            |
| `framer_create_items`           | Bulk-create items. Returns per-item completeness report.        |
| `framer_update_items`           | Patch items by slug. Pass only fields you change.               |
| `framer_delete_items`           | Delete items by slug.                                           |
| `framer_upload_image`           | Upload an image (URL or data URL), get back asset id + URL.     |
| `framer_upload_file`            | Same for non-image files.                                       |
| `framer_create_collection`      | Create a collection, optionally with fields in one call.        |
| `framer_add_fields`             | Add fields to an existing collection.                           |
| `framer_remove_fields`          | Remove fields by name.                                          |
| `framer_add_enum_cases`         | Extend an enum field with new cases.                            |
| `framer_publish_and_deploy`     | Publish to preview, then promote to production.                 |

### Expert — `MCP_EXPERT_MODE=true` only (7 more)

| Tool                            | Purpose                                                         |
|---------------------------------|-----------------------------------------------------------------|
| `framer_get_changed_paths`      | Paths added / removed / modified since last deploy.             |
| `framer_list_deployments`       | Deployment history with timestamps.                             |
| `framer_list_redirects`         | All URL redirects on the project.                               |
| `framer_add_redirects`          | Add redirects (supports `*` wildcards and `:1` capture refs).   |
| `framer_remove_redirects`       | Remove redirects by `from` path.                                |
| `framer_reorder_items`          | Set explicit item order in a collection.                        |
| `framer_reorder_fields`         | Set explicit field order in a schema.                           |

---

## Field types

Writable from `framer_create_items` / `framer_update_items`:

| Type                          | Plain value the LLM passes                                |
|-------------------------------|-----------------------------------------------------------|
| `string`, `formattedText`     | string                                                    |
| `number`                      | number                                                    |
| `boolean`                     | boolean                                                   |
| `date`                        | ISO 8601 string or epoch number                           |
| `link`, `color`               | string (URL / hex)                                        |
| `enum`                        | case name (the server resolves to case id)                |
| `image`, `file`               | public URL, `data:` URL, or existing asset id             |
| `collectionReference`         | slug of target item                                       |
| `multiCollectionReference`    | array of slugs                                            |

Not writable yet: `array` (gallery of images), `divider`, `unsupported`.

---

## Architecture

```
LLM client (LM Studio, Claude Desktop, ...)
        │  JSON-RPC over stdio or HTTP
        ▼
  MCP server (this repo)
        │  framer-api SDK
        ▼
   Framer Server API
        │
        ▼
   Framer project (CMS, assets, deploys)
```

Key modules under `src/`:

- `server.ts` — HTTP (Fastify) and stdio entry points.
- `config.ts` — env + projects.json loader.
- `framer-client.ts` — pool of `alias → Framer` SDK connections.
- `schema-cache.ts` — per-project cache of collections, fields, enum
  cases, with normalized-key lookup.
- `field-encoder.ts` — plain JSON ↔ Framer's typed `FieldDataEntry`.
- `field-builder.ts` — friendly create-field shape → SDK `CreateField`.
- `asset-uploader.ts` — URL / data-URL / asset-id resolution.
- `reference-resolver.ts` — slug ↔ item id for reference fields.
- `tools/` — one file per MCP tool; `index.ts` registers them.

---

## Development

```cmd
npm run dev        # tsx watch on src/server.ts
npm run typecheck  # tsc --noEmit
npm run build      # tsc to dist/
```

There are no unit tests yet — verification is via manual smoke
drivers (see commit history). Add `vitest` or `node:test` if you
contribute logic-heavy code.

---

## Known limitations

- The Framer Server API is in open beta. The `framer-api` SDK can change
  between releases.
- One API key is bound to one project. Multi-project mode just keeps
  more keys; you cannot use one key across projects.
- `addRedirects` requires a paid Framer plan; free plans return
  `Current plan does not include Redirects`.
- Deleting a collection is not exposed by the SDK. Drop it from the
  Framer UI.
- Cross-project references are not supported — every reference field
  resolves within its own project.
- The `array` field type (CMS image gallery) is read-only.

---

## License

No license file yet. If you fork, add one. The author intends this to
be permissive — opening the repo for a future LICENSE under MIT or
Apache 2.0 is fine.

---

## Links

- Framer Server API introduction: <https://www.framer.com/developers/server-api-introduction>
- Quick start: <https://www.framer.com/developers/server-api-quick-start>
- Official examples: <https://github.com/framer/server-api-examples>
- Model Context Protocol: <https://modelcontextprotocol.io/docs/getting-started/intro>
- This repo: <https://github.com/ozymandi/Framer-MCP>
