type LogLevel = "debug" | "info" | "warn" | "error";

const priority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: string): void {
  if (level in priority) {
    currentLevel = level as LogLevel;
  }
}

function write(level: LogLevel, message: string, meta?: unknown): void {
  if (priority[level] < priority[currentLevel]) {
    return;
  }

  const prefix = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;
  if (meta === undefined) {
    console.log(prefix);
    return;
  }
  console.log(prefix, serializeMeta(meta));
}

function serializeMeta(meta: unknown): string {
  if (meta instanceof Error) {
    return JSON.stringify({ name: meta.name, message: meta.message, stack: meta.stack });
  }
  return JSON.stringify(meta);
}

export const logger = {
  debug: (message: string, meta?: unknown) => write("debug", message, meta),
  info: (message: string, meta?: unknown) => write("info", message, meta),
  warn: (message: string, meta?: unknown) => write("warn", message, meta),
  error: (message: string, meta?: unknown) => write("error", message, meta)
};
