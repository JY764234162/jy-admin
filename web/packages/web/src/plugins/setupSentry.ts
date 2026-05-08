import * as Sentry from "@sentry/react";

export const setupSentry = async () => {
  Sentry.init({
    dsn: "https://54fa66577f312c855d674994ab6e9882@o4511351788994560.ingest.us.sentry.io/4511351790764032",
    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
  });
};
