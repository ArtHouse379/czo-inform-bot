import type { ProzorroMonitoring, ProzorroTender } from "../prozorro/tender.types.js";

export type TenderSnapshot = {
  status?: string;
  dateModified?: string;
  responsiblePerson: string;
  documents: Record<string, { title?: string; dateModified?: string }>;
  complaints: Record<string, { status?: string; title?: string }>;
  questions: Record<string, { title?: string; answer?: string }>;
  contracts: Record<string, { status?: string }>;
  qualifications: Record<string, { status?: string }>;
  monitorings: Record<
    string,
    {
      status?: string;
      hasConclusion: boolean;
      monitoringId?: string;
      dateCreated?: string;
      datePublished?: string;
    }
  >;
};

export function createSnapshot(
  tender: ProzorroTender,
  monitorings: ProzorroMonitoring[],
  responsiblePerson: string
): TenderSnapshot {
  return {
    status: tender.status,
    dateModified: tender.dateModified,
    responsiblePerson,
    documents: Object.fromEntries(
      (tender.documents ?? []).filter(hasId).map((item) => [
        item.id,
        { title: item.title, dateModified: item.dateModified ?? item.datePublished }
      ])
    ),
    complaints: Object.fromEntries(
      (tender.complaints ?? []).filter(hasId).map((item) => [
        item.id,
        { status: item.status, title: item.title }
      ])
    ),
    questions: Object.fromEntries(
      (tender.questions ?? []).filter(hasId).map((item) => [
        item.id,
        { title: item.title, answer: item.answer }
      ])
    ),
    contracts: Object.fromEntries(
      (tender.contracts ?? []).filter(hasId).map((item) => [item.id, { status: item.status }])
    ),
    qualifications: Object.fromEntries(
      (tender.qualifications ?? []).filter(hasId).map((item) => [item.id, { status: item.status }])
    ),
    monitorings: snapshotMonitorings(monitorings)
  };
}

export function parseSnapshot(value: string | undefined): TenderSnapshot | undefined {
  if (!value?.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<TenderSnapshot>;
    return {
      status: parsed.status,
      dateModified: parsed.dateModified,
      responsiblePerson: parsed.responsiblePerson ?? "Не вказано",
      documents: parsed.documents ?? {},
      complaints: parsed.complaints ?? {},
      questions: parsed.questions ?? {},
      contracts: parsed.contracts ?? {},
      qualifications: parsed.qualifications ?? {},
      monitorings: parsed.monitorings ?? {}
    };
  } catch {
    return undefined;
  }
}

export function stringifySnapshot(snapshot: TenderSnapshot): string {
  return JSON.stringify(snapshot);
}

function snapshotMonitorings(monitorings: ProzorroMonitoring[]): TenderSnapshot["monitorings"] {
  return Object.fromEntries(
    monitorings.filter(hasId).map((item) => [
      item.id,
      {
        status: item.status,
        hasConclusion: Boolean(item.conclusion || item.conclusionDate),
        monitoringId: item.monitoring_id ?? item.monitoringID,
        dateCreated: item.dateCreated,
        datePublished: item.datePublished
      }
    ])
  );
}

function hasId<T extends { id?: string }>(value: T): value is T & { id: string } {
  return Boolean(value.id);
}
