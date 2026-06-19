import type { ProzorroMonitoring, ProzorroTender } from "../prozorro/tender.types.js";
import type { TenderEvent } from "../monitor/event.types.js";
import { parseSnapshot, stringifySnapshot, TenderSnapshot } from "../monitor/state.service.js";
import { SheetsClient } from "./sheets.client.js";

export type ConfigTender = {
  tenderId: string;
  responsiblePerson: string;
};

export type TenderMapEntry = {
  tenderId: string;
  internalId: string;
  resolvedAt: string;
  source: string;
};

type Table = {
  headers: string[];
  rows: string[][];
};

const sheets = {
  config: "Config",
  tenders: "Tenders",
  events: "Events",
  state: "State",
  tenderMap: "TenderMap"
};

const tenderHeaders = [
  "tender_id",
  "responsible_person",
  "title",
  "procuring_entity",
  "edrpou",
  "status",
  "date_modified",
  "last_checked_at",
  "documents_count",
  "complaints_count",
  "questions_count",
  "contracts_count",
  "monitoring_status",
  "risk_level",
  "needs_action"
];

const eventHeaders = [
  "detected_at",
  "tender_id",
  "responsible_person",
  "event_type",
  "old_value",
  "new_value",
  "details",
  "notified"
];

const stateHeaders = ["tender_id", "state_json"];
const tenderMapHeaders = ["tender_id", "prozorro_internal_id", "resolved_at", "source"];

export class SheetsService {
  constructor(private readonly client: SheetsClient) {}

  async ensureHeaders(): Promise<void> {
    await this.ensureSheetsExist([sheets.tenders, sheets.events, sheets.state, sheets.tenderMap]);
    await Promise.all([
      this.ensureHeaderRow(sheets.tenders, tenderHeaders),
      this.ensureHeaderRow(sheets.events, eventHeaders),
      this.ensureHeaderRow(sheets.state, stateHeaders),
      this.ensureHeaderRow(sheets.tenderMap, tenderMapHeaders)
    ]);
  }

  async ensureSheetsExist(sheetNames: string[]): Promise<void> {
    const existing = new Set(await this.client.getSheetTitles());
    for (const sheetName of sheetNames) {
      if (!existing.has(sheetName)) {
        await this.client.addSheet(sheetName);
        existing.add(sheetName);
      }
    }
  }

  async getConfigTenders(): Promise<ConfigTender[]> {
    const table = await this.readTable(sheets.config);
    const idIndex = table.headers.indexOf("Ідентифікатор закупівлі");
    const personIndex = table.headers.indexOf("Уповноважена особа");
    const enabledIndex = table.headers.indexOf("enabled");

    if (idIndex < 0) {
      throw new Error('Sheet "Config" must contain column "Ідентифікатор закупівлі"');
    }

    return table.rows
      .map((row) => {
        const tenderId = normalizeCell(row[idIndex]);
        const enabled = enabledIndex >= 0 ? normalizeCell(row[enabledIndex]) : "";
        const responsiblePerson = normalizeCell(row[personIndex]) || "Не вказано";
        return { tenderId, responsiblePerson, enabled };
      })
      .filter((row) => row.tenderId && row.enabled.toUpperCase() !== "FALSE")
      .map(({ tenderId, responsiblePerson }) => ({ tenderId, responsiblePerson }));
  }

  async getStateMap(): Promise<Map<string, TenderSnapshot>> {
    const table = await this.readTable(sheets.state);
    const tenderIndex = table.headers.indexOf("tender_id");
    const stateIndex = table.headers.indexOf("state_json");
    const result = new Map<string, TenderSnapshot>();

    if (tenderIndex < 0 || stateIndex < 0) {
      return result;
    }

    for (const row of table.rows) {
      const tenderId = normalizeCell(row[tenderIndex]);
      const snapshot = parseSnapshot(row[stateIndex]);
      if (tenderId && snapshot) {
        result.set(tenderId, snapshot);
      }
    }

    return result;
  }

  async saveStateMap(stateMap: Map<string, TenderSnapshot>): Promise<void> {
    const rows = [stateHeaders, ...Array.from(stateMap.entries()).map(([id, state]) => [id, stringifySnapshot(state)])];
    await this.client.updateValues(`${sheets.state}!A1:B${rows.length}`, rows);
  }

