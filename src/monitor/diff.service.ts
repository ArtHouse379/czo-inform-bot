import type { ProzorroMonitoring, ProzorroTender } from "../prozorro/tender.types.js";
import type { TenderEvent, TenderEventType } from "./event.types.js";
import { createSnapshot, TenderSnapshot } from "./state.service.js";

export type DiffResult = {
  events: TenderEvent[];
  snapshot: TenderSnapshot;
};

export function diffTender(
  tender: ProzorroTender,
  monitorings: ProzorroMonitoring[],
  previous: TenderSnapshot | undefined,
  responsiblePerson: string
): DiffResult {
  const snapshot = createSnapshot(tender, monitorings, responsiblePerson);
  const detectedAt = new Date().toISOString();
  const tenderId = tender.tenderID ?? tender.id;

  if (!previous) {
    return { events: [], snapshot };
  }

  const events: TenderEvent[] = [];
  const add = (
    eventType: TenderEventType,
    oldValue: string | undefined,
    newValue: string | undefined,
    details: string | undefined,
    severity: TenderEvent["severity"],
    needsAction: boolean
  ) => {
    events.push({
      detectedAt,
      tenderId,
      responsiblePerson,
      eventType,
      oldValue,
      newValue,
      details,
      severity,
      needsAction
    });
  };

  if (previous.status !== snapshot.status) {
    add("STATUS_CHANGED", previous.status, snapshot.status, tender.title, "warning", true);
  }

  for (const [id, document] of Object.entries(snapshot.documents)) {
    const old = previous.documents[id];
    if (!old) {
      add("DOCUMENT_ADDED", undefined, document.title, `Документ: ${document.title ?? id}`, "warning", true);
    } else if (old.dateModified !== document.dateModified) {
      add(
        "DOCUMENT_UPDATED",
        old.dateModified,
        document.dateModified,
        `Документ: ${document.title ?? id}`,
        "warning",
        true
      );
    }
  }

  for (const [id, complaint] of Object.entries(snapshot.complaints)) {
    const old = previous.complaints[id];
    if (!old) {
      add("COMPLAINT_ADDED", undefined, complaint.status, complaint.title ?? id, "critical", true);
    } else if (old.status !== complaint.status) {
      add("COMPLAINT_STATUS_CHANGED", old.status, complaint.status, complaint.title ?? id, "critical", true);
    }
  }

  for (const [id, question] of Object.entries(snapshot.questions)) {
    const old = previous.questions[id];
    if (!old) {
      add("QUESTION_ADDED", undefined, question.title, question.title ?? id, "warning", true);
    } else if (!old.answer && question.answer) {
      add("QUESTION_ANSWERED", undefined, question.answer, question.title ?? id, "info", false);
    }
  }

  for (const [id, qualification] of Object.entries(snapshot.qualifications)) {
    const old = previous.qualifications[id];
    if (!old) {
      add("QUALIFICATION_ADDED", undefined, qualification.status, "Додано нову кваліфікацію учасника", "info", false);
    } else if (old.status !== qualification.status) {
      add(
        "QUALIFICATION_STATUS_CHANGED",
        old.status,
        qualification.status,
        "Змінився статус кваліфікації учасника",
        "warning",
        true
      );
    }
  }

  for (const [id, contract] of Object.entries(snapshot.contracts)) {
    const old = previous.contracts[id];
    if (!old) {
      add("CONTRACT_ADDED", undefined, contract.status, "Додано новий договір", "info", false);
    } else if (old.status !== contract.status) {
      add("CONTRACT_STATUS_CHANGED", old.status, contract.status, "Змінився статус договору", "warning", true);
    }
  }

  diffMonitorings(previous, snapshot, add);

  return { events, snapshot };
}

export function diffMonitoringsOnly(
  tenderId: string,
  monitorings: ProzorroMonitoring[],
  previous: TenderSnapshot | undefined,
  responsiblePerson: string
): DiffResult {
  const snapshot: TenderSnapshot = {
    status: previous?.status,
    dateModified: previous?.dateModified,
    responsiblePerson,
    documents: previous?.documents ?? {},
    complaints: previous?.complaints ?? {},
    questions: previous?.questions ?? {},
    contracts: previous?.contracts ?? {},
    qualifications: previous?.qualifications ?? {},
    monitorings: createSnapshot({ id: tenderId }, monitorings, responsiblePerson).monitorings
  };
  const detectedAt = new Date().toISOString();
  const events: TenderEvent[] = [];

  const add = (
    eventType: TenderEventType,
    oldValue: string | undefined,
    newValue: string | undefined,
    details: string | undefined,
    severity: TenderEvent["severity"],
    needsAction: boolean
  ) => {
    events.push({ detectedAt, tenderId, responsiblePerson, eventType, oldValue, newValue, details, severity, needsAction });
  };

  if (previous) {
    diffMonitorings(previous, snapshot, add);
  }

  return { events, snapshot };
}

function diffMonitorings(
  previous: TenderSnapshot,
  snapshot: TenderSnapshot,
  add: (
    eventType: TenderEventType,
    oldValue: string | undefined,
    newValue: string | undefined,
    details: string | undefined,
    severity: TenderEvent["severity"],
    needsAction: boolean
  ) => void
): void {
  for (const [id, monitoring] of Object.entries(snapshot.monitorings)) {
    const old = previous.monitorings[id];
    if (!old) {
      add(
        "MONITORING_STARTED",
        undefined,
        monitoring.status,
        formatMonitoringDetails("Розпочато моніторинг", monitoring),
        "critical",
        true
      );
      continue;
    }

    if (old.status !== monitoring.status) {
      const closed = isClosedMonitoring(monitoring.status);
      add(
        closed ? "MONITORING_CLOSED" : "MONITORING_STATUS_CHANGED",
        old.status,
        monitoring.status,
        formatMonitoringDetails("Оновлено моніторинг", monitoring),
        closed ? "warning" : "critical",
        !closed
      );
    }

    if (!old.hasConclusion && monitoring.hasConclusion) {
      add(
        "MONITORING_CONCLUSION_ADDED",
        undefined,
        "Висновок опубліковано",
        formatMonitoringDetails("Опубліковано висновок моніторингу", monitoring),
        "critical",
        true
      );
    }
  }
}

function isClosedMonitoring(status: string | undefined): boolean {
  return ["closed", "completed", "stopped", "cancelled", "resolved"].includes(status ?? "");
}

function formatMonitoringDetails(
  prefix: string,
  monitoring: TenderSnapshot["monitorings"][string]
): string {
  const parts = [prefix];

  if (monitoring.monitoringId) {
    parts.push(`Номер моніторингу: ${monitoring.monitoringId}`);
  }

  if (monitoring.status) {
    parts.push(`Статус: ${monitoring.status}`);
  }

  const date = monitoring.datePublished ?? monitoring.dateCreated;
  if (date) {
    parts.push(`Дата: ${date}`);
  }

  return parts.join(". ");
}
