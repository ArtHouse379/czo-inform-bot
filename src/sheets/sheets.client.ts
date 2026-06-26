import { google, sheets_v4 } from "googleapis";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";

const retryDelaysMs = [1000, 3000, 7000, 15000, 30000, 60000, 90000];
const retryableNetworkMessages = [
  "premature close",
  "invalid response body",
  "fetch failed",
  "econnreset",
  "etimedout",
  "enotfound",
  "eai_again",
  "econnrefused",
  "econnaborted",
  "socket hang up",
  "und_err_socket"
];
const retryableNetworkCodes = [
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ECONNABORTED",
  "UND_ERR_SOCKET"
];

export class SheetsClient {
  private readonly spreadsheetId: string;
  private readonly sheets: sheets_v4.Sheets;

  constructor(options: { spreadsheetId: string; serviceAccountEmail: string; privateKey: string }) {
    this.spreadsheetId = options.spreadsheetId;
    const auth = new google.auth.JWT({
      email: options.serviceAccountEmail,
      key: options.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    this.sheets = google.sheets({ version: "v4", auth });
  }

  async assertAccess(): Promise<void> {
    await this.withRetry(
      () => this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId }),
      "assertAccess"
    );
  }

  async getSheetTitles(): Promise<string[]> {
    const response = await this.withRetry(
      () => this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId }),
      "getSheetTitles"
    );
    return response.data.sheets?.map((sheet) => sheet.properties?.title).filter(isString) ?? [];
  }

  async addSheet(title: string): Promise<void> {
    await this.withRetry(
      () =>
        this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title }
                }
              }
            ]
          }
        }),
      `addSheet ${title}`
    );
  }

  async getValues(range: string): Promise<string[][]> {
    const response = await this.withRetry(
      () =>
        this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range
        }),
      `getValues ${range}`
    );
    return (response.data.values ?? []) as string[][];
  }

  async updateValues(range: string, values: unknown[][]): Promise<void> {
    await this.withRetry(
      () =>
        this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range,
          valueInputOption: "USER_ENTERED",
          requestBody: { values }
        }),
      `updateValues ${range}`
    );
  }

  async appendValues(range: string, values: unknown[][]): Promise<void> {
    if (values.length === 0) {
      return;
    }

    await this.withRetry(
      () =>
        this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range,
          valueInputOption: "USER_ENTERED",
          insertDataOption: "INSERT_ROWS",
          requestBody: { values }
        }),
      `appendValues ${range}`
    );
  }

  private async withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) || attempt === retryDelaysMs.length) {
          break;
        }

        const delayMs = withJitter(retryDelaysMs[attempt]);
        logger.warn("Google Sheets request failed, retrying", {
          label,
          attempt: attempt + 1,
          nextAttemptInMs: delayMs,
          error: error instanceof Error ? error.message : error
        });
        await sleep(delayMs);
      }
    }

    throw addRequestContext(lastError, label);
  }
}

function withJitter(delayMs: number): number {
  const jitterRatio = 0.2;
  const jitter = delayMs * jitterRatio * Math.random();
  return Math.round(delayMs + jitter);
}

function addRequestContext(error: unknown, label: string): unknown {
  if (error instanceof Error && !error.message.startsWith(`${label}: `)) {
    error.message = `${label}: ${error.message}`;
  }
  return error;
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  const status = getErrorStatus(error);
  if (status) {
    return status === 429 || status >= 500;
  }

  const code = getErrorCode(error);
  if (code && retryableNetworkCodes.includes(code)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return retryableNetworkMessages.some((messagePart) => message.includes(messagePart));
}

function getErrorStatus(error: Error): number | undefined {
  if (!("response" in error) || typeof error.response !== "object" || error.response === null) {
    return undefined;
  }

  const response = error.response as { status?: unknown };
  return typeof response.status === "number" ? response.status : undefined;
}

function getErrorCode(error: Error): string | undefined {
  if (!("code" in error)) {
    return undefined;
  }

  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
