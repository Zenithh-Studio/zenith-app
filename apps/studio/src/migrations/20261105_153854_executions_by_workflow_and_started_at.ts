import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "workflow_startedAt_idx" ON "executions" USING btree ("workflow_id","started_at");
  CREATE INDEX "version_workflow_version_startedAt_idx" ON "_executions_v" USING btree ("version_workflow_id","version_started_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "workflow_startedAt_idx";
  DROP INDEX "version_workflow_version_startedAt_idx";`)
}
