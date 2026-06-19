import { google, sheets_v4 } from "googleapis";

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
    await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
  }

  async getSheetTitles(): Promise<string[]> {
    const response = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    return response.data.sheets?.map((sheet) => sheet.properties?.title).filter(isString) ?? [];
  }

  async addSheet(title: string): Promise<void> {
    await this.sheets.spreadsheets.batchUpdate({
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
    });
  }

  async getValues(range: string): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range
    });
    return (response.data.values ?? []) as string[][];
  }

  async updateValues(range: string, values: unknown[][]): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: { values }
    });
  }

  async appendValues(range: string, values: unknown[][]): Promise<void> {
    if (values.length === 0) {
      return;
    }

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values }
    });
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
