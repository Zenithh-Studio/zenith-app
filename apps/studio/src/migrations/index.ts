import * as migration_20261105_031658 from './20261105_031658'
import * as migration_20261105_153854_executions_by_workflow_and_started_at from './20261105_153854_executions_by_workflow_and_started_at'
import * as migration_20261107_131639_big_update_user_data_and_studio from './20261107_131639_big_update_user_data_and_studio'
import * as migration_20261107_161710_signup_attempts_collection from './20261107_161710_signup_attempts_collection'
import * as migration_20261107_162813_executions_workflow_optional from './20261107_162813_executions_workflow_optional'
import * as migration_20261107_165136_execution_retry_links from './20261107_165136_execution_retry_links'

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
]
