import { createMonitorService } from "./app.js";
import { logger } from "./utils/logger.js";

async function main(): Promise<void> {
  const monitorService = await createMonitorService();
  await monitorService.runCycle("active");
}

main().catch((error) => {
  logger.error("Run-once monitoring failed", error);
  process.exit(1);
});
