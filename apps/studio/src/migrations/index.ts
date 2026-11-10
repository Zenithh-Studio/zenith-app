import * as migration_20261105_031658 from './20261105_031658'
import * as migration_20261105_153854_executions_by_workflow_and_started_at from './20261105_153854_executions_by_workflow_and_started_at'
import * as migration_20261107_131639_big_update_user_data_and_studio from './20261107_131639_big_update_user_data_and_studio'
import * as migration_20261107_161710_signup_attempts_collection from './20261107_161710_signup_attempts_collection'
import * as migration_20261107_162813_executions_workflow_optional from './20261107_162813_executions_workflow_optional'
import * as migration_20261107_165136_execution_retry_links from './20261107_165136_execution_retry_links'
import * as migration_20261109_234410_compact_settings_and_cleanup_versions from './20261109_234410_compact_settings_and_cleanup_versions'
import * as migration_20261110_040305_optimize_query_indexes from './20261110_040305_optimize_query_indexes'

export const migrations = [
  {
    up: migration_20261105_031658.up,
    down: migration_20261105_031658.down,
    name: '20261105_031658',
  },
  {
    up: migration_20261105_153854_executions_by_workflow_and_started_at.up,
    down: migration_20261105_153854_executions_by_workflow_and_started_at.down,
    name: '20261105_153854_executions_by_workflow_and_started_at',
  },
  {
    up: migration_20261107_131639_big_update_user_data_and_studio.up,
    down: migration_20261107_131639_big_update_user_data_and_studio.down,
    name: '20261107_131639_big_update_user_data_and_studio',
  },
  {
    up: migration_20261107_161710_signup_attempts_collection.up,
    down: migration_20261107_161710_signup_attempts_collection.down,
    name: '20261107_161710_signup_attempts_collection',
  },
  {
    up: migration_20261107_162813_executions_workflow_optional.up,
    down: migration_20261107_162813_executions_workflow_optional.down,
    name: '20261107_162813_executions_workflow_optional',
  },
  {
    up: migration_20261107_165136_execution_retry_links.up,
    down: migration_20261107_165136_execution_retry_links.down,
    name: '20261107_165136_execution_retry_links',
  },
  {
    up: migration_20261109_234410_compact_settings_and_cleanup_versions.up,
    down: migration_20261109_234410_compact_settings_and_cleanup_versions.down,
    name: '20261109_234410_compact_settings_and_cleanup_versions',
  },
  {
    up: migration_20261110_040305_optimize_query_indexes.up,
    down: migration_20261110_040305_optimize_query_indexes.down,
    name: '20261110_040305_optimize_query_indexes',
  },
]
