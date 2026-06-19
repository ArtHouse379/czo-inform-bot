import axios, { AxiosInstance } from "axios";
import { logger } from "../utils/logger.js";
import { sleep } from "../utils/sleep.js";
import type { MonitoringResponse, ProzorroMonitoring } from "./tender.types.js";

export class MonitoringClient {
  private readonly http: AxiosInstance;

  constructor(baseUrl: string) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: 30000
    });
  }

  async getMonitorings(tenderId: string): Promise<ProzorroMonitoring[]> {
    try {
      return await this.withRetry(async () => {
        const response = await this.http.get<MonitoringResponse>(
          `/tenders/${encodeURIComponent(tenderId)}/monitorings`
        );
        return normalizeMonitoringResponse(response.data);
      }, `getMonitorings ${tenderId}`);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        logger.warn("Monitoring endpoint returned 404, treating as empty monitorings", { tenderId });
        return [];
      }
      throw error;
    }
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
          break;
        }
        if (attempt === delays.length) {
          break;
        }
        logger.warn("Monitoring API request failed, retrying", { label, attempt: attempt + 1 });
        await sleep(delays[attempt]);
      }
    }

    throw lastError;
  }
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

function normalizeMonitoringResponse(payload: MonitoringResponse): ProzorroMonitoring[] {
  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (payload.data && !Array.isArray(payload.data) && Array.isArray(payload.data.data)) {
    return payload.data.data;
  }

  return [];
}
