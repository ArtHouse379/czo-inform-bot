import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import type { ProzorroPortalTenderSummary } from "./tender.types.js";

export class PortalTenderResolverClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: 15000
    });
  }

  async resolveInternalId(tenderId: string): Promise<string> {
    if (/^[a-f0-9]{32}$/i.test(tenderId)) {
      return tenderId;
    }

    if (tenderId.startsWith("UA-P-")) {
      throw new Error(`${tenderId} looks like a procurement plan ID, not a tender ID`);
    }

    if (!tenderId.startsWith("UA-")) {
      throw new Error(`${tenderId} is not a valid public Prozorro tenderID`);
    }

    const summary = await this.withRetry(async () => {
      const response = await this.http.get<ProzorroPortalTenderSummary>(
        `/tenders/${encodeURIComponent(tenderId)}/summary`
      );
      return response.data;
    }, `resolveTenderSummary ${tenderId}`);

    if (!summary.id) {
      throw new Error(`Portal summary for ${tenderId} does not contain internal id`);
    }

    return summary.id;
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
        logger.warn("Prozorro portal resolver request failed, retrying", { label, attempt: attempt + 1 });
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