  async getTenderMap(): Promise<Map<string, TenderMapEntry>> {
    const table = await this.readTable(sheets.tenderMap);
    const tenderIndex = table.headers.indexOf("tender_id");
    const internalIndex = table.headers.indexOf("prozorro_internal_id");
    const resolvedAtIndex = table.headers.indexOf("resolved_at");
    const sourceIndex = table.headers.indexOf("source");
    const result = new Map<string, TenderMapEntry>();

    if (tenderIndex < 0 || internalIndex < 0) {
      return result;
    }

    for (const row of table.rows) {
      const tenderId = normalizeCell(row[tenderIndex]);
      const internalId = normalizeCell(row[internalIndex]);
      if (!tenderId || !internalId) {
        continue;
      }

      result.set(tenderId, {
        tenderId,
        internalId,
        resolvedAt: normalizeCell(row[resolvedAtIndex]) || "",
        source: normalizeCell(row[sourceIndex]) || ""
      });
    }

    return result;
  }

  async saveTenderMap(tenderMap: Map<string, TenderMapEntry>): Promise<void> {
    const rows = [
      tenderMapHeaders,
      ...Array.from(tenderMap.values()).map((entry) => [
        entry.tenderId,
        entry.internalId,
        entry.resolvedAt,
        entry.source
      ])
    ];
    await this.client.updateValues(`${sheets.tenderMap}!A1:D${rows.length}`, rows);
  }

  async upsertTenderSummary(args: {
    tender: ProzorroTender;
    monitorings: ProzorroMonitoring[];
    responsiblePerson: string;
    riskLevel: string;
    needsAction: boolean;
  }): Promise<void> {
    const table = await this.readTable(sheets.tenders);
    const existingRows = table.rows;
    const tenderId = args.tender.tenderID ?? args.tender.id;
    const row = buildTenderRow(args);
    const tenderIndex = table.headers.indexOf("tender_id");
    const foundIndex = existingRows.findIndex((existing) => normalizeCell(existing[tenderIndex]) === tenderId);

    if (foundIndex >= 0) {
      existingRows[foundIndex] = row;
    } else {
      existingRows.push(row);
    }

    await this.client.updateValues(`${sheets.tenders}!A1:O${existingRows.length + 1}`, [tenderHeaders, ...existingRows]);
  }

  async appendEvents(events: Array<TenderEvent & { notified: boolean }>): Promise<void> {
    const rows = events.map((event) => [
      event.detectedAt,
      event.tenderId,
      event.responsiblePerson,
      event.eventType,
      event.oldValue ?? "",
      event.newValue ?? "",
      event.details ?? "",
      event.notified ? "TRUE" : "FALSE"
    ]);

    await this.client.appendValues(`${sheets.events}!A:H`, rows);
  }

  private async ensureHeaderRow(sheetName: string, headers: string[]): Promise<void> {
    const values = await this.client.getValues(`${sheetName}!1:1`);
    if (values.length === 0 || values[0].join("").trim() === "") {
      await this.client.updateValues(`${sheetName}!A1:${columnName(headers.length)}1`, [headers]);
    }
  }

  private async readTable(sheetName: string): Promise<Table> {
    const values = await this.client.getValues(`${sheetName}!A:Z`);
    const headers = (values[0] ?? []).map(normalizeCell);
    return { headers, rows: values.slice(1) };
  }
}

function buildTenderRow(args: {
  tender: ProzorroTender;
  monitorings: ProzorroMonitoring[];
  responsiblePerson: string;
  riskLevel: string;
  needsAction: boolean;
}): string[] {
  const tender = args.tender;
  const monitoringStatus = args.monitorings.map((monitoring) => monitoring.status).filter(Boolean).join(", ");
  return [
    tender.tenderID ?? tender.id,
    args.responsiblePerson,
    tender.title ?? "",
    tender.procuringEntity?.name ?? tender.procuringEntity?.identifier?.legalName ?? "",
    tender.procuringEntity?.identifier?.id ?? "",
    tender.status ?? "",
    tender.dateModified ?? "",
    new Date().toISOString(),
    String(tender.documents?.length ?? 0),
    String(tender.complaints?.length ?? 0),
    String(tender.questions?.length ?? 0),
    String(tender.contracts?.length ?? 0),
    monitoringStatus,
    args.riskLevel,
    args.needsAction ? "TRUE" : "FALSE"
  ];
}

function normalizeCell(value: string | undefined): string {
  return String(value ?? "").trim();
}

function columnName(index: number): string {
  let dividend = index;
  let name = "";
  while (dividend > 0) {
    const modulo = (dividend - 1) % 26;
    name = String.fromCharCode(65 + modulo) + name;
    dividend = Math.floor((dividend - modulo) / 26);
  }
  return name;
}
