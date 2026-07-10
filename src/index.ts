import { ConfigError, loadServerConfig } from "./config.js";
import { startHttpServer } from "./http.js";

void main().catch(handleFatal);

async function main(): Promise<void> {
  const config = loadServerConfig();
  const started = await startHttpServer(config);

  console.log(`handoffbase listening at ${started.url}`);

  let shutdownPromise: Promise<void> | undefined;
  function shutdown(signal: string): Promise<void> {
    if (!shutdownPromise) {
      console.log(`Received ${signal}; shutting down`);
      shutdownPromise = started.close();
    }
    return shutdownPromise;
  }

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      shutdown(signal)
        .then(() => process.exit(0))
        .catch(() => {
          console.error("Shutdown failed.");
          process.exit(1);
        });
    });
  }
}

function handleFatal(error: unknown): void {
  if (error instanceof ConfigError) {
    console.error(error.message);
  } else {
    console.error("Startup failed.");
  }
  process.exit(1);
}
