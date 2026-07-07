import { ConfigError, loadServerConfig } from "./config.js";
import { startHttpServer } from "./http.js";

void main().catch(handleFatal);

async function main(): Promise<void> {
  const config = loadServerConfig();
  const { server, url } = await startHttpServer(config);

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
}

function handleFatal(error: unknown): void {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else if (error instanceof Error) {
    console.error(error);
  } else {
    console.error("Startup failed:", error);
  }
  process.exit(1);
}
