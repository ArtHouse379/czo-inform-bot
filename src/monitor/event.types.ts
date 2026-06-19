export const eventTypes = [
  "STATUS_CHANGED",
  "DOCUMENT_ADDED",
  "DOCUMENT_UPDATED",
  "COMPLAINT_ADDED",
  "COMPLAINT_STATUS_CHANGED",
  "QUESTION_ADDED",
  "QUESTION_ANSWERED",
  "QUALIFICATION_ADDED",
  "QUALIFICATION_STATUS_CHANGED",
  "CONTRACT_ADDED",
  "CONTRACT_STATUS_CHANGED",
  "MONITORING_STARTED",
  "MONITORING_STATUS_CHANGED",
  "MONITORING_CONCLUSION_ADDED",
  "MONITORING_CLOSED"
] as const;

export type TenderEventType = (typeof eventTypes)[number];

export type TenderEvent = {
  detectedAt: string;
  tenderId: string;
  responsiblePerson: string;
  eventType: TenderEventType;
  oldValue?: string;
  newValue?: string;
  details?: string;
  severity: "info" | "warning" | "critical";
  needsAction: boolean;
};
