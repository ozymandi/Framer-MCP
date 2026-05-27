# framer-mcp — Task

## Goal

An MCP (Model Context Protocol) server that any LLM client — capable
(Claude) or small (Gemma-class) — can connect to in order to read and write
Framer CMS content and publish a Framer site.

The MCP itself does NOT call any LLM. The connected client model is the
generator; this server is the writer.

## Scope — v1 (simple mode)

- One Framer project per server instance, configured via env.
- HTTP transport (streamable HTTP), Bearer auth.
- Ten tools, all designed for small-model usability:
  - `framer_status`
  - `framer_list_collections`
  - `framer_describe_collection`
  - `framer_list_items`
  - `framer_create_items`
  - `framer_update_items`
  - `framer_delete_items`
  - `framer_upload_image`
  - `framer_upload_file`
  - `framer_publish_and_deploy`
- Operates on existing user-created collections. No schema editing in v1.
- All identifiers (collection ids, field ids) hidden from the client. The
  client uses collection names, field names, slugs. Server maps internally.
- Field values passed as plain primitives. Server wraps them into Framer's
  typed `FieldDataEntry` form using the cached schema.
- Image and file fields accept three input forms in writes: an http(s) URL,
  a data URL, or an existing asset id. URLs and data URLs are uploaded
  on the fly. Hard size cap: 50 MiB (env `MAX_ASSET_BYTES`).

## Out of scope — v1

- `collectionReference` / `multiCollectionReference` fields in writes.
- Creating collections / adding fields from MCP.
- An `expert` mode exposing thin 1:1 SDK primitives.
- Multi-project routing in a single server.

## Key references

- Framer Server API intro: <https://www.framer.com/developers/server-api-introduction>
- Quick start: <https://www.framer.com/developers/server-api-quick-start>
- Reference: <https://www.framer.com/developers/server-api-reference>
- Examples repo: <https://github.com/framer/server-api-examples>
- Canonical pattern source: `examples/notion-automations-sync/src/index.ts`
- MCP SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
