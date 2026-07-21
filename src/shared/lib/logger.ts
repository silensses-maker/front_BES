const isDev = import.meta.env.MODE === "development";

export const logger = {
  error(context: string, error: unknown): void {
    if (isDev) {
      console.error(`[${context}]:`, error);
    }
    // TODO: implementar sentry o algo asi
  },
};
