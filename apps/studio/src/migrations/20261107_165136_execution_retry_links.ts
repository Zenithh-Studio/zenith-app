import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "executions" ADD COLUMN "retry_of_id" uuid;
  ALTER TABLE "_executions_v" ADD COLUMN "version_retry_of_id" uuid;
  ALTER TABLE "executions" ADD CONSTRAINT "executions_retry_of_id_executions_id_fk" FOREIGN KEY ("retry_of_id") REFERENCES "public"."executions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_executions_v" ADD CONSTRAINT "_executions_v_version_retry_of_id_executions_id_fk" FOREIGN KEY ("version_retry_of_id") REFERENCES "public"."executions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "executions_retry_of_idx" ON "executions" USING btree ("retry_of_id");
  CREATE INDEX "_executions_v_version_version_retry_of_idx" ON "_executions_v" USING btree ("version_retry_of_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "executions" DROP CONSTRAINT "executions_retry_of_id_executions_id_fk";
  
  ALTER TABLE "_executions_v" DROP CONSTRAINT "_executions_v_version_retry_of_id_executions_id_fk";
  
  DROP INDEX "executions_retry_of_idx";
  DROP INDEX "_executions_v_version_version_retry_of_idx";
  ALTER TABLE "executions" DROP COLUMN "retry_of_id";
  ALTER TABLE "_executions_v" DROP COLUMN "version_retry_of_id";`)
}
