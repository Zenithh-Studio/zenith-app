# Historical PostgreSQL migration notes

This document describes the retired Payload/PostgreSQL data layer. The current app stores Studio data in browser IndexedDB, excludes these migration files from its active TypeScript build, and does not run them from Docker Compose.

Migration `20261107_131639_big_update_user_data_and_studio` adds the app-user, settings, prompt, text-asset, signup-limit, and Studio-generation tables. It adds nullable owner and provenance fields to existing collections. The `up` migration creates tables and adds columns, constraints, and indexes; it does not delete or rewrite existing records.

Migration `20261107_161710_signup_attempts_collection` adds the persisted signup rate-limit table. Migration `20261107_162813_executions_workflow_optional` makes the execution-to-workflow relationship nullable so deleting a workflow does not delete its execution snapshots. Migration `20261107_165136_execution_retry_links` adds an optional retry-provenance relationship. These changes are additive; none deletes execution rows, snapshots, logs, or node records.

The workflow relationship migration also changes the versions table relationship to nullable. When a workflow is deleted, PostgreSQL sets its execution foreign key to null while keeping the execution's snapshot, node records, and logs. Rolling that migration back can fail if any detached execution exists; preserve the additive schema and roll application code forward in that case. Do not restore the pre-update database after users have created new app data unless a full restore is explicitly intended.

Migration `20261109_234410_compact_settings_and_cleanup_versions` moves user preferences and encrypted provider credentials into the user record, and stores prompt tag arrays as JSONB. It verifies the settings, credentials, and tag backfills before dropping their source tables. It also removes 26 legacy Payload version tables that are not enabled in the current collection configuration. Execution, workflow, generation, media, and current user records remain intact. This migration is irreversible for Payload version history; take a database backup before deployment, and use that backup if recovery of the removed version history is required.

## Existing records

Records created before owner isolation have a null owner after migration. They remain visible to Payload administrators, while app users cannot see them. A Payload administrator can review each legacy collection and assign the `owner` relationship to the appropriate app account before that user needs access. Do not assign every legacy record to the first account without verifying who should own it.

Collections with ownership include Workflows, Executions, Media/Assets, Folders, Tags, Prompts, Text Assets, Studio Generations, and User Settings. Existing Media relationships remain intact. Assign related workflow, execution, and media records to the same user when they should continue to work together.

## Backup and rollback

Back up the database and uploaded files before applying this migration. Keep the backup outside the repository and verify it can be read. Production rollback should normally roll application code forward while retaining the additive schema. The generated `down` migration removes the newly added tables and columns; do not run it after users have created data in the new collections. In a development environment with no post-migration data, restore the verified pre-migration backup if a full rollback is necessary.

## Applying

Payload applies committed migrations on production startup. For local development, run `payload migrate` after confirming the intended `DATABASE_URL`. Never use `docker compose down -v` as a migration or rollback step.

## Verification record

The execution/auth migrations were applied to the isolated smoke database and the existing development database after a database dump was created. The dump is stored outside the repository at `C:\Users\pc\AppData\Local\Temp\zenith-web-before-big-update-20261107.dump`; `pg_restore --list` read all 737 archive entries. The upload-volume archive at `C:\Users\pc\AppData\Local\Temp\zenith-web-uploads-before-big-update-20261108.tar.gz` was created on 2026-11-08, after the schema migrations had already run; those migrations do not modify uploaded files. `tar -tzf` verified the 3 archive entries. Both backups remain outside source control.

API smoke created two synthetic users, ran a group workflow, deleted workflows with executions, and verified that detached execution rows retained nonempty node-record snapshots. The original development database and its upload volume were not reset.
