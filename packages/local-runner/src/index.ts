import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep, dirname } from 'node:path';
import { EventEmitter } from 'node:events';
import type { ArtifactRef, ArtifactType, GraphNode, RunEvent, RunStatus, WorkflowGraph } from '@znith/contracts';
import { validateGraph } from '@znith/workflow-engine';
import type { ZnithDatabase } from '@znith/database';
import { NODE_REGISTRY } from '@znith/node-registry';
import { OllamaClient, OpenAICompatibleClient } from '@znith/providers';
import { skillForNode, validateSkillOutput } from '@znith/skill-runtime';
import { collectClipManifest, exportLocalFilm, runComfyMedia, runPiperAudio } from './media';
export { collectClipManifest } from './media';

const PAUSE_MS = 180;
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((res, rej)=>{
  if(signal.aborted) return rej(new Error('Cancelled'));
  const timer = setTimeout(()=>{signal.removeEventListener('abort',onAbort);res();},ms);
  const onAbort=()=>{clearTimeout(timer);rej(new Error('Cancelled'));};
  signal.addEventListener('abort',onAbort,{once:true});
});

export class LocalScheduler extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly active = new Map<string, { runId: string; controller: AbortController }>();
  private ticking = false;
  private stopped = false;
  private maxConcurrency = 2;
  constructor(private readonly db: ZnithDatabase) { super(); }
  start(): void {
    this.stopped = false;
    // Only mock executions are safe to replay: no external side effects or paid requests.
    for(const id of this.db.listUnfinishedRuns()) {
      for(const row of this.db.getRunRows(id)) {
        if(row.status==='RUNNING') {
          const node=this.db.getRunGraph(id).nodes.find(n=>n.id===row.nodeId);
          if(!node || (node.config.executionMode && node.config.executionMode!=='mock')) {
            this.db.updateNode(row.id,{status:'FAILED',error:'Interrupted real provider job. Inspect provider state before retrying to avoid duplicate charges or renders.'});
          } else this.db.transitionNode(row.id,'RUNNING','READY');
        }
      }
    }
    if(!this.timer) this.timer=setInterval(()=>void this.tick(),250);
    void this.tick();
  }
  stop(): void {
    this.stopped = true;
    if(this.timer) clearInterval(this.timer);
    this.timer=null;
    for(const job of this.active.values()) job.controller.abort();
  }
  async waitForIdle(timeoutMs = 3000): Promise<void> {
    const until = Date.now() + timeoutMs;
    while (this.active.size > 0 && Date.now() < until) {
      await new Promise<void>(resolve => setTimeout(resolve, 25));
    }
  }
  private emitChange(runId:string,kind:RunEvent['kind']='node-updated') {
    this.emit('change',{runId,kind,timestamp:Date.now()} satisfies RunEvent);
  }
  startRun(workflowId:string):string {
    const wf=this.db.findWorkflow(workflowId);
    if(!wf) throw new Error('Workflow not found');
    const graph=wf.graph as WorkflowGraph;
    const valid=validateGraph(graph);
    if(!valid.valid) throw new Error(valid.errors.join('; '));
    if(graph.nodes.length===0) throw new Error('Cannot run an empty graph');
    const runId=this.db.createRun(workflowId,graph);
    this.emitChange(runId,'run-updated');
    if (this.timer) void this.tick();
    return runId;
  }
  cancelRun(id:string):void {
    const run=this.db.getRun(id);
    if(['SUCCEEDED','FAILED','CANCELLED'].includes(run.status)) return;
    this.db.setRunStatus(id,'CANCELLED');
    for(const job of this.active.values()) if(job.runId===id) job.controller.abort();
    for(const row of this.db.getRunRows(id)) {
      if(['PENDING','READY','WAITING_APPROVAL'].includes(row.status)) this.db.updateNode(row.id,{status:'CANCELLED'});
    }
    this.emitChange(id,'run-updated');
  }
  retryNode(nodeRunId:string):void {
    const row=this.db.sqlite.prepare('SELECT id, workflow_run_id AS runId, status FROM node_runs WHERE id=?')
      .get(nodeRunId) as {id:string;runId:string;status:string}|undefined;
    if(!row || row.status!=='FAILED') throw new Error('Only failed nodes can be retried');
    // For MVP, failed node can be retried while the run snapshot is still unchanged.
    this.db.updateNode(row.id,{status:'PENDING',error:null});
    this.db.setRunStatus(row.runId,'RUNNING');
    this.emitChange(row.runId);
    void this.tick();
  }
  approveNode(nodeRunId:string, approved:boolean):void {
    const row=this.db.sqlite.prepare('SELECT id, workflow_run_id AS runId, node_id AS nodeId, status FROM node_runs WHERE id=?')
      .get(nodeRunId) as {id:string;runId:string;nodeId:string;status:string}|undefined;
    if(!row || row.status!=='WAITING_APPROVAL') throw new Error('Node is not waiting for approval');
    const graph=this.db.getRunGraph(row.runId);
    const node=graph.nodes.find(n=>n.id===row.nodeId);
    if(node?.type!=='logic.approval') throw new Error('Only Approval Gate nodes can be approved');
    if(!approved) {
      this.db.updateNode(row.id,{status:'FAILED',error:'Storyboard rejected by user'});
    } else {
      const upstream=graph.edges.filter(e=>e.target===row.nodeId)
        .flatMap(e=>this.db.getRun(row.runId).nodes.find(n=>n.nodeId===e.source)?.outputRefs??[]);
      if(upstream.length===0) throw new Error('Approval Gate has no storyboard artifact');
      this.db.updateNode(row.id,{status:'SUCCEEDED',outputRefs:upstream,error:null});
    }
    this.db.setRunStatus(row.runId,'RUNNING');
    this.emitChange(row.runId,'run-updated');
    void this.tick();
  }
  private async tick(): Promise<void> {
    if(this.ticking || this.stopped) return;
    this.ticking=true;
    try {
      for(const runId of this.db.listUnfinishedRuns()) {
        if(this.db.getRun(runId).status==='CANCELLED') continue;
        const graph=this.db.getRunGraph(runId);
        const rows=this.db.getRunRows(runId);
        const byNode=new Map(rows.map(r=>[r.nodeId,r]));
        for(const node of graph.nodes) {
          const row=byNode.get(node.id)!;
          if(row.status!=='PENDING') continue;
          const upstream=graph.edges.filter(e=>e.target===node.id).map(e=>byNode.get(e.source)!);
          if(upstream.some(n=>['FAILED','CANCELLED','SKIPPED'].includes(n.status))) {
            this.db.updateNode(row.id,{status:'SKIPPED',error:'An upstream node did not succeed'});
            this.emitChange(runId);
          } else if(upstream.every(n=>n.status==='SUCCEEDED')) {
            if(this.db.transitionNode(row.id,'PENDING','READY')) this.emitChange(runId);
          }
        }
        // Approval gate will wait for explicit approval in Phase 3; do not auto-approve.
        for(const node of graph.nodes) {
          if(this.active.size>=this.maxConcurrency) break;
          const row=byNode.get(node.id)!;
          const latest=this.db.getRunRows(runId).find(n=>n.id===row.id)!;
          if(latest.status!=='READY') continue;
          if(node.type==='logic.approval') {
            if(this.db.transitionNode(row.id,'READY','WAITING_APPROVAL')) this.emitChange(runId);
            continue;
          }
          if(!this.db.transitionNode(row.id,'READY','RUNNING')) continue;
          const controller=new AbortController();
          this.active.set(row.id,{runId,controller});
          this.db.setRunStatus(runId,'RUNNING');
          this.emitChange(runId);
          void this.execute(runId,row.id,node,graph,controller.signal).finally(()=>{
            this.active.delete(row.id);
            void this.tick();
          });
        }
        this.finalize(runId);
      }
    } finally {this.ticking=false;}
  }
  private finalize(runId:string):void {
    const run=this.db.getRun(runId);
    if(run.status==='CANCELLED') return;
    if(run.nodes.length && run.nodes.every(n=>n.status==='SUCCEEDED')) {
      this.db.setRunStatus(runId,'SUCCEEDED');this.emitChange(runId,'run-updated');
    } else if(run.nodes.some(n=>n.status==='FAILED') && run.nodes.every(n=>['SUCCEEDED','FAILED','SKIPPED'].includes(n.status))) {
      this.db.setRunStatus(runId,'FAILED');this.emitChange(runId,'run-updated');
    } else if(run.nodes.some(n=>n.status==='WAITING_APPROVAL') && run.nodes.every(n=>['SUCCEEDED','WAITING_APPROVAL','PENDING'].includes(n.status))) {
      this.db.setRunStatus(runId,'WAITING_APPROVAL');this.emitChange(runId,'run-updated');
    }
  }
  private async execute(runId:string,nodeRunId:string,node:GraphNode,graph:WorkflowGraph,signal:AbortSignal):Promise<void> {
    try {
      if(node.runtime==='cloud' && node.config.executionMode!=='cloud') throw new Error('Explicit cloud executionMode required for remote processing');
      await wait(PAUSE_MS,signal);
      const project=this.db.projectForRun(runId);
      const inputByPort:Record<string, unknown>={};
      const inputRefs:ArtifactRef[]=[];
      for(const edge of graph.edges.filter(e=>e.target===node.id)) {
        const source=this.db.getRun(runId).nodes.find(r=>r.nodeId===edge.source);
        const artifactType=NODE_REGISTRY.get(graph.nodes.find(n=>n.id===edge.source)!.type)?.outputs.find(p=>p.id===edge.sourceHandle)?.type;
        const found=source?.outputRefs.filter(a=>a.type===artifactType)??[];
        if(!found.length) throw new Error(`Missing upstream artifact for ${edge.id}`);
        inputRefs.push(...found);
        const payloads:unknown[]=[];
        for(const artifact of found){
          if(['image','video','audio','film'].includes(artifact.type)) payloads.push(artifact);
          else {
            const raw=await readFile(secureArtifactPath(project.rootPath,artifact.relativePath),'utf8');
            payloads.push(JSON.parse(raw));
          }
        }
        const targetPort=NODE_REGISTRY.get(node.type)?.inputs.find(p=>p.id===edge.targetHandle);
        if(targetPort?.multiple || payloads.length>1) {
          const previous=inputByPort[edge.targetHandle];
          inputByPort[edge.targetHandle]=[...(Array.isArray(previous)?previous:previous===undefined?[]:[previous]),...payloads];
        } else inputByPort[edge.targetHandle]=payloads[0];
      }
      const mode=String(node.config.executionMode??'mock');
      if(node.type==='media.image-reference'){
        const source=String(node.config.sourcePath??'').trim();
        if(!source)throw new Error('Choose a local image file in the node settings');
        const sourceExt=extname(source).toLowerCase();
        if(!['.png','.jpg','.jpeg','.webp'].includes(sourceExt))throw new Error('Reference images must be PNG, JPG, or WebP');
        const bytes=await readFile(resolve(source));
        if(bytes.byteLength>8*1024*1024)throw new Error('Reference image is limited to 8 MiB');
        const rel=`artifacts/${runId}/${node.id.replace(/[^a-zA-Z0-9_-]/g,'_')}/reference${sourceExt}`;
        const path=secureArtifactPath(project.rootPath,rel);
        await mkdir(dirname(path),{recursive:true});await writeFile(path,bytes);
        const artifact:ArtifactRef={id:randomUUID(),type:'image',relativePath:rel,checksum:createHash('sha256').update(bytes).digest('hex'),metadata:{reference:true,sourceName:source.split(/[\\/]/).at(-1)}};
        this.db.insertArtifact(project.id,nodeRunId,artifact);
        this.db.updateNode(nodeRunId,{status:'SUCCEEDED',inputRefs,outputRefs:[artifact],error:null});
        this.emitChange(runId);return;
      }
      if ((mode==='comfyui' && ['media.image-generate','media.video-generate'].includes(node.type)) ||
          (mode==='ffmpeg' && node.type==='media.film-export') ||
          (mode==='piper' && node.type==='media.audio-generate')) {
        const mediaContext={node,inputs:inputByPort,runId,projectRoot:project.rootPath,signal};
        const results=mode==='comfyui' ? await runComfyMedia(mediaContext) : mode==='piper' ? [await runPiperAudio(mediaContext)] : [await exportLocalFilm(mediaContext)];
        if(signal.aborted || this.db.getRun(runId).status==='CANCELLED') {
          this.db.updateNode(nodeRunId,{status:'CANCELLED',error:'Cancelled'});
          return;
        }
        for(const artifact of results)this.db.insertArtifact(project.id,nodeRunId,artifact);
        this.db.updateNode(nodeRunId,{status:'SUCCEEDED',inputRefs,outputRefs:results,error:null});
        this.emitChange(runId);
        return;
      }
            const produced=await executeFilmNode(node,inputByPort,signal);
      const outputPort=NODE_REGISTRY.get(node.type)?.outputs[0];
      if(!outputPort) throw new Error(`Node type ${node.type} is missing its output port`);
      const rel=`artifacts/${runId}/${node.id.replace(/[^a-zA-Z0-9_-]/g,'_')}/${randomUUID()}.json`;
      const output=JSON.stringify(produced,null,2)+'\n';
      const path=secureArtifactPath(project.rootPath,rel);
      await mkdir(dirname(path),{recursive:true});
      const temp=path+'.tmp';
      await writeFile(temp,output,'utf8');
      await rename(temp,path);
      if(signal.aborted || this.db.getRun(runId).status==='CANCELLED') {
        await rm(path,{force:true});
        const status = this.db.getRun(runId).status==='CANCELLED'?'CANCELLED':'READY';
        this.db.updateNode(nodeRunId,{status,error:status==='READY'?'Interrupted by app shutdown':null});
        return;
      }
      const artifact:ArtifactRef={id:randomUUID(),type:outputPort.type,relativePath:rel,
        checksum:createHash('sha256').update(output).digest('hex'),metadata:{mock:node.config.executionMode===undefined || node.config.executionMode==='mock',nodeType:node.type}};
      this.db.insertArtifact(project.id,nodeRunId,artifact);
      this.db.updateNode(nodeRunId,{status:'SUCCEEDED',inputRefs,outputRefs:[artifact],error:null});
      this.emitChange(runId);
    } catch(error) {
      const runCancelled=this.db.getRun(runId).status==='CANCELLED';
      const interrupted=signal.aborted && !runCancelled;
      this.db.updateNode(nodeRunId,{status:interrupted?'READY':runCancelled?'CANCELLED':'FAILED',error:interrupted?'Interrupted by app shutdown':String(error)});
      this.emitChange(runId);
    }
  }
}

