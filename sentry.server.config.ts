import * as Sentry from "@sentry/nextjs";
import { vercelAIIntegration } from "@sentry/nextjs";
import type { Client } from "@libsql/client";
import { getClient } from "./lib/db";

function libsqlIntegration(client: Client) {
  return {
    name: "LibsqlIntegration",
    setupOnce() {
      const originalExecute = client.execute.bind(client);
      client.execute = (stmt) => {
        const sql = typeof stmt === "string" ? stmt : stmt.sql;
        return Sentry.startSpan(
          {
            op: "db.query",
            name: sql,
            attributes: {
              "db.system": "sqlite",
              "db.statement": sql,
            },
          },
          async (span) => {
            try {
              const result = await originalExecute(stmt);
              span.setAttribute("db.rows_affected", result.rowsAffected);
              span.setStatus({ code: 1 });
              return result;
            } catch (error) {
              span.setStatus({ code: 2 });
              throw error;
            }
          },
        );
      };
    },
  };
}

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1,
  enableLogs: true,
  sendDefaultPii: true,
  tracePropagationTargets: [/^\//, /\.turso\.io/],
  integrations: [libsqlIntegration(getClient()), vercelAIIntegration({ force: true })],
});
