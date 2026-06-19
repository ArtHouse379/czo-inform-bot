import { loadConfig } from "./config.js";
import { MonitorService } from "./monitor/monitor.service.js";
import { MonitoringClient } from "./prozorro/monitoring.client.js";
import { PortalTenderResolverClient } from "./prozorro/portal-resolver.client.js";
import { ProzorroClient } from "./prozorro/prozorro.client.js";
import { SheetsClient } from "./sheets/sheets.client.js";
import { SheetsService } from "./sheets/sheets.service.js";
import { TelegramClient } from "./telegram/telegram.client.js";
import { setLogLevel } from "./utils/logger.js";

export async function createMonitorService(): Promise<MonitorService> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const sheetsClient = new SheetsClient({
    spreadsheetId: config.googleSheetsSpreadsheetId,
    serviceAccountEmail: config.googleServiceAccountEmail,
    privateKey: config.googlePrivateKey
  });
  await sheetsClient.assertAccess();

  const sheetsService = new SheetsService(sheetsClient);
  const prozorroClient = new ProzorroClient(config.prozorroBaseUrl);
  const portalTenderResolverClient = new PortalTenderResolverClient(config.prozorroPortalApiBaseUrl);
  const monitoringClient = new MonitoringClient(config.prozorroMonitoringBaseUrl);
  const telegramClient = new TelegramClient(config.telegramBotToken, config.telegramChatId);

  return new MonitorService(
    prozorroClient,
    portalTenderResolverClient,
    monitoringClient,
    sheetsService,
    telegramClient
  );
}
