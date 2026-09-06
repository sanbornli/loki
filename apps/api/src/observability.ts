import * as Sentry from "@sentry/node";

export interface ObservabilityHandle {
  captureException(error: unknown): void;
  shutdown(): Promise<void>;
}

export function startObservability(options: {
  serviceName: string;
  environment: string;
  sentryDsn?: string;
  release?: string;
}): ObservabilityHandle {
  Sentry.init({
    dsn: options.sentryDsn,
    enabled: Boolean(options.sentryDsn),
    environment: options.environment,
    release: options.release,
    sendDefaultPii: false,
    enableLogs: true,
    tracesSampleRate: options.environment === "production" ? 0.1 : 1,
  });
  Sentry.setTag("service", options.serviceName);

  return {
    captureException(error) {
      Sentry.captureException(error);
    },
    async shutdown() {
      await Sentry.close(2_000);
    },
  };
}
