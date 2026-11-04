import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(), name: text('name').notNull(),
  rootPath: text('root_path').notNull(), createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(()=>projects.id),
  name: text('name').notNull(), graph: text('graph', { mode: 'json' }).notNull(),
  revision: integer('revision').notNull().default(1),
});
export const workflowRuns = sqliteTable('workflow_runs', {
  id: text('id').primaryKey(), workflowId: text('workflow_id').notNull().references(()=>workflows.id),
  graphSnapshot: text('graph_snapshot', { mode: 'json' }).notNull(),
  status: text('status').notNull(), createdAt: integer('created_at').notNull(),
  completedAt: integer('completed_at'),
});
export const nodeRuns = sqliteTable('node_runs', {
  id: text('id').primaryKey(), workflowRunId: text('workflow_run_id').notNull().references(()=>workflowRuns.id),
  nodeId: text('node_id').notNull(), status: text('status').notNull(),
  attempt: integer('attempt').notNull().default(0), error: text('error'),
  inputRefs: text('input_refs', {mode:'json'}), outputRefs: text('output_refs', {mode:'json'}),
  updatedAt: integer('updated_at').notNull(),
}, table=>[uniqueIndex('node_runs_by_node').on(table.workflowRunId,table.nodeId),index('node_runs_status').on(table.status)]);
export const artifacts = sqliteTable('artifacts', {
  id: text('id').primaryKey(), projectId: text('project_id').notNull().references(()=>projects.id),
  type: text('type').notNull(), relativePath: text('relative_path').notNull(),
  checksum: text('checksum').notNull(), metadata: text('metadata', {mode:'json'}).notNull(),
  producerNodeRunId: text('producer_node_run_id'), createdAt: integer('created_at').notNull(),
});
