import { loadConfig } from "./config.js";
import { createMonitorService } from "./app.js";
import { startScheduler } from "./scheduler.js";
import { logger, setLogLevel } from "./utils/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const monitorService = await createMonitorService();

  const tasks = startScheduler({
    cronActive: config.cronActive,
    cronCompleted: config.cronCompleted,
    monitorService
  });

  const shutdown = (signal: string) => {
    logger.info("Graceful shutdown requested", { signal });
    for (const task of tasks) {
      task.stop();
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("unhandledRejection", (reason) => logger.error("Unhandled rejection", reason));
  process.on("uncaughtException", (error) => logger.error("Uncaught exception", error));

  await monitorService.runCycle("active");
}

main().catch((error) => {
  logger.error("Application startup failed", error);
  process.exit(1);
});
