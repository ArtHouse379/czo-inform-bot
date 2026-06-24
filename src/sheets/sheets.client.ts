import { google, sheets_v4 } from "googleapis";
import { sleep } from "../utils/sleep.js";

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
    const delays = [1000, 3000, 7000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error) || attempt === delays.length) {
          break;
        }

        console.warn("Google Sheets request failed, retrying", {
          label,
          attempt: attempt + 1,
          error: error instanceof Error ? error.message : error
        });
        await sleep(delays[attempt]);
      }
    }

    throw lastError;
  }
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return true;
  }

  const status = getErrorStatus(error);
  if (status) {
    return status === 429 || status >= 500;
  }

  return [
    "Premature close",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "EAI_AGAIN",
    "socket hang up"
  ].some((messagePart) => error.message.includes(messagePart));
}

function getErrorStatus(error: Error): number | undefined {
  if (!("response" in error) || typeof error.response !== "object" || error.response === null) {
    return undefined;
  }

  const response = error.response as { status?: unknown };
  return typeof response.status === "number" ? response.status : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
