import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('user', 'admin');
  CREATE TYPE "public"."enum__users_v_version_role" AS ENUM('user', 'admin');
  CREATE TYPE "public"."enum_user_settings_locale" AS ENUM('en', 'vi');
  CREATE TYPE "public"."enum__user_settings_v_version_locale" AS ENUM('en', 'vi');
  CREATE TYPE "public"."enum_media_source" AS ENUM('upload', 'workflow', 'studio', 'derived');
  CREATE TYPE "public"."enum__media_v_version_source" AS ENUM('upload', 'workflow', 'studio', 'derived');
  CREATE TYPE "public"."enum_studio_generations_modality" AS ENUM('image', 'video', 'audio');
  CREATE TYPE "public"."enum_studio_generations_status" AS ENUM('queued', 'running', 'pending', 'succeeded', 'failed', 'interrupted', 'cancelled');
  CREATE TYPE "public"."enum__studio_generations_v_version_modality" AS ENUM('image', 'video', 'audio');
  CREATE TYPE "public"."enum__studio_generations_v_version_status" AS ENUM('queued', 'running', 'pending', 'succeeded', 'failed', 'interrupted', 'cancelled');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"name" varchar,
  	"role" "enum_users_role" DEFAULT 'user',
  	"storage_quota_bytes" numeric DEFAULT 5368709120,
  	"storage_used_bytes" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "users_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_users_v_version_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"_uuid" varchar NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "_users_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_name" varchar,
  	"version_role" "enum__users_v_version_role" DEFAULT 'user',
  	"version_storage_quota_bytes" numeric DEFAULT 5368709120,
  	"version_storage_used_bytes" numeric DEFAULT 0,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version_email" varchar NOT NULL,
  	"version_reset_password_token" varchar,
  	"version_reset_password_expiration" timestamp(3) with time zone,
  	"version_salt" varchar,
  	"version_hash" varchar,
  	"version_reset_password_requested_at" timestamp(3) with time zone,
  	"version_login_attempts" numeric DEFAULT 0,
  	"version_lock_until" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_users_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "admin_setup" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"setup_key" varchar NOT NULL,
  	"claimed_by_id" uuid NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "admin_setup_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_admin_setup_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_setup_key" varchar NOT NULL,
  	"version_claimed_by_id" uuid NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_admin_setup_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "user_settings" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"owner_id" uuid,
  	"locale" "enum_user_settings_locale" DEFAULT 'en',
  	"model_defaults" jsonb DEFAULT '{}'::jsonb,
  	"image_preferences" jsonb DEFAULT '{}'::jsonb,
  	"video_preferences" jsonb DEFAULT '{}'::jsonb,
  	"audio_preferences" jsonb DEFAULT '{}'::jsonb,
  	"ui_preferences" jsonb DEFAULT '{}'::jsonb,
  	"provider_credentials" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "user_settings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_user_settings_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_owner_id" uuid,
  	"version_locale" "enum__user_settings_v_version_locale" DEFAULT 'en',
  	"version_model_defaults" jsonb DEFAULT '{}'::jsonb,
  	"version_image_preferences" jsonb DEFAULT '{}'::jsonb,
  	"version_video_preferences" jsonb DEFAULT '{}'::jsonb,
  	"version_audio_preferences" jsonb DEFAULT '{}'::jsonb,
  	"version_ui_preferences" jsonb DEFAULT '{}'::jsonb,
  	"version_provider_credentials" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_user_settings_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "prompts_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar
  );
  
  CREATE TABLE "prompts" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"content" varchar NOT NULL,
  	"category" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "prompts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_prompts_v_version_tags" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"tag" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_prompts_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_owner_id" uuid,
  	"version_title" varchar NOT NULL,
  	"version_description" varchar,
  	"version_content" varchar NOT NULL,
  	"version_category" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_prompts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "text_assets" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"owner_id" uuid,
  	"title" varchar NOT NULL,
  	"content" varchar NOT NULL,
  	"size_bytes" numeric,
  	"source" varchar,
  	"source_id" varchar,
  	"metadata" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "text_assets_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_text_assets_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_owner_id" uuid,
  	"version_title" varchar NOT NULL,
  	"version_content" varchar NOT NULL,
  	"version_size_bytes" numeric,
  	"version_source" varchar,
  	"version_source_id" varchar,
  	"version_metadata" jsonb,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_text_assets_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "studio_generations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"owner_id" uuid,
  	"modality" "enum_studio_generations_modality" NOT NULL,
  	"status" "enum_studio_generations_status" NOT NULL,
  	"prompt" varchar,
  	"provider" varchar NOT NULL,
  	"model" varchar NOT NULL,
  	"input_snapshot" jsonb,
  	"provider_task_id" varchar,
  	"last_polled_at" timestamp(3) with time zone,
  	"retry_of_id" uuid,
  	"error_code" varchar,
  	"error" varchar,
  	"duration_ms" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "studio_generations_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" uuid,
  	"text_assets_id" uuid,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  CREATE TABLE "_studio_generations_v" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"parent_id" uuid,
  	"version_owner_id" uuid,
  	"version_modality" "enum__studio_generations_v_version_modality" NOT NULL,
  	"version_status" "enum__studio_generations_v_version_status" NOT NULL,
  	"version_prompt" varchar,
  	"version_provider" varchar NOT NULL,
  	"version_model" varchar NOT NULL,
  	"version_input_snapshot" jsonb,
  	"version_provider_task_id" varchar,
  	"version_last_polled_at" timestamp(3) with time zone,
  	"version_retry_of_id" uuid,
  	"version_error_code" varchar,
  	"version_error" varchar,
  	"version_duration_ms" numeric,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_studio_generations_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"media_id" uuid,
  	"text_assets_id" uuid,
  	"admins_id" uuid,
  	"users_id" uuid
  );
  
  ALTER TABLE "admins_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "media" ADD COLUMN "owner_id" uuid;
  ALTER TABLE "media" ADD COLUMN "title" varchar;
  ALTER TABLE "media" ADD COLUMN "source" "enum_media_source";
  ALTER TABLE "media" ADD COLUMN "source_workflow_id" uuid;
  ALTER TABLE "media" ADD COLUMN "source_execution_id" uuid;
  ALTER TABLE "media" ADD COLUMN "source_generation_id" uuid;
  ALTER TABLE "media" ADD COLUMN "derived_from_id" uuid;
  ALTER TABLE "media" ADD COLUMN "derived_metadata" jsonb;
  ALTER TABLE "media_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "_media_v" ADD COLUMN "version_owner_id" uuid;
  ALTER TABLE "_media_v" ADD COLUMN "version_title" varchar;
  ALTER TABLE "_media_v" ADD COLUMN "version_source" "enum__media_v_version_source";
  ALTER TABLE "_media_v" ADD COLUMN "version_source_workflow_id" uuid;
  ALTER TABLE "_media_v" ADD COLUMN "version_source_execution_id" uuid;
  ALTER TABLE "_media_v" ADD COLUMN "version_source_generation_id" uuid;
  ALTER TABLE "_media_v" ADD COLUMN "version_derived_from_id" uuid;
  ALTER TABLE "_media_v" ADD COLUMN "version_derived_metadata" jsonb;
  ALTER TABLE "_media_v_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "folders_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "_folders_v_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "tags_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "_tags_v_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "workflows" ADD COLUMN "owner_id" uuid;
  ALTER TABLE "workflows_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "_workflows_v" ADD COLUMN "version_owner_id" uuid;
  ALTER TABLE "_workflows_v_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "executions" ADD COLUMN "owner_id" uuid;
  ALTER TABLE "executions_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "_executions_v" ADD COLUMN "version_owner_id" uuid;
  ALTER TABLE "_executions_v_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "admin_setup_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_settings_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "prompts_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "text_assets_id" uuid;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "studio_generations_id" uuid;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "payload_llm_instructions_rels" ADD COLUMN "users_id" uuid;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "users_rels" ADD CONSTRAINT "users_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v_version_sessions" ADD CONSTRAINT "_users_v_version_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_users_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v" ADD CONSTRAINT "_users_v_parent_id_users_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_users_v_rels" ADD CONSTRAINT "_users_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_users_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v_rels" ADD CONSTRAINT "_users_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_users_v_rels" ADD CONSTRAINT "_users_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admin_setup" ADD CONSTRAINT "admin_setup_claimed_by_id_users_id_fk" FOREIGN KEY ("claimed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "admin_setup_rels" ADD CONSTRAINT "admin_setup_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."admin_setup"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admin_setup_rels" ADD CONSTRAINT "admin_setup_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "admin_setup_rels" ADD CONSTRAINT "admin_setup_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_admin_setup_v" ADD CONSTRAINT "_admin_setup_v_parent_id_admin_setup_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."admin_setup"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_admin_setup_v" ADD CONSTRAINT "_admin_setup_v_version_claimed_by_id_users_id_fk" FOREIGN KEY ("version_claimed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_admin_setup_v_rels" ADD CONSTRAINT "_admin_setup_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_admin_setup_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_admin_setup_v_rels" ADD CONSTRAINT "_admin_setup_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_admin_setup_v_rels" ADD CONSTRAINT "_admin_setup_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "user_settings_rels" ADD CONSTRAINT "user_settings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_settings_rels" ADD CONSTRAINT "user_settings_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "user_settings_rels" ADD CONSTRAINT "user_settings_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_user_settings_v" ADD CONSTRAINT "_user_settings_v_parent_id_user_settings_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."user_settings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_user_settings_v" ADD CONSTRAINT "_user_settings_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_user_settings_v_rels" ADD CONSTRAINT "_user_settings_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_user_settings_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_user_settings_v_rels" ADD CONSTRAINT "_user_settings_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_user_settings_v_rels" ADD CONSTRAINT "_user_settings_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prompts_tags" ADD CONSTRAINT "prompts_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prompts" ADD CONSTRAINT "prompts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prompts_rels" ADD CONSTRAINT "prompts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prompts_rels" ADD CONSTRAINT "prompts_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "prompts_rels" ADD CONSTRAINT "prompts_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_prompts_v_version_tags" ADD CONSTRAINT "_prompts_v_version_tags_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_prompts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_prompts_v" ADD CONSTRAINT "_prompts_v_parent_id_prompts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."prompts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_prompts_v" ADD CONSTRAINT "_prompts_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_prompts_v_rels" ADD CONSTRAINT "_prompts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_prompts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_prompts_v_rels" ADD CONSTRAINT "_prompts_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_prompts_v_rels" ADD CONSTRAINT "_prompts_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "text_assets" ADD CONSTRAINT "text_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "text_assets_rels" ADD CONSTRAINT "text_assets_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."text_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "text_assets_rels" ADD CONSTRAINT "text_assets_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "text_assets_rels" ADD CONSTRAINT "text_assets_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_text_assets_v" ADD CONSTRAINT "_text_assets_v_parent_id_text_assets_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."text_assets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_text_assets_v" ADD CONSTRAINT "_text_assets_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_text_assets_v_rels" ADD CONSTRAINT "_text_assets_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_text_assets_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_text_assets_v_rels" ADD CONSTRAINT "_text_assets_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_text_assets_v_rels" ADD CONSTRAINT "_text_assets_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "studio_generations" ADD CONSTRAINT "studio_generations_retry_of_id_studio_generations_id_fk" FOREIGN KEY ("retry_of_id") REFERENCES "public"."studio_generations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "studio_generations_rels" ADD CONSTRAINT "studio_generations_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."studio_generations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "studio_generations_rels" ADD CONSTRAINT "studio_generations_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "studio_generations_rels" ADD CONSTRAINT "studio_generations_rels_text_assets_fk" FOREIGN KEY ("text_assets_id") REFERENCES "public"."text_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "studio_generations_rels" ADD CONSTRAINT "studio_generations_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "studio_generations_rels" ADD CONSTRAINT "studio_generations_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_studio_generations_v" ADD CONSTRAINT "_studio_generations_v_parent_id_studio_generations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."studio_generations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_studio_generations_v" ADD CONSTRAINT "_studio_generations_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_studio_generations_v" ADD CONSTRAINT "_studio_generations_v_version_retry_of_id_studio_generations_id_fk" FOREIGN KEY ("version_retry_of_id") REFERENCES "public"."studio_generations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_studio_generations_v_rels" ADD CONSTRAINT "_studio_generations_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_studio_generations_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_studio_generations_v_rels" ADD CONSTRAINT "_studio_generations_v_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_studio_generations_v_rels" ADD CONSTRAINT "_studio_generations_v_rels_text_assets_fk" FOREIGN KEY ("text_assets_id") REFERENCES "public"."text_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_studio_generations_v_rels" ADD CONSTRAINT "_studio_generations_v_rels_admins_fk" FOREIGN KEY ("admins_id") REFERENCES "public"."admins"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_studio_generations_v_rels" ADD CONSTRAINT "_studio_generations_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "users_rels_order_idx" ON "users_rels" USING btree ("order");
  CREATE INDEX "users_rels_parent_idx" ON "users_rels" USING btree ("parent_id");
  CREATE INDEX "users_rels_path_idx" ON "users_rels" USING btree ("path");
  CREATE INDEX "users_rels_admins_id_idx" ON "users_rels" USING btree ("admins_id");
  CREATE INDEX "users_rels_users_id_idx" ON "users_rels" USING btree ("users_id");
  CREATE INDEX "_users_v_version_sessions_order_idx" ON "_users_v_version_sessions" USING btree ("_order");
  CREATE INDEX "_users_v_version_sessions_parent_id_idx" ON "_users_v_version_sessions" USING btree ("_parent_id");
  CREATE INDEX "_users_v_parent_idx" ON "_users_v" USING btree ("parent_id");
  CREATE INDEX "_users_v_version_version_updated_at_idx" ON "_users_v" USING btree ("version_updated_at");
  CREATE INDEX "_users_v_version_version_created_at_idx" ON "_users_v" USING btree ("version_created_at");
  CREATE INDEX "_users_v_version_version_email_idx" ON "_users_v" USING btree ("version_email");
  CREATE INDEX "_users_v_created_at_idx" ON "_users_v" USING btree ("created_at");
  CREATE INDEX "_users_v_updated_at_idx" ON "_users_v" USING btree ("updated_at");
  CREATE INDEX "_users_v_rels_order_idx" ON "_users_v_rels" USING btree ("order");
  CREATE INDEX "_users_v_rels_parent_idx" ON "_users_v_rels" USING btree ("parent_id");
  CREATE INDEX "_users_v_rels_path_idx" ON "_users_v_rels" USING btree ("path");
  CREATE INDEX "_users_v_rels_admins_id_idx" ON "_users_v_rels" USING btree ("admins_id");
  CREATE INDEX "_users_v_rels_users_id_idx" ON "_users_v_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "admin_setup_setup_key_idx" ON "admin_setup" USING btree ("setup_key");
  CREATE INDEX "admin_setup_claimed_by_idx" ON "admin_setup" USING btree ("claimed_by_id");
  CREATE INDEX "admin_setup_updated_at_idx" ON "admin_setup" USING btree ("updated_at");
  CREATE INDEX "admin_setup_created_at_idx" ON "admin_setup" USING btree ("created_at");
  CREATE INDEX "admin_setup_rels_order_idx" ON "admin_setup_rels" USING btree ("order");
  CREATE INDEX "admin_setup_rels_parent_idx" ON "admin_setup_rels" USING btree ("parent_id");
  CREATE INDEX "admin_setup_rels_path_idx" ON "admin_setup_rels" USING btree ("path");
  CREATE INDEX "admin_setup_rels_admins_id_idx" ON "admin_setup_rels" USING btree ("admins_id");
  CREATE INDEX "admin_setup_rels_users_id_idx" ON "admin_setup_rels" USING btree ("users_id");
  CREATE INDEX "_admin_setup_v_parent_idx" ON "_admin_setup_v" USING btree ("parent_id");
  CREATE INDEX "_admin_setup_v_version_version_setup_key_idx" ON "_admin_setup_v" USING btree ("version_setup_key");
  CREATE INDEX "_admin_setup_v_version_version_claimed_by_idx" ON "_admin_setup_v" USING btree ("version_claimed_by_id");
  CREATE INDEX "_admin_setup_v_version_version_updated_at_idx" ON "_admin_setup_v" USING btree ("version_updated_at");
  CREATE INDEX "_admin_setup_v_version_version_created_at_idx" ON "_admin_setup_v" USING btree ("version_created_at");
  CREATE INDEX "_admin_setup_v_created_at_idx" ON "_admin_setup_v" USING btree ("created_at");
  CREATE INDEX "_admin_setup_v_updated_at_idx" ON "_admin_setup_v" USING btree ("updated_at");
  CREATE INDEX "_admin_setup_v_rels_order_idx" ON "_admin_setup_v_rels" USING btree ("order");
  CREATE INDEX "_admin_setup_v_rels_parent_idx" ON "_admin_setup_v_rels" USING btree ("parent_id");
  CREATE INDEX "_admin_setup_v_rels_path_idx" ON "_admin_setup_v_rels" USING btree ("path");
  CREATE INDEX "_admin_setup_v_rels_admins_id_idx" ON "_admin_setup_v_rels" USING btree ("admins_id");
  CREATE INDEX "_admin_setup_v_rels_users_id_idx" ON "_admin_setup_v_rels" USING btree ("users_id");
  CREATE UNIQUE INDEX "user_settings_owner_idx" ON "user_settings" USING btree ("owner_id");
  CREATE INDEX "user_settings_updated_at_idx" ON "user_settings" USING btree ("updated_at");
  CREATE INDEX "user_settings_created_at_idx" ON "user_settings" USING btree ("created_at");
  CREATE INDEX "user_settings_rels_order_idx" ON "user_settings_rels" USING btree ("order");
  CREATE INDEX "user_settings_rels_parent_idx" ON "user_settings_rels" USING btree ("parent_id");
  CREATE INDEX "user_settings_rels_path_idx" ON "user_settings_rels" USING btree ("path");
  CREATE INDEX "user_settings_rels_admins_id_idx" ON "user_settings_rels" USING btree ("admins_id");
  CREATE INDEX "user_settings_rels_users_id_idx" ON "user_settings_rels" USING btree ("users_id");
  CREATE INDEX "_user_settings_v_parent_idx" ON "_user_settings_v" USING btree ("parent_id");
  CREATE INDEX "_user_settings_v_version_version_owner_idx" ON "_user_settings_v" USING btree ("version_owner_id");
  CREATE INDEX "_user_settings_v_version_version_updated_at_idx" ON "_user_settings_v" USING btree ("version_updated_at");
  CREATE INDEX "_user_settings_v_version_version_created_at_idx" ON "_user_settings_v" USING btree ("version_created_at");
  CREATE INDEX "_user_settings_v_created_at_idx" ON "_user_settings_v" USING btree ("created_at");
  CREATE INDEX "_user_settings_v_updated_at_idx" ON "_user_settings_v" USING btree ("updated_at");
  CREATE INDEX "_user_settings_v_rels_order_idx" ON "_user_settings_v_rels" USING btree ("order");
  CREATE INDEX "_user_settings_v_rels_parent_idx" ON "_user_settings_v_rels" USING btree ("parent_id");
  CREATE INDEX "_user_settings_v_rels_path_idx" ON "_user_settings_v_rels" USING btree ("path");
  CREATE INDEX "_user_settings_v_rels_admins_id_idx" ON "_user_settings_v_rels" USING btree ("admins_id");
  CREATE INDEX "_user_settings_v_rels_users_id_idx" ON "_user_settings_v_rels" USING btree ("users_id");
  CREATE INDEX "prompts_tags_order_idx" ON "prompts_tags" USING btree ("_order");
  CREATE INDEX "prompts_tags_parent_id_idx" ON "prompts_tags" USING btree ("_parent_id");
  CREATE INDEX "prompts_owner_idx" ON "prompts" USING btree ("owner_id");
  CREATE INDEX "prompts_updated_at_idx" ON "prompts" USING btree ("updated_at");
  CREATE INDEX "prompts_created_at_idx" ON "prompts" USING btree ("created_at");
  CREATE INDEX "prompts_rels_order_idx" ON "prompts_rels" USING btree ("order");
  CREATE INDEX "prompts_rels_parent_idx" ON "prompts_rels" USING btree ("parent_id");
  CREATE INDEX "prompts_rels_path_idx" ON "prompts_rels" USING btree ("path");
  CREATE INDEX "prompts_rels_admins_id_idx" ON "prompts_rels" USING btree ("admins_id");
  CREATE INDEX "prompts_rels_users_id_idx" ON "prompts_rels" USING btree ("users_id");
  CREATE INDEX "_prompts_v_version_tags_order_idx" ON "_prompts_v_version_tags" USING btree ("_order");
  CREATE INDEX "_prompts_v_version_tags_parent_id_idx" ON "_prompts_v_version_tags" USING btree ("_parent_id");
  CREATE INDEX "_prompts_v_parent_idx" ON "_prompts_v" USING btree ("parent_id");
  CREATE INDEX "_prompts_v_version_version_owner_idx" ON "_prompts_v" USING btree ("version_owner_id");
  CREATE INDEX "_prompts_v_version_version_updated_at_idx" ON "_prompts_v" USING btree ("version_updated_at");
  CREATE INDEX "_prompts_v_version_version_created_at_idx" ON "_prompts_v" USING btree ("version_created_at");
  CREATE INDEX "_prompts_v_created_at_idx" ON "_prompts_v" USING btree ("created_at");
  CREATE INDEX "_prompts_v_updated_at_idx" ON "_prompts_v" USING btree ("updated_at");
  CREATE INDEX "_prompts_v_rels_order_idx" ON "_prompts_v_rels" USING btree ("order");
  CREATE INDEX "_prompts_v_rels_parent_idx" ON "_prompts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_prompts_v_rels_path_idx" ON "_prompts_v_rels" USING btree ("path");
  CREATE INDEX "_prompts_v_rels_admins_id_idx" ON "_prompts_v_rels" USING btree ("admins_id");
  CREATE INDEX "_prompts_v_rels_users_id_idx" ON "_prompts_v_rels" USING btree ("users_id");
  CREATE INDEX "text_assets_owner_idx" ON "text_assets" USING btree ("owner_id");
  CREATE INDEX "text_assets_size_bytes_idx" ON "text_assets" USING btree ("size_bytes");
  CREATE INDEX "text_assets_updated_at_idx" ON "text_assets" USING btree ("updated_at");
  CREATE INDEX "text_assets_created_at_idx" ON "text_assets" USING btree ("created_at");
  CREATE INDEX "text_assets_rels_order_idx" ON "text_assets_rels" USING btree ("order");
  CREATE INDEX "text_assets_rels_parent_idx" ON "text_assets_rels" USING btree ("parent_id");
  CREATE INDEX "text_assets_rels_path_idx" ON "text_assets_rels" USING btree ("path");
  CREATE INDEX "text_assets_rels_admins_id_idx" ON "text_assets_rels" USING btree ("admins_id");
  CREATE INDEX "text_assets_rels_users_id_idx" ON "text_assets_rels" USING btree ("users_id");
  CREATE INDEX "_text_assets_v_parent_idx" ON "_text_assets_v" USING btree ("parent_id");
  CREATE INDEX "_text_assets_v_version_version_owner_idx" ON "_text_assets_v" USING btree ("version_owner_id");
  CREATE INDEX "_text_assets_v_version_version_size_bytes_idx" ON "_text_assets_v" USING btree ("version_size_bytes");
  CREATE INDEX "_text_assets_v_version_version_updated_at_idx" ON "_text_assets_v" USING btree ("version_updated_at");
  CREATE INDEX "_text_assets_v_version_version_created_at_idx" ON "_text_assets_v" USING btree ("version_created_at");
  CREATE INDEX "_text_assets_v_created_at_idx" ON "_text_assets_v" USING btree ("created_at");
  CREATE INDEX "_text_assets_v_updated_at_idx" ON "_text_assets_v" USING btree ("updated_at");
  CREATE INDEX "_text_assets_v_rels_order_idx" ON "_text_assets_v_rels" USING btree ("order");
  CREATE INDEX "_text_assets_v_rels_parent_idx" ON "_text_assets_v_rels" USING btree ("parent_id");
  CREATE INDEX "_text_assets_v_rels_path_idx" ON "_text_assets_v_rels" USING btree ("path");
  CREATE INDEX "_text_assets_v_rels_admins_id_idx" ON "_text_assets_v_rels" USING btree ("admins_id");
  CREATE INDEX "_text_assets_v_rels_users_id_idx" ON "_text_assets_v_rels" USING btree ("users_id");
  CREATE INDEX "studio_generations_owner_idx" ON "studio_generations" USING btree ("owner_id");
  CREATE INDEX "studio_generations_retry_of_idx" ON "studio_generations" USING btree ("retry_of_id");
  CREATE INDEX "studio_generations_updated_at_idx" ON "studio_generations" USING btree ("updated_at");
  CREATE INDEX "studio_generations_created_at_idx" ON "studio_generations" USING btree ("created_at");
  CREATE INDEX "studio_generations_rels_order_idx" ON "studio_generations_rels" USING btree ("order");
  CREATE INDEX "studio_generations_rels_parent_idx" ON "studio_generations_rels" USING btree ("parent_id");
  CREATE INDEX "studio_generations_rels_path_idx" ON "studio_generations_rels" USING btree ("path");
  CREATE INDEX "studio_generations_rels_media_id_idx" ON "studio_generations_rels" USING btree ("media_id");
  CREATE INDEX "studio_generations_rels_text_assets_id_idx" ON "studio_generations_rels" USING btree ("text_assets_id");
  CREATE INDEX "studio_generations_rels_admins_id_idx" ON "studio_generations_rels" USING btree ("admins_id");
  CREATE INDEX "studio_generations_rels_users_id_idx" ON "studio_generations_rels" USING btree ("users_id");
  CREATE INDEX "_studio_generations_v_parent_idx" ON "_studio_generations_v" USING btree ("parent_id");
  CREATE INDEX "_studio_generations_v_version_version_owner_idx" ON "_studio_generations_v" USING btree ("version_owner_id");
  CREATE INDEX "_studio_generations_v_version_version_retry_of_idx" ON "_studio_generations_v" USING btree ("version_retry_of_id");
  CREATE INDEX "_studio_generations_v_version_version_updated_at_idx" ON "_studio_generations_v" USING btree ("version_updated_at");
  CREATE INDEX "_studio_generations_v_version_version_created_at_idx" ON "_studio_generations_v" USING btree ("version_created_at");
  CREATE INDEX "_studio_generations_v_created_at_idx" ON "_studio_generations_v" USING btree ("created_at");
  CREATE INDEX "_studio_generations_v_updated_at_idx" ON "_studio_generations_v" USING btree ("updated_at");
  CREATE INDEX "_studio_generations_v_rels_order_idx" ON "_studio_generations_v_rels" USING btree ("order");
  CREATE INDEX "_studio_generations_v_rels_parent_idx" ON "_studio_generations_v_rels" USING btree ("parent_id");
  CREATE INDEX "_studio_generations_v_rels_path_idx" ON "_studio_generations_v_rels" USING btree ("path");
  CREATE INDEX "_studio_generations_v_rels_media_id_idx" ON "_studio_generations_v_rels" USING btree ("media_id");
  CREATE INDEX "_studio_generations_v_rels_text_assets_id_idx" ON "_studio_generations_v_rels" USING btree ("text_assets_id");
  CREATE INDEX "_studio_generations_v_rels_admins_id_idx" ON "_studio_generations_v_rels" USING btree ("admins_id");
  CREATE INDEX "_studio_generations_v_rels_users_id_idx" ON "_studio_generations_v_rels" USING btree ("users_id");
  ALTER TABLE "admins_rels" ADD CONSTRAINT "admins_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_source_workflow_id_workflows_id_fk" FOREIGN KEY ("source_workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_source_execution_id_executions_id_fk" FOREIGN KEY ("source_execution_id") REFERENCES "public"."executions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_source_generation_id_studio_generations_id_fk" FOREIGN KEY ("source_generation_id") REFERENCES "public"."studio_generations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media" ADD CONSTRAINT "media_derived_from_id_media_id_fk" FOREIGN KEY ("derived_from_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "media_rels" ADD CONSTRAINT "media_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_version_source_workflow_id_workflows_id_fk" FOREIGN KEY ("version_source_workflow_id") REFERENCES "public"."workflows"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_version_source_execution_id_executions_id_fk" FOREIGN KEY ("version_source_execution_id") REFERENCES "public"."executions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_version_source_generation_id_studio_generations_id_fk" FOREIGN KEY ("version_source_generation_id") REFERENCES "public"."studio_generations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v" ADD CONSTRAINT "_media_v_version_derived_from_id_media_id_fk" FOREIGN KEY ("version_derived_from_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_media_v_rels" ADD CONSTRAINT "_media_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "folders_rels" ADD CONSTRAINT "folders_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_folders_v_rels" ADD CONSTRAINT "_folders_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tags_rels" ADD CONSTRAINT "tags_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_tags_v_rels" ADD CONSTRAINT "_tags_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "workflows" ADD CONSTRAINT "workflows_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "workflows_rels" ADD CONSTRAINT "workflows_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_workflows_v" ADD CONSTRAINT "_workflows_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_workflows_v_rels" ADD CONSTRAINT "_workflows_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "executions" ADD CONSTRAINT "executions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "executions_rels" ADD CONSTRAINT "executions_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_executions_v" ADD CONSTRAINT "_executions_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_executions_v_rels" ADD CONSTRAINT "_executions_v_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_admin_setup_fk" FOREIGN KEY ("admin_setup_id") REFERENCES "public"."admin_setup"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_settings_fk" FOREIGN KEY ("user_settings_id") REFERENCES "public"."user_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_prompts_fk" FOREIGN KEY ("prompts_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_text_assets_fk" FOREIGN KEY ("text_assets_id") REFERENCES "public"."text_assets"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_studio_generations_fk" FOREIGN KEY ("studio_generations_id") REFERENCES "public"."studio_generations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_llm_instructions_rels" ADD CONSTRAINT "payload_llm_instructions_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "admins_rels_users_id_idx" ON "admins_rels" USING btree ("users_id");
  CREATE INDEX "media_owner_idx" ON "media" USING btree ("owner_id");
  CREATE INDEX "media_source_workflow_idx" ON "media" USING btree ("source_workflow_id");
  CREATE INDEX "media_source_execution_idx" ON "media" USING btree ("source_execution_id");
  CREATE INDEX "media_source_generation_idx" ON "media" USING btree ("source_generation_id");
  CREATE INDEX "media_derived_from_idx" ON "media" USING btree ("derived_from_id");
  CREATE INDEX "media_rels_users_id_idx" ON "media_rels" USING btree ("users_id");
  CREATE INDEX "_media_v_version_version_owner_idx" ON "_media_v" USING btree ("version_owner_id");
  CREATE INDEX "_media_v_version_version_source_workflow_idx" ON "_media_v" USING btree ("version_source_workflow_id");
  CREATE INDEX "_media_v_version_version_source_execution_idx" ON "_media_v" USING btree ("version_source_execution_id");
  CREATE INDEX "_media_v_version_version_source_generation_idx" ON "_media_v" USING btree ("version_source_generation_id");
  CREATE INDEX "_media_v_version_version_derived_from_idx" ON "_media_v" USING btree ("version_derived_from_id");
  CREATE INDEX "_media_v_rels_users_id_idx" ON "_media_v_rels" USING btree ("users_id");
  CREATE INDEX "folders_rels_users_id_idx" ON "folders_rels" USING btree ("users_id");
  CREATE INDEX "_folders_v_rels_users_id_idx" ON "_folders_v_rels" USING btree ("users_id");
  CREATE INDEX "tags_rels_users_id_idx" ON "tags_rels" USING btree ("users_id");
  CREATE INDEX "_tags_v_rels_users_id_idx" ON "_tags_v_rels" USING btree ("users_id");
  CREATE INDEX "workflows_owner_idx" ON "workflows" USING btree ("owner_id");
  CREATE INDEX "workflows_rels_users_id_idx" ON "workflows_rels" USING btree ("users_id");
  CREATE INDEX "_workflows_v_version_version_owner_idx" ON "_workflows_v" USING btree ("version_owner_id");
  CREATE INDEX "_workflows_v_rels_users_id_idx" ON "_workflows_v_rels" USING btree ("users_id");
  CREATE INDEX "executions_owner_idx" ON "executions" USING btree ("owner_id");
  CREATE INDEX "executions_rels_users_id_idx" ON "executions_rels" USING btree ("users_id");
  CREATE INDEX "_executions_v_version_version_owner_idx" ON "_executions_v" USING btree ("version_owner_id");
  CREATE INDEX "_executions_v_rels_users_id_idx" ON "_executions_v_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_admin_setup_id_idx" ON "payload_locked_documents_rels" USING btree ("admin_setup_id");
  CREATE INDEX "payload_locked_documents_rels_user_settings_id_idx" ON "payload_locked_documents_rels" USING btree ("user_settings_id");
  CREATE INDEX "payload_locked_documents_rels_prompts_id_idx" ON "payload_locked_documents_rels" USING btree ("prompts_id");
  CREATE INDEX "payload_locked_documents_rels_text_assets_id_idx" ON "payload_locked_documents_rels" USING btree ("text_assets_id");
  CREATE INDEX "payload_locked_documents_rels_studio_generations_id_idx" ON "payload_locked_documents_rels" USING btree ("studio_generations_id");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_llm_instructions_rels_users_id_idx" ON "payload_llm_instructions_rels" USING btree ("users_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "users_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_users_v_version_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_users_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_users_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "admin_setup" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "admin_setup_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_admin_setup_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_admin_setup_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "user_settings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "user_settings_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_user_settings_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_user_settings_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "prompts_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "prompts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "prompts_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_prompts_v_version_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_prompts_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_prompts_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "text_assets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "text_assets_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_text_assets_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_text_assets_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "studio_generations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "studio_generations_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_studio_generations_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_studio_generations_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "users_rels" CASCADE;
  DROP TABLE "_users_v_version_sessions" CASCADE;
  DROP TABLE "_users_v" CASCADE;
  DROP TABLE "_users_v_rels" CASCADE;
  DROP TABLE "admin_setup" CASCADE;
  DROP TABLE "admin_setup_rels" CASCADE;
  DROP TABLE "_admin_setup_v" CASCADE;
  DROP TABLE "_admin_setup_v_rels" CASCADE;
  DROP TABLE "user_settings" CASCADE;
  DROP TABLE "user_settings_rels" CASCADE;
  DROP TABLE "_user_settings_v" CASCADE;
  DROP TABLE "_user_settings_v_rels" CASCADE;
  DROP TABLE "prompts_tags" CASCADE;
  DROP TABLE "prompts" CASCADE;
  DROP TABLE "prompts_rels" CASCADE;
  DROP TABLE "_prompts_v_version_tags" CASCADE;
  DROP TABLE "_prompts_v" CASCADE;
  DROP TABLE "_prompts_v_rels" CASCADE;
  DROP TABLE "text_assets" CASCADE;
  DROP TABLE "text_assets_rels" CASCADE;
  DROP TABLE "_text_assets_v" CASCADE;
  DROP TABLE "_text_assets_v_rels" CASCADE;
  DROP TABLE "studio_generations" CASCADE;
  DROP TABLE "studio_generations_rels" CASCADE;
  DROP TABLE "_studio_generations_v" CASCADE;
  DROP TABLE "_studio_generations_v_rels" CASCADE;
  ALTER TABLE "admins_rels" DROP CONSTRAINT "admins_rels_users_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_owner_id_users_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_source_workflow_id_workflows_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_source_execution_id_executions_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_source_generation_id_studio_generations_id_fk";
  
  ALTER TABLE "media" DROP CONSTRAINT "media_derived_from_id_media_id_fk";
  
  ALTER TABLE "media_rels" DROP CONSTRAINT "media_rels_users_fk";
  
  ALTER TABLE "_media_v" DROP CONSTRAINT "_media_v_version_owner_id_users_id_fk";
  
  ALTER TABLE "_media_v" DROP CONSTRAINT "_media_v_version_source_workflow_id_workflows_id_fk";
  
  ALTER TABLE "_media_v" DROP CONSTRAINT "_media_v_version_source_execution_id_executions_id_fk";
  
  ALTER TABLE "_media_v" DROP CONSTRAINT "_media_v_version_source_generation_id_studio_generations_id_fk";
  
  ALTER TABLE "_media_v" DROP CONSTRAINT "_media_v_version_derived_from_id_media_id_fk";
  
  ALTER TABLE "_media_v_rels" DROP CONSTRAINT "_media_v_rels_users_fk";
  
  ALTER TABLE "folders_rels" DROP CONSTRAINT "folders_rels_users_fk";
  
  ALTER TABLE "_folders_v_rels" DROP CONSTRAINT "_folders_v_rels_users_fk";
  
  ALTER TABLE "tags_rels" DROP CONSTRAINT "tags_rels_users_fk";
  
  ALTER TABLE "_tags_v_rels" DROP CONSTRAINT "_tags_v_rels_users_fk";
  
  ALTER TABLE "workflows" DROP CONSTRAINT "workflows_owner_id_users_id_fk";
  
  ALTER TABLE "workflows_rels" DROP CONSTRAINT "workflows_rels_users_fk";
  
  ALTER TABLE "_workflows_v" DROP CONSTRAINT "_workflows_v_version_owner_id_users_id_fk";
  
  ALTER TABLE "_workflows_v_rels" DROP CONSTRAINT "_workflows_v_rels_users_fk";
  
  ALTER TABLE "executions" DROP CONSTRAINT "executions_owner_id_users_id_fk";
  
  ALTER TABLE "executions_rels" DROP CONSTRAINT "executions_rels_users_fk";
  
  ALTER TABLE "_executions_v" DROP CONSTRAINT "_executions_v_version_owner_id_users_id_fk";
  
  ALTER TABLE "_executions_v_rels" DROP CONSTRAINT "_executions_v_rels_users_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_users_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_admin_setup_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_settings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_prompts_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_text_assets_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_studio_generations_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_users_fk";
  
  ALTER TABLE "payload_llm_instructions_rels" DROP CONSTRAINT "payload_llm_instructions_rels_users_fk";
  
  DROP INDEX "admins_rels_users_id_idx";
  DROP INDEX "media_owner_idx";
  DROP INDEX "media_source_workflow_idx";
  DROP INDEX "media_source_execution_idx";
  DROP INDEX "media_source_generation_idx";
  DROP INDEX "media_derived_from_idx";
  DROP INDEX "media_rels_users_id_idx";
  DROP INDEX "_media_v_version_version_owner_idx";
  DROP INDEX "_media_v_version_version_source_workflow_idx";
  DROP INDEX "_media_v_version_version_source_execution_idx";
  DROP INDEX "_media_v_version_version_source_generation_idx";
  DROP INDEX "_media_v_version_version_derived_from_idx";
  DROP INDEX "_media_v_rels_users_id_idx";
  DROP INDEX "folders_rels_users_id_idx";
  DROP INDEX "_folders_v_rels_users_id_idx";
  DROP INDEX "tags_rels_users_id_idx";
  DROP INDEX "_tags_v_rels_users_id_idx";
  DROP INDEX "workflows_owner_idx";
  DROP INDEX "workflows_rels_users_id_idx";
  DROP INDEX "_workflows_v_version_version_owner_idx";
  DROP INDEX "_workflows_v_rels_users_id_idx";
  DROP INDEX "executions_owner_idx";
  DROP INDEX "executions_rels_users_id_idx";
  DROP INDEX "_executions_v_version_version_owner_idx";
  DROP INDEX "_executions_v_rels_users_id_idx";
  DROP INDEX "payload_locked_documents_rels_users_id_idx";
  DROP INDEX "payload_locked_documents_rels_admin_setup_id_idx";
  DROP INDEX "payload_locked_documents_rels_user_settings_id_idx";
  DROP INDEX "payload_locked_documents_rels_prompts_id_idx";
  DROP INDEX "payload_locked_documents_rels_text_assets_id_idx";
  DROP INDEX "payload_locked_documents_rels_studio_generations_id_idx";
  DROP INDEX "payload_preferences_rels_users_id_idx";
  DROP INDEX "payload_llm_instructions_rels_users_id_idx";
  ALTER TABLE "admins_rels" DROP COLUMN "users_id";
  ALTER TABLE "media" DROP COLUMN "owner_id";
  ALTER TABLE "media" DROP COLUMN "title";
  ALTER TABLE "media" DROP COLUMN "source";
  ALTER TABLE "media" DROP COLUMN "source_workflow_id";
  ALTER TABLE "media" DROP COLUMN "source_execution_id";
  ALTER TABLE "media" DROP COLUMN "source_generation_id";
  ALTER TABLE "media" DROP COLUMN "derived_from_id";
  ALTER TABLE "media" DROP COLUMN "derived_metadata";
  ALTER TABLE "media_rels" DROP COLUMN "users_id";
  ALTER TABLE "_media_v" DROP COLUMN "version_owner_id";
  ALTER TABLE "_media_v" DROP COLUMN "version_title";
  ALTER TABLE "_media_v" DROP COLUMN "version_source";
  ALTER TABLE "_media_v" DROP COLUMN "version_source_workflow_id";
  ALTER TABLE "_media_v" DROP COLUMN "version_source_execution_id";
  ALTER TABLE "_media_v" DROP COLUMN "version_source_generation_id";
  ALTER TABLE "_media_v" DROP COLUMN "version_derived_from_id";
  ALTER TABLE "_media_v" DROP COLUMN "version_derived_metadata";
  ALTER TABLE "_media_v_rels" DROP COLUMN "users_id";
  ALTER TABLE "folders_rels" DROP COLUMN "users_id";
  ALTER TABLE "_folders_v_rels" DROP COLUMN "users_id";
  ALTER TABLE "tags_rels" DROP COLUMN "users_id";
  ALTER TABLE "_tags_v_rels" DROP COLUMN "users_id";
  ALTER TABLE "workflows" DROP COLUMN "owner_id";
  ALTER TABLE "workflows_rels" DROP COLUMN "users_id";
  ALTER TABLE "_workflows_v" DROP COLUMN "version_owner_id";
  ALTER TABLE "_workflows_v_rels" DROP COLUMN "users_id";
  ALTER TABLE "executions" DROP COLUMN "owner_id";
  ALTER TABLE "executions_rels" DROP COLUMN "users_id";
  ALTER TABLE "_executions_v" DROP COLUMN "version_owner_id";
  ALTER TABLE "_executions_v_rels" DROP COLUMN "users_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "users_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "admin_setup_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "user_settings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "prompts_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "text_assets_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "studio_generations_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "users_id";
  ALTER TABLE "payload_llm_instructions_rels" DROP COLUMN "users_id";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum__users_v_version_role";
  DROP TYPE "public"."enum_user_settings_locale";
  DROP TYPE "public"."enum__user_settings_v_version_locale";
  DROP TYPE "public"."enum_media_source";
  DROP TYPE "public"."enum__media_v_version_source";
  DROP TYPE "public"."enum_studio_generations_modality";
  DROP TYPE "public"."enum_studio_generations_status";
  DROP TYPE "public"."enum__studio_generations_v_version_modality";
  DROP TYPE "public"."enum__studio_generations_v_version_status";`)
}
