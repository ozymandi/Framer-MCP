import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import { disconnectFramer } from "./framer-client.js";
import { registerAllTools } from "./tools/index.js";

const SESSION_HEADER = "mcp-session-id";

interface Session {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

const sessions = new Map<string, Session>();

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "framer-mcp", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Framer CMS server. Use framer_status first, then framer_describe_collection " +
        "for any collection you intend to write to. Field values are plain primitives " +
        "(string, number, boolean, null). Items are identified by slug. Call " +
        "framer_publish_and_deploy when you are ready to push changes live.",
    },
  );
  registerAllTools(server);
  return server;
}

async function bootstrap(): Promise<void> {
  const fastify = Fastify({ logger: true });

  fastify.addHook("onRequest", async (request, reply) => {
    if (request.url !== "/mcp") return;
    const auth = request.headers["authorization"];
    if (auth !== `Bearer ${config.mcpAuthToken}`) {
      await reply.code(401).send({ error: "Unauthorized" });
    }
  });

  fastify.get("/health", async () => ({ ok: true }));

  fastify.all("/mcp", async (request, reply) => {
    // Fastify reads JSON automatically for POSTs. Pass it through to the transport.
    const sessionId = request.headers[SESSION_HEADER];
    const sessionIdValue = Array.isArray(sessionId) ? sessionId[0] : sessionId;

    let session: Session | undefined;

    if (sessionIdValue && sessions.has(sessionIdValue)) {
      session = sessions.get(sessionIdValue);
    } else if (request.method === "POST" && isInitializeRequest(request.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, server });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = createMcpServer();
      await server.connect(transport);
      session = { transport, server };
    } else {
      await reply
        .code(400)
        .send({ jsonrpc: "2.0", error: { code: -32000, message: "No valid session" }, id: null });
      return;
    }

    if (!session) {
      await reply
        .code(500)
        .send({ jsonrpc: "2.0", error: { code: -32000, message: "Session unavailable" }, id: null });
      return;
    }

    await session.transport.handleRequest(request.raw, reply.raw, request.body);
  });

  fastify.addHook("onClose", async () => {
    await disconnectFramer();
    for (const { transport } of sessions.values()) {
      await transport.close();
    }
    sessions.clear();
  });

  await fastify.listen({ port: config.port, host: "0.0.0.0" });
  fastify.log.info(`framer-mcp listening on http://0.0.0.0:${config.port}/mcp`);
}

function installShutdownHandlers(): void {
  const shutdown = async () => {
    await disconnectFramer();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

installShutdownHandlers();
bootstrap().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
