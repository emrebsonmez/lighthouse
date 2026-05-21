import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pinoHttp } from "pino-http";
import * as Sentry from "@sentry/node";
import { env } from "./config/env.js";
import { healthRouter } from "./routes/health.js";
import { twilioWebhookRouter } from "./routes/webhooks/twilio.js";
import { subscribeRouter } from "./routes/subscribe.js";
import { debugRouter } from "./routes/debug.js";
import { logger } from "./lib/logger.js";
import { startBoss } from "./jobs/boss.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV });
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  pinoHttp({
    logger,
    autoLogging: {
      ignore: (req) => {
        const path = req.url?.split("?")[0];
        return path === "/api/debug/status" || path === "/health";
      },
    },
  }),
);

app.use(healthRouter);
app.use("/webhooks/twilio", twilioWebhookRouter);
app.use("/api/subscribe", subscribeRouter);
app.use("/api/debug", debugRouter);
app.use(express.static(path.join(__dirname, "../public")));

async function main() {
  await startBoss();
  app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "lighthouse_started");
  });
}

main().catch((err) => {
  logger.error(err, "startup_failed");
  process.exit(1);
});
