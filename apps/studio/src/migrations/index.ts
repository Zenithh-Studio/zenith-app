import * as migration_20261105_031658 from './20261105_031658'
import * as migration_20261105_153854_executions_by_workflow_and_started_at from './20261105_153854_executions_by_workflow_and_started_at'

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
]
