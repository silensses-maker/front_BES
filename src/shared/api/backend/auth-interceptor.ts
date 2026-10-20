import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { auth } from "@/shared/api/firebase";
import { logger } from "@/shared/lib/logger";
import { backendClient } from "./client";

// ─── Augment request config to track retry state ──────────────────────────────

interface RetryConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

// ─── Token ────────────────────────────────────────────────────────────────────

/**
 * The signed-in user's Firebase ID token, or null when nobody is signed in. `forceRefresh` after
 * a 401. Also read by the topology worker's client (#128), which makes its requests off axios.
 */
export async function currentIdToken(forceRefresh = false): Promise<string | null> {
  return (await auth.currentUser?.getIdToken(forceRefresh)) ?? null;
}

// ─── Request interceptor — attach Bearer token ────────────────────────────────

backendClient.interceptors.request.use(
  async (config) => {
    const token = await currentIdToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: unknown) => {
    logger.error("auth-interceptor.request", error);
    return Promise.reject(error);
  },
);

// ─── Response interceptor — retry once on 401 with force-refreshed token ──────

backendClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetryConfig | undefined;

    if (error.response?.status === 401 && config && !config._retried) {
      config._retried = true;

      try {
        const freshToken = await currentIdToken(true);
        if (freshToken) {
          config.headers.Authorization = `Bearer ${freshToken}`;
        }
        return await backendClient(config);
      } catch (retryError) {
        logger.error("auth-interceptor.retry", retryError);
        return Promise.reject(retryError);
      }
    }

    return Promise.reject(error);
  },
);
