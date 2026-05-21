import { eq } from "drizzle-orm";
import { db, pool } from "../db/client.js";
import { organizations } from "../db/schema.js";
import { pollOrg } from "../jobs/poll-org.js";
import { logger } from "../lib/logger.js";

async function main() {
  const orgId = process.argv.find((a) => a.startsWith("--org="))?.split("=")[1];
  const orgs = orgId
    ? await db.select().from(organizations).where(eq(organizations.id, orgId))
    : await db.select().from(organizations);

  if (orgs.length === 0) {
    throw new Error("No organizations found. Run npm run seed first.");
  }

  for (const org of orgs) {
    await pollOrg(org.id);
    logger.info({ orgId: org.id }, "poll_now_done");
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
