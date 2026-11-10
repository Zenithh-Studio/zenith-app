import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE INDEX "owner_createdAt_idx" ON "media" USING btree ("owner_id","created_at");
  CREATE INDEX "owner_updatedAt_idx" ON "workflows" USING btree ("owner_id","updated_at");
  CREATE INDEX "status_updatedAt_idx" ON "executions" USING btree ("status","updated_at");
  CREATE INDEX "owner_updatedAt_1_idx" ON "prompts" USING btree ("owner_id","updated_at");
  CREATE INDEX "owner_updatedAt_2_idx" ON "text_assets" USING btree ("owner_id","updated_at");
  CREATE INDEX "owner_modality_createdAt_idx" ON "studio_generations" USING btree ("owner_id","modality","created_at");
  CREATE INDEX "modality_status_lastPolledAt_idx" ON "studio_generations" USING btree ("modality","status","last_polled_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "owner_createdAt_idx";
  DROP INDEX "owner_updatedAt_idx";
  DROP INDEX "status_updatedAt_idx";
  DROP INDEX "owner_updatedAt_1_idx";
  DROP INDEX "owner_updatedAt_2_idx";
  DROP INDEX "owner_modality_createdAt_idx";
  DROP INDEX "modality_status_lastPolledAt_idx";`)
}
