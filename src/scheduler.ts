import cron, { ScheduledTask } from "node-cron";
import { logger } from "./utils/logger.js";
import type { MonitorService } from "./monitor/monitor.service.js";

export function startScheduler(options: {
  cronActive: string;
  cronCompleted: string;
  monitorService: MonitorService;
}): ScheduledTask[] {
  const activeTask = cron.schedule(options.cronActive, () => {
    void options.monitorService.runCycle("active");
  });

  const completedTask = cron.schedule(options.cronCompleted, () => {
    void options.monitorService.runCycle("completed");
  });

  logger.info("Cron scheduler started", {
    active: options.cronActive,
    completed: options.cronCompleted
  });

  return [activeTask, completedTask];
}
