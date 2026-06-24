import { ProzorroClient } from "../prozorro/prozorro.client.js";
import { MonitoringClient } from "../prozorro/monitoring.client.js";
import { PortalTenderResolverClient } from "../prozorro/portal-resolver.client.js";
import { SheetsService, type ConfigTender, type TenderMapEntry } from "../sheets/sheets.service.js";
import { TelegramClient } from "../telegram/telegram.client.js";
import { logger } from "../utils/logger.js";
import { diffMonitoringsOnly, diffTender } from "./diff.service.js";
import type { TenderEvent } from "./event.types.js";
import type { TenderSnapshot } from "./state.service.js";

export class MonitorService {
  private running = false;

  constructor(
    private readonly prozorroClient: ProzorroClient,
    private readonly portalTenderResolverClient: PortalTenderResolverClient,
    private readonly monitoringClient: MonitoringClient,
    private readonly sheetsService: SheetsService,
    private readonly telegramClient: TelegramClient
  ) {}

  async runCycle(mode: "active" | "completed"): Promise<void> {
    if (this.running) {
      logger.warn("Monitoring cycle is already running, skipping");
      return;
    }

    this.running = true;
    try {
      await this.sheetsService.ensureHeaders();
      const configTenders = await this.sheetsService.getConfigTenders();
      const selected = mode === "completed" ? configTenders : configTenders;
      const stateMap = await this.sheetsService.getStateMap();
      const tenderMap = await this.sheetsService.getTenderMap();

      logger.info("Monitoring cycle started", { mode, tenders: selected.length });

      for (const item of selected) {
        await this.processTender(item, stateMap, tenderMap);
      }

      await this.sheetsService.saveStateMap(stateMap);
      await this.sheetsService.saveTenderMap(tenderMap);
      logger.info("Monitoring cycle finished", { mode });
    } catch (error) {
      logger.error("Monitoring cycle failed", error);
    } finally {
      this.running = false;
    }
  }

  private async processTender(
    configTender: ConfigTender,
    stateMap: Map<string, TenderSnapshot>,
    tenderMap: Map<string, TenderMapEntry>
  ): Promise<void> {
    const { tenderId, responsiblePerson } = configTender;

    try {
      const previous = stateMap.get(tenderId);
      const internalId = await this.resolveInternalId(tenderId, tenderMap);
      const tender = await this.prozorroClient.getTender(internalId);
      const monitorings = await this.monitoringClient.getMonitorings(tender.tenderID ?? tenderId);
      const actualTenderId = tender.tenderID ?? tender.id ?? tenderId;
      const shouldSkipDeepDiff = previous?.dateModified && tender.dateModified === previous.dateModified;
      const result = shouldSkipDeepDiff
        ? diffMonitoringsOnly(actualTenderId, monitorings, previous, responsiblePerson)
        : diffTender(tender, monitorings, previous, responsiblePerson);

      result.snapshot.responsiblePerson = responsiblePerson;
      stateMap.set(tenderId, result.snapshot);

      const risk = calculateRisk(result.events, result.snapshot);
      await this.sheetsService.upsertTenderSummary({
        tender,
        monitorings,
        responsiblePerson,
        riskLevel: risk.riskLevel,
        needsAction: risk.needsAction
      });

      const eventsWithNotificationState = [];
      for (const event of result.events) {
        const notified = await this.notifyIfImportant(event, tender);
        eventsWithNotificationState.push({ ...event, notified });
      }

      await this.sheetsService.appendEvents(eventsWithNotificationState);
      logger.info("Tender processed", { tenderId, events: result.events.length, risk: risk.riskLevel });
    } catch (error) {
      logger.error("Tender processing failed", { tenderId, error: error instanceof Error ? error.message : error });
    }
  }

  private async resolveInternalId(tenderId: string, tenderMap: Map<string, TenderMapEntry>): Promise<string> {
    if (/^[a-f0-9]{32}$/i.test(tenderId)) {
      return tenderId;
    }

    const cached = tenderMap.get(tenderId);
    if (cached?.internalId) {
      return cached.internalId;
    }

    const internalId = await this.portalTenderResolverClient.resolveInternalId(tenderId);
    tenderMap.set(tenderId, {
      tenderId,
      internalId,
      resolvedAt: new Date().toISOString(),
      source: "prozorro.gov.ua/api/tenders/{tenderID}/summary"
    });
    logger.info("Resolved public tenderID to internal Prozorro id", { tenderId });
    return internalId;
  }

  private async notifyIfImportant(event: TenderEvent, tender: Awaited<ReturnType<ProzorroClient["getTender"]>>): Promise<boolean> {
    try {
      await this.telegramClient.sendEvent(event, tender);
      return true;
    } catch (error) {
      logger.error("Telegram notification failed", {
        tenderId: event.tenderId,
        eventType: event.eventType,
        error: error instanceof Error ? error.message : error
      });
      return false;
    }
  }
}

function calculateRisk(events: TenderEvent[], snapshot: TenderSnapshot): { riskLevel: string; needsAction: boolean } {
  const activeProblem = Object.values(snapshot.complaints).some((item) => item.status && !isTerminal(item.status));
  const activeMonitoring = Object.values(snapshot.monitorings).some((item) => item.status && !isTerminal(item.status));
  const hasCritical = events.some((event) => event.severity === "critical") || activeProblem || activeMonitoring;
  const hasWarning = events.some((event) => event.severity === "warning");
  const needsAction = events.some((event) => event.needsAction) || activeProblem || activeMonitoring;

  if (hasCritical) {
    return { riskLevel: "critical", needsAction };
  }

  if (hasWarning) {
    return { riskLevel: "warning", needsAction };
  }

  return { riskLevel: "normal", needsAction: false };
}

function isTerminal(status: string): boolean {
  return ["resolved", "declined", "invalid", "cancelled", "closed", "complete", "completed", "stopped"].includes(status);
}
