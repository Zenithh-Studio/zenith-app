import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "signup_attempts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"ip_hash" varchar NOT NULL,
  	"count" numeric DEFAULT 0 NOT NULL,
  	"reset_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "signup_attempts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_signup_attempts_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_ip_hash" varchar NOT NULL,
  	"version_count" numeric DEFAULT 0 NOT NULL,
  	"version_reset_at" timestamp(3) with time zone NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_signup_attempts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "signup_attempts_id" uuid;
  ALTER TABLE "signup_attempts_rels" ADD CONSTRAINT "signup_attempts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."signup_attempts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "signup_attempts_rels" ADD CONSTRAINT "signup_attempts_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "signup_attempts_rels" ADD CONSTRAINT "signup_attempts_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_signup_attempts_v" ADD CONSTRAINT "_signup_attempts_v_parent_id_signup_attempts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."signup_attempts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_signup_attempts_v_rels" ADD CONSTRAINT "_signup_attempts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_signup_attempts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_signup_attempts_v_rels" ADD CONSTRAINT "_signup_attempts_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_signup_attempts_v_rels" ADD CONSTRAINT "_signup_attempts_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "signup_attempts_ip_hash_idx" ON "signup_attempts" USING btree ("ip_hash");
  CREATE INDEX "signup_attempts_updated_at_idx" ON "signup_attempts" USING btree ("updated_at");
  CREATE INDEX "signup_attempts_created_at_idx" ON "signup_attempts" USING btree ("created_at");
  CREATE INDEX "signup_attempts_rels_order_idx" ON "signup_attempts_rels" USING btree ("order");
  CREATE INDEX "signup_attempts_rels_parent_idx" ON "signup_attempts_rels" USING btree ("parent_id");
  CREATE INDEX "signup_attempts_rels_path_idx" ON "signup_attempts_rels" USING btree ("path");
  CREATE INDEX "signup_attempts_rels_admins_id_idx" ON "signup_attempts_rels" USING btree ("admins_id");
  CREATE INDEX "signup_attempts_rels_users_id_idx" ON "signup_attempts_rels" USING btree ("users_id");
  CREATE INDEX "_signup_attempts_v_parent_idx" ON "_signup_attempts_v" USING btree ("parent_id");
  CREATE INDEX "_signup_attempts_v_version_version_ip_hash_idx" ON "_signup_attempts_v" USING btree ("version_ip_hash");
  CREATE INDEX "_signup_attempts_v_version_version_updated_at_idx" ON "_signup_attempts_v" USING btree ("version_updated_at");
  CREATE INDEX "_signup_attempts_v_version_version_created_at_idx" ON "_signup_attempts_v" USING btree ("version_created_at");
  CREATE INDEX "_signup_attempts_v_created_at_idx" ON "_signup_attempts_v" USING btree ("created_at");
  CREATE INDEX "_signup_attempts_v_updated_at_idx" ON "_signup_attempts_v" USING btree ("updated_at");
  CREATE INDEX "_signup_attempts_v_rels_order_idx" ON "_signup_attempts_v_rels" USING btree ("order");
  CREATE INDEX "_signup_attempts_v_rels_parent_idx" ON "_signup_attempts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_signup_attempts_v_rels_path_idx" ON "_signup_attempts_v_rels" USING btree ("path");
  CREATE INDEX "_signup_attempts_v_rels_admins_id_idx" ON "_signup_attempts_v_rels" USING btree ("admins_id");
  CREATE INDEX "_signup_attempts_v_rels_users_id_idx" ON "_signup_attempts_v_rels" USING btree ("users_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_signup_attempts_fk" FOREIGN KEY ("signup_attempts_id") REFERENCES "public"."signup_attempts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_signup_attempts_id_idx" ON "payload_locked_documents_rels" USING btree ("signup_attempts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "signup_attempts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "signup_attempts_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_signup_attempts_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_signup_attempts_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "signup_attempts" CASCADE;
  DROP TABLE "signup_attempts_rels" CASCADE;
  DROP TABLE "_signup_attempts_v" CASCADE;
  DROP TABLE "_signup_attempts_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_signup_attempts_fk";
  
  DROP INDEX "payload_locked_documents_rels_signup_attempts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "signup_attempts_id";`)
}
