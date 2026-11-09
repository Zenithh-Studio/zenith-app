import { MigrateUpArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM "user_settings" AS settings
        LEFT JOIN "users" AS users ON users."id" = settings."owner_id"
        WHERE settings."owner_id" IS NULL OR users."id" IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot consolidate user settings with a missing or invalid owner.';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM "prompts_tags" AS tags
        LEFT JOIN "prompts" AS prompts ON prompts."id" = tags."_parent_id"
        WHERE prompts."id" IS NULL
      ) THEN
        RAISE EXCEPTION 'Cannot consolidate prompt tags with a missing prompt.';
      END IF;
    END $$;

    CREATE TYPE "public"."enum_users_locale" AS ENUM('en', 'vi');

    ALTER TABLE "users" ADD COLUMN "locale" "enum_users_locale" DEFAULT 'en';
    ALTER TABLE "users" ADD COLUMN "model_defaults" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "users" ADD COLUMN "image_preferences" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "users" ADD COLUMN "video_preferences" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "users" ADD COLUMN "audio_preferences" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "users" ADD COLUMN "ui_preferences" jsonb DEFAULT '{}'::jsonb;
    ALTER TABLE "users" ADD COLUMN "provider_credentials" jsonb;
    ALTER TABLE "prompts" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;

    UPDATE "users" AS users
    SET
      "locale" = settings."locale"::text::"public"."enum_users_locale",
      "model_defaults" = settings."model_defaults",
      "image_preferences" = settings."image_preferences",
      "video_preferences" = settings."video_preferences",
      "audio_preferences" = settings."audio_preferences",
      "ui_preferences" = settings."ui_preferences",
      "provider_credentials" = settings."provider_credentials"
    FROM "user_settings" AS settings
    WHERE settings."owner_id" = users."id";

    UPDATE "prompts" AS prompts
    SET "tags" = COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object('id', tags."id", 'tag', tags."tag")
          ORDER BY tags."_order"
        )
        FROM "prompts_tags" AS tags
        WHERE tags."_parent_id" = prompts."id"
      ),
      '[]'::jsonb
    );

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM "user_settings" AS settings
        JOIN "users" AS users ON users."id" = settings."owner_id"
        WHERE users."locale"::text IS DISTINCT FROM settings."locale"::text
          OR users."model_defaults" IS DISTINCT FROM settings."model_defaults"
          OR users."image_preferences" IS DISTINCT FROM settings."image_preferences"
          OR users."video_preferences" IS DISTINCT FROM settings."video_preferences"
          OR users."audio_preferences" IS DISTINCT FROM settings."audio_preferences"
          OR users."ui_preferences" IS DISTINCT FROM settings."ui_preferences"
          OR users."provider_credentials" IS DISTINCT FROM settings."provider_credentials"
      ) THEN
        RAISE EXCEPTION 'User settings verification failed; refusing to drop the source table.';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM "prompts" AS prompts
        WHERE prompts."tags" IS DISTINCT FROM COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object('id', tags."id", 'tag', tags."tag")
              ORDER BY tags."_order"
            )
            FROM "prompts_tags" AS tags
            WHERE tags."_parent_id" = prompts."id"
          ),
          '[]'::jsonb
        )
      ) THEN
        RAISE EXCEPTION 'Prompt tag verification failed; refusing to drop the source table.';
      END IF;
    END $$;

    ALTER TABLE "payload_locked_documents_rels"
      DROP CONSTRAINT "payload_locked_documents_rels_user_settings_fk";
    DROP INDEX "payload_locked_documents_rels_user_settings_id_idx";
    ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_settings_id";

    DROP TABLE
      "_admin_setup_v_rels",
      "_admin_setup_v",
      "_users_v_version_sessions",
      "_users_v_rels",
      "_users_v",
      "_user_settings_v_rels",
      "_user_settings_v",
      "_media_v_rels",
      "_media_v",
      "_signup_attempts_v_rels",
      "_signup_attempts_v",
      "_folders_v_rels",
      "_folders_v",
      "_tags_v_rels",
      "_tags_v",
      "_workflows_v_rels",
      "_workflows_v",
      "_executions_v_rels",
      "_executions_v",
      "_prompts_v_version_tags",
      "_prompts_v_rels",
      "_prompts_v",
      "_text_assets_v_rels",
      "_text_assets_v",
      "_studio_generations_v_rels",
      "_studio_generations_v",
      "user_settings_rels",
      "user_settings",
      "prompts_tags"
    CASCADE;

    DROP TYPE "public"."enum__users_v_version_role";
    DROP TYPE "public"."enum__user_settings_v_version_locale";
    DROP TYPE "public"."enum_user_settings_locale";
    DROP TYPE "public"."enum__media_v_version_source";
    DROP TYPE "public"."enum__workflows_v_version_category";
    DROP TYPE "public"."enum__workflows_v_version_status";
    DROP TYPE "public"."enum__executions_v_version_status";
    DROP TYPE "public"."enum__studio_generations_v_version_modality";
    DROP TYPE "public"."enum__studio_generations_v_version_status";
  `)
}

export async function down(): Promise<void> {
  throw new Error(
    'This migration is irreversible: it deletes Payload version history. Restore the pre-migration database backup to recover that history.',
  )
}
