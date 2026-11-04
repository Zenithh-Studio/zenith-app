import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { and, eq, desc } from 'drizzle-orm';
import { makeDemoGraph } from '@znith/node-registry';
import type { ArtifactRef, ProjectData, ProjectSummary, RunSnapshot, RunStatus, WorkflowGraph } from '@znith/contracts';
import { projects, workflows, workflowRuns, nodeRuns, artifacts } from './schema';

export class ZnithDatabase {
  readonly sqlite: Database.Database;
  readonly db: ReturnType<typeof drizzle>;
  constructor(readonly databaseFile: string, readonly projectsRoot: string) {
    mkdirSync(resolve(databaseFile, '..'), { recursive: true });
    mkdirSync(projectsRoot, { recursive: true });
    this.sqlite = new Database(databaseFile);
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');
    this.sqlite.pragma('busy_timeout = 5000');
    // Versioned bootstrap migration for v0.2. Never destructively recreate existing tables.
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS workflows(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), name TEXT NOT NULL, graph TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS workflow_runs(id TEXT PRIMARY KEY, workflow_id TEXT NOT NULL REFERENCES workflows(id), graph_snapshot TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, completed_at INTEGER);
      CREATE TABLE IF NOT EXISTS node_runs(id TEXT PRIMARY KEY, workflow_run_id TEXT NOT NULL REFERENCES workflow_runs(id), node_id TEXT NOT NULL, status TEXT NOT NULL, attempt INTEGER NOT NULL DEFAULT 0, error TEXT, input_refs TEXT, output_refs TEXT, updated_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS node_runs_by_node ON node_runs(workflow_run_id, node_id);
      CREATE INDEX IF NOT EXISTS node_runs_status ON node_runs(status);
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), type TEXT NOT NULL, relative_path TEXT NOT NULL, checksum TEXT NOT NULL, metadata TEXT NOT NULL, producer_node_run_id TEXT, created_at INTEGER NOT NULL);
      PRAGMA user_version = 1;
    `);
    this.db = drizzle(this.sqlite);
  }
  close() { this.sqlite.close(); }
  listProjects(): ProjectSummary[] {
    const rows = this.db.select().from(projects).orderBy(desc(projects.createdAt)).all();
    return rows.map(row=>{
      const w = this.db.select().from(workflows).where(eq(workflows.projectId,row.id)).get();
      return {id:row.id,name:row.name,rootPath:row.rootPath,workflowId:w?.id??'',createdAt:row.createdAt};
    });
  }
  createProject(name: string): ProjectData {
    const safeName = name.trim().slice(0, 100);
    if (!safeName) throw new Error('Project name is required');
    const projectId = randomUUID(), workflowId = randomUUID();
    const rootPath = join(this.projectsRoot, `${safeName.replace(/[^\p{L}\p{N}_ -]/gu,'_').replace(/\s+/g,'-').slice(0,40)}-${projectId.slice(0,8)}`);
    mkdirSync(join(rootPath,'artifacts'),{recursive:true});
    mkdirSync(join(rootPath,'exports'),{recursive:true});
    const graph = makeDemoGraph(), now=Date.now();
    this.db.transaction(tx=>{
      tx.insert(projects).values({ id:projectId,name:safeName,rootPath,createdAt:now,updatedAt:now }).run();
      tx.insert(workflows).values({id:workflowId,projectId,name:'Main Film Workflow',graph,revision:1}).run();
    });
    writeFileSync(join(rootPath,'project.znith.json'),JSON.stringify({id:projectId,name:safeName,workflowId},null,2));
    return {project:{id:projectId,name:safeName,rootPath,workflowId,createdAt:now},graph,revision:1};
  }
  ensureDemo(): void { if (this.listProjects().length===0) this.createProject('First Film'); }
  openProject(id: string): ProjectData {
    const project = this.listProjects().find(p=>p.id===id);
    if(!project) throw new Error('Project not found');
    const row = this.db.select().from(workflows).where(eq(workflows.id,project.workflowId)).get();
    if(!row) throw new Error('Workflow not found');
    return { project,graph:row.graph as WorkflowGraph,revision:row.revision };
  }
  findWorkflow(id: string) { return this.db.select().from(workflows).where(eq(workflows.id,id)).get(); }
  saveWorkflow(id:string, graph:WorkflowGraph, revision:number):number {
    const updated=this.db.update(workflows).set({graph, revision:revision+1})
      .where(and(eq(workflows.id,id),eq(workflows.revision,revision))).run();
    if(updated.changes===0) throw new Error('Workflow revision conflict. Reload project before saving.');
    return revision+1;
  }
  createRun(workflowId:string,graph:WorkflowGraph):string {
    const id=randomUUID(),now=Date.now();
    this.db.transaction(tx=>{
      tx.insert(workflowRuns).values({id,workflowId,graphSnapshot:graph,status:'PENDING',createdAt:now}).run();
      for(const node of graph.nodes) tx.insert(nodeRuns).values({id:randomUUID(),workflowRunId:id,nodeId:node.id,status:'PENDING',updatedAt:now,attempt:0}).run();
    });
    return id;
  }
  getRun(id:string):RunSnapshot {
    const run=this.db.select().from(workflowRuns).where(eq(workflowRuns.id,id)).get();
    if(!run) throw new Error('Run not found');
    const nodes=this.db.select().from(nodeRuns).where(eq(nodeRuns.workflowRunId,id)).all();
    return {id:run.id,workflowId:run.workflowId,status:run.status as RunStatus,createdAt:run.createdAt,
      nodes:nodes.map(n=>({id:n.id,nodeId:n.nodeId,status:n.status as RunStatus,attempt:n.attempt,error:n.error,outputRefs:(n.outputRefs??[]) as ArtifactRef[]}))};
  }
  getRunGraph(id:string):WorkflowGraph {
    const row=this.db.select().from(workflowRuns).where(eq(workflowRuns.id,id)).get();
    if(!row) throw new Error('Run not found');
    return row.graphSnapshot as WorkflowGraph;
  }
  getRunRows(id:string) { return this.db.select().from(nodeRuns).where(eq(nodeRuns.workflowRunId,id)).all(); }
  listUnfinishedRuns():string[] {
    return this.db.select().from(workflowRuns).all().filter(r=>['PENDING','READY','RUNNING'].includes(r.status)).map(r=>r.id);
  }
  transitionNode(nodeRunId:string,from:string,to:string):boolean {
    const sql = to === 'RUNNING'
      ? 'UPDATE node_runs SET status=?, updated_at=?, attempt=attempt+1 WHERE id=? AND status=?'
      : 'UPDATE node_runs SET status=?, updated_at=? WHERE id=? AND status=?';
    return this.sqlite.prepare(sql).run(to, Date.now(), nodeRunId, from).changes === 1;
  }
  updateNode(id:string, fields:{status?:string;error?:string|null;outputRefs?:ArtifactRef[];inputRefs?:ArtifactRef[]}):void {
    this.db.update(nodeRuns).set({...fields,updatedAt:Date.now()}).where(eq(nodeRuns.id,id)).run();
  }
  setRunStatus(id:string,status:RunStatus):void {
    this.db.update(workflowRuns).set({status,completedAt:['SUCCEEDED','FAILED','CANCELLED'].includes(status)?Date.now():null}).where(eq(workflowRuns.id,id)).run();
  }
  insertArtifact(projectId:string,nodeRunId:string,artifact:ArtifactRef):void {
    this.db.insert(artifacts).values({id:artifact.id,projectId,type:artifact.type,relativePath:artifact.relativePath,checksum:artifact.checksum,
      metadata:artifact.metadata,producerNodeRunId:nodeRunId,createdAt:Date.now()}).run();
  }
  findArtifact(id:string) { return this.db.select().from(artifacts).where(eq(artifacts.id,id)).get(); }
  projectForRun(runId:string):ProjectSummary {
    const run=this.db.select().from(workflowRuns).where(eq(workflowRuns.id,runId)).get();
    if(!run) throw new Error('Run missing');
    const w=this.findWorkflow(run.workflowId);
    const p=this.listProjects().find(x=>x.id===w?.projectId);
    if(!p) throw new Error('Project missing');
    return p;
  }
}
