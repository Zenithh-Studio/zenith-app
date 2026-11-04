import { z } from 'zod';

export const artifactTypeSchema = z.enum([
  'story', 'outline', 'script', 'character-bible', 'shot-list',
  'shot-tasks', 'image', 'video', 'clip-collection', 'audio', 'film',
]);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export const positionSchema = z.object({ x: z.number(), y: z.number() });
export const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: positionSchema,
  config: z.record(z.string(), z.unknown()),
  runtime: z.enum(['local', 'cloud', 'auto']).default('local'),
});
export const edgeSchema = z.object({
  id: z.string().min(1), source: z.string().min(1), sourceHandle: z.string().min(1),
  target: z.string().min(1), targetHandle: z.string().min(1),
});
export const graphSchema = z.object({
  schemaVersion: z.literal(2),
  nodes: z.array(nodeSchema),
  edges: z.array(edgeSchema),
});
export type WorkflowGraph = z.infer<typeof graphSchema>;
export type GraphNode = WorkflowGraph['nodes'][number];
export type GraphEdge = WorkflowGraph['edges'][number];
export interface PortDefinition {
  id: string;
  type: ArtifactType;
  required: boolean;
  multiple?: boolean;
}
export interface NodeDefinition {
  type: string;
  version: string;
  label: string;
  category: 'input' | 'skill' | 'logic' | 'media';
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  configSchema: z.ZodTypeAny;
  executorId: string;
  cacheable: boolean;
}
export const runStatusSchema = z.enum([
  'PENDING', 'READY', 'RUNNING', 'WAITING_APPROVAL',
  'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED',
]);
export type RunStatus = z.infer<typeof runStatusSchema>;
export interface ArtifactRef {
  id: string;
  type: ArtifactType;
  relativePath: string;
  checksum: string;
  metadata: Record<string, unknown>;
}
export interface MediaPreview { dataUrl: string; mimeType: string }
export interface ProjectSummary {
  id: string;
  name: string;
  rootPath: string;
  workflowId: string;
  createdAt: number;
}
export interface ProjectData {
  project: ProjectSummary;
  workflowName: string;
  graph: WorkflowGraph;
  revision: number;
}
export interface WorkflowSummary {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  revision: number;
  updatedAt: number;
  nodeCount: number;
  lastRunId: string | null;
  lastRunStatus: RunStatus | null;
  lastRunAt: number | null;
}
export interface ValidationResult { valid: boolean; errors: string[] }
export interface NodeRunSnapshot {
  id: string;
  nodeId: string;
  status: RunStatus;
  attempt: number;
  error: string | null;
  outputRefs: ArtifactRef[];
}
export interface RunSnapshot {
  id: string;
  workflowId: string;
  status: RunStatus;
  createdAt: number;
  nodes: NodeRunSnapshot[];
}
export interface RunEvent {
  runId: string;
  kind: 'run-updated' | 'node-updated';
  timestamp: number;
}
export interface ZnithAPI {
  files: { pickImage():Promise<string|null> };
  projects: {
    list(): Promise<ProjectSummary[]>;
    create(name: string): Promise<ProjectData>;
    open(id: string): Promise<ProjectData>;
  };
  workflows: {
    list(): Promise<WorkflowSummary[]>;
    open(id: string): Promise<ProjectData>;
    create(projectId: string, name: string): Promise<ProjectData>;
    rename(id: string, name: string): Promise<void>;
    duplicate(id: string, name: string): Promise<ProjectData>;
    delete(id: string): Promise<void>;
    save(id: string, graph: WorkflowGraph, expectedRevision: number): Promise<number>;
    validate(graph: WorkflowGraph): Promise<ValidationResult>;
  };
  runs: {
    start(id: string, nodeId?:string): Promise<string>;
    latest(workflowId: string): Promise<string | null>;
    get(id: string): Promise<RunSnapshot>;
    cancel(id: string): Promise<void>;
    retryNode(id: string): Promise<void>;
    approveNode(id: string, approved: boolean): Promise<void>;
    subscribe(id: string, callback: (event: RunEvent) => void): () => void;
  };
  artifacts: { readText(id: string): Promise<string>; preview(id:string):Promise<MediaPreview>; reveal(id:string): Promise<void> };
}
