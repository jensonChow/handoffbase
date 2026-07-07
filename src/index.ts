import { startHttpServer } from "./http.js";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const mcpPath = process.env.MCP_PATH ?? "/mcp";

const { server, url } = await startHttpServer({ host, port, mcpPath });

console.log(`handoffbase listening at ${url}`);

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}; shutting down`);
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error("Shutdown failed:", error);
        process.exit(1);
      });
  });
}
