import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import type { ProzorroTender, ProzorroTenderResponse } from "./tender.types.js";

export class ProzorroClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: 30000
    });
  }

  async getTender(internalId: string): Promise<ProzorroTender> {
    return this.withRetry(async () => {
      const response = await this.http.get<ProzorroTenderResponse>(`/tenders/${encodeURIComponent(internalId)}`);
      return response.data.data;
    }, `getTender ${internalId}`);
  }

  private async withRetry<T>(operation: () => Promise<T>, label: string): Promise<T> {
    const delays = [1000, 3000, 7000];
    let lastError: unknown;

    for (let attempt = 0; attempt <= delays.length; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryableError(error)) {
          throw addRequestContext(error, label);
        }
        if (attempt === delays.length) {
          break;
        }
        logger.warn(`Prozorro request failed, retrying`, { label, attempt: attempt + 1 });
        await sleep(delays[attempt]);
      }
    }

    throw addRequestContext(lastError, label);
  }
}

function addRequestContext(error: unknown, label: string): unknown {
  if (error instanceof Error) {
    error.message = `${label}: ${error.message}`;
  }
  return error;
}

function isRetryableError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  if (!status) {
    return true;
  }

  return status === 429 || status >= 500;
}
