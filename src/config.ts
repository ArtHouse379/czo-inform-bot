import dotenv from "dotenv";

dotenv.config();

export type AppConfig = {
  prozorroBaseUrl: string;
  prozorroMonitoringBaseUrl: string;
  prozorroPortalApiBaseUrl: string;
  googleSheetsSpreadsheetId: string;
  googleServiceAccountEmail: string;
  googlePrivateKey: string;
  telegramBotToken: string;
  telegramChatId: string;
  cronActive: string;
  cronCompleted: string;
  logLevel: string;
};

const optionalDefaults = {
  PROZORRO_BASE_URL: "https://public.api.openprocurement.org/api/2.5",
  PROZORRO_MONITORING_BASE_URL: "https://prozorro.gov.ua/api",
  PROZORRO_PORTAL_API_BASE_URL: "https://prozorro.gov.ua/api",
  CRON_ACTIVE: "*/10 * * * *",
  CRON_COMPLETED: "0 */6 * * *",
  LOG_LEVEL: "info"
};

export function loadConfig(): AppConfig {
  const env = process.env;
  const required = [
    "GOOGLE_SHEETS_SPREADSHEET_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID"
  ];

  const missing = required.filter((name) => !env[name]?.trim());
  if (!env.GOOGLE_PRIVATE_KEY?.trim() && !env.GOOGLE_PRIVATE_KEY_BASE64?.trim()) {
    missing.push("GOOGLE_PRIVATE_KEY or GOOGLE_PRIVATE_KEY_BASE64");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    prozorroBaseUrl: env.PROZORRO_BASE_URL || optionalDefaults.PROZORRO_BASE_URL,
    prozorroMonitoringBaseUrl:
      env.PROZORRO_MONITORING_BASE_URL || optionalDefaults.PROZORRO_MONITORING_BASE_URL,
    prozorroPortalApiBaseUrl:
      env.PROZORRO_PORTAL_API_BASE_URL || optionalDefaults.PROZORRO_PORTAL_API_BASE_URL,
    googleSheetsSpreadsheetId: env.GOOGLE_SHEETS_SPREADSHEET_ID!,
    googleServiceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    googlePrivateKey: normalizePrivateKey(env.GOOGLE_PRIVATE_KEY, env.GOOGLE_PRIVATE_KEY_BASE64),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN!,
    telegramChatId: env.TELEGRAM_CHAT_ID!,
    cronActive: env.CRON_ACTIVE || optionalDefaults.CRON_ACTIVE,
    cronCompleted: env.CRON_COMPLETED || optionalDefaults.CRON_COMPLETED,
    logLevel: env.LOG_LEVEL || optionalDefaults.LOG_LEVEL
  };
}

function normalizePrivateKey(value: string | undefined, base64Value: string | undefined): string {
  const decodedBase64 = decodeBase64PrivateKey(base64Value);
  let key = decodedBase64 ?? value ?? "";

  key = key.trim();
  key = stripWrappingQuotes(key);
  key = key.replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trim();

  if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
    throw new Error(
      "GOOGLE_PRIVATE_KEY is not a valid PEM private key. Use the private_key field from the service account JSON, or set GOOGLE_PRIVATE_KEY_BASE64."
    );
  }

  return key;
}

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function decodeBase64PrivateKey(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  return Buffer.from(value.trim(), "base64").toString("utf8");
}