export function secureArtifactPath(projectRoot:string,relativePath:string):string {
  if(!relativePath || relativePath.includes('\0')) throw new Error('Invalid artifact path');
  const root=resolve(projectRoot),target=resolve(root,relativePath);
  if(!target.startsWith(root+sep)) throw new Error('Artifact path escapes project root');
  return target;
}
export function mockNode(node:GraphNode,inputs:Record<string,unknown>):unknown {
  const source=(inputs.story ?? inputs.outline ?? inputs.script ?? inputs.shots ?? {}) as Record<string,unknown>;
  switch(node.type) {
    case 'film.story-input':return {title:'Untitled Film',prompt:String(node.config.prompt??''),mock:true};
    case 'film.outline':return {title:'Outline Demo',premise:String(source.prompt??'Unknown'),beats:['Opening','Discovery','Decision','Resolution'],mock:true};
    case 'film.script':return {title:'Script Demo',source,scenes:[
      {scene:1,heading:'EXT. MOON — DUSK',action:'An astronaut walks through pale dust.',dialogue:'There must be something left.'},
      {scene:2,heading:'EXT. CRATER — NIGHT',action:'A tiny flower catches the light.',dialogue:'Life found a way.'},
    ],mock:true};
    case 'film.storyboard':return {title:'Storyboard Demo',shots:[
      {id:'shot-01',index:0,durationSeconds:6,description:'Wide shot: astronaut on lunar horizon',camera:'wide'},
      {id:'shot-02',index:1,durationSeconds:6,description:'Close-up: boot steps into a crater',camera:'close-up'},
      {id:'shot-03',index:2,durationSeconds:7,description:'Reveal: purple flower glows in the dust',camera:'dolly-in'},
      {id:'shot-04',index:3,durationSeconds:6,description:'Astronaut kneels beside the flower',camera:'medium'},
      {id:'shot-05',index:4,durationSeconds:8,description:'Pull-back: a quiet lunar sunrise',camera:'wide'},
    ],script:source,mock:true};
    case 'film.characters':return {characters:[{id:'character-1',name:'Astronaut',description:'Curious explorer'}],mock:true};
    case 'logic.batch-shots':return {tasks:Array.isArray((source as any).shots)?(source as any).shots:[],mock:true};
    default:return {nodeType:node.type,inputs,placeholder:'Mock output only; media is not generated in Phase 1+2',mock:true};
  }
}

