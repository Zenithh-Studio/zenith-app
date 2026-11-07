import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "executions" ALTER COLUMN "workflow_id" DROP NOT NULL;
  ALTER TABLE "_executions_v" ALTER COLUMN "version_workflow_id" DROP NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "executions" ALTER COLUMN "workflow_id" SET NOT NULL;
  ALTER TABLE "_executions_v" ALTER COLUMN "version_workflow_id" SET NOT NULL;`)
}