/** AI text execution is opt-in; the default stays offline and deterministic. */
export async function executeFilmNode(node: GraphNode, inputs: Record<string,unknown>, signal: AbortSignal): Promise<unknown> {
  const mode=String(node.config.executionMode??'mock');
  if(mode==='mock') {
    if(node.type==='logic.collect-clips' && Array.isArray(inputs.video) && inputs.video.some(x=>x && typeof x==='object' && 'relativePath' in x)) return collectClipManifest(inputs);
    return mockNode(node,inputs);
  }
  const skill=skillForNode(node.type);
  if(!skill) throw new Error(`Node ${node.type} does not yet have a real ${mode} executor; choose mock or configure a supported provider`);
  const model=String(node.config.model??'');
  if(!model) throw new Error('Set the model name in the node Inspector before running AI');
  const output=mode==='ollama'
    ? await new OllamaClient(String(node.config.endpoint??'http://127.0.0.1:11434')).generateJSON(model,skill.instructions,inputs,signal)
    : mode==='cloud'
      ? await new OpenAICompatibleClient(process.env.ZNITH_CLOUD_LLM_API_KEY??'').generateJSON(model,skill.instructions,inputs,signal)
      : null;
  if(!output) throw new Error('Unsupported executionMode: '+mode);
  validateSkillOutput(skill.id,output);
  return output;
}
