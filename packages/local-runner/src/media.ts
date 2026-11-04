import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ArtifactRef, GraphNode } from '@znith/contracts';
import { ComfyUIClient, injectWorkflowTokens } from '@znith/providers';
import { exportFilm } from '@znith/media-engine';
import { synthesizePiper } from '@znith/media-engine/piper';
import { secureArtifactPath } from './index';

type Inputs = Record<string, unknown>;
interface MediaContext {
  node: GraphNode;
  inputs: Inputs;
  runId: string;
  projectRoot: string;
  signal: AbortSignal;
}
const asRecord=(x:unknown):Record<string,unknown>=>x&&typeof x==='object'&&!Array.isArray(x)?x as Record<string,unknown>:{};
const list=(x:unknown):unknown[]=>Array.isArray(x)?x:x===undefined?[]:[x];
function formatShot(shot:unknown,index:number):{name:string;prompt:string;index:number}{
  const data=asRecord(shot);
  return {name:String(data.id??'shot-'+index).replace(/[^a-zA-Z0-9_-]/g,'_'),prompt:String(data.imagePrompt??data.videoPrompt??data.description??asRecord(data.metadata).prompt??''),index:Number(data.index??asRecord(data.metadata).shotIndex??index)};
}
async function saveMedia(root:string,runId:string,nodeId:string,name:string,bytes:Uint8Array,type:'image'|'video',index:number):Promise<ArtifactRef>{
  const ext=type==='image'?'png':'mp4';
  const relativePath='artifacts/'+runId+'/'+nodeId.replace(/[^a-zA-Z0-9_-]/g,'_')+'/'+name+'-'+randomUUID()+'.'+ext;
  const absolute=secureArtifactPath(root,relativePath);
  await mkdir(dirname(absolute),{recursive:true});
  await writeFile(absolute,bytes);
  return {id:randomUUID(),relativePath,type,checksum:createHash('sha256').update(bytes).digest('hex'),metadata:{shotIndex:index,generated:true}};
}
/** Generates real media through the user-supplied, model-specific ComfyUI API graph. */
export async function runComfyMedia(ctx:MediaContext):Promise<ArtifactRef[]> {
  if(ctx.node.type!=='media.image-generate'&&ctx.node.type!=='media.video-generate')throw new Error('Unsupported ComfyUI node');
  const templateString=ctx.node.config.workflowJSON;
  if(typeof templateString!=='string'||!templateString.trim())throw new Error('Paste your ComfyUI API workflow JSON in the node Inspector');
  const template:unknown=JSON.parse(templateString);
  const client=new ComfyUIClient(String(ctx.node.config.endpoint??'http://127.0.0.1:8188'));
  const isVideo=ctx.node.type==='media.video-generate';
  const promptInput=asRecord(ctx.inputs.prompt);
  const references=list(ctx.inputs.reference);
  const tasks=isVideo?list(ctx.inputs.image):list(asRecord(ctx.inputs.task).tasks).length?list(asRecord(ctx.inputs.task).tasks):references.length?references:[promptInput];
  if(tasks.length===0)throw new Error('No shot tasks or source images provided');
  const artifacts:ArtifactRef[]=[];
  for(let index=0;index<tasks.length;index++){
    if(ctx.signal.aborted)throw new Error('Generation aborted');
    const info=formatShot(tasks[index],index);
    if(!info.prompt)info.prompt=String(promptInput.prompt??ctx.node.config.prompt??'');
    let imageName='';
    const sourceImage=asRecord(tasks[index]);
    if((isVideo||references.length>0)&&typeof sourceImage.relativePath==='string'){
      const extension=sourceImage.relativePath.split('.').at(-1)?.toLowerCase()??'png';
      imageName=await client.uploadImage(new Uint8Array(await readFile(secureArtifactPath(ctx.projectRoot,sourceImage.relativePath))),'znith-shot-'+index+'.'+extension,ctx.signal);
    }
    const expanded=injectWorkflowTokens(template,{
      '$ZNITH_PROMPT':info.prompt,
      '$ZNITH_INPUT_IMAGE':imageName,
      '$ZNITH_NEGATIVE_PROMPT':String(ctx.node.config.negativePrompt??''),
    });
    if(!expanded||typeof expanded!=='object'||Array.isArray(expanded))throw new Error('ComfyUI API graph must be a JSON object');
    const promptId=await client.submit(expanded as Record<string,unknown>,ctx.signal);
    const files=await client.waitForOutputs(promptId,ctx.signal);
    const file=files.find(x=>isVideo?/\.mp4$/i.test(x.filename):/\.png$/i.test(x.filename));
    if(!file)throw new Error('ComfyUI completed but produced no compatible '+(isVideo?'video':'image')+' file');
    const bytes=await client.download(file,ctx.signal);
    const output=await saveMedia(ctx.projectRoot,ctx.runId,ctx.node.id,info.name,bytes,isVideo?'video':'image',info.index);
    output.metadata.promptId=promptId;
    output.metadata.prompt=info.prompt;
    artifacts.push(output);
  }
  return artifacts;
}
/** Collects physical clips in order; does not fabricate output files. */
export function collectClipManifest(inputs:Inputs):Record<string,unknown>{
  const clips=list(inputs.video).map(asRecord).filter(x=>typeof x.relativePath==='string');
  if(!clips.length)throw new Error('No real video artifacts to collect');
  clips.sort((a,b)=>Number(asRecord(a.metadata).shotIndex??0)-Number(asRecord(b.metadata).shotIndex??0));
  return {clips,generated:true};
}
export async function exportLocalFilm(ctx:MediaContext):Promise<ArtifactRef>{
  const manifest=asRecord(ctx.inputs.clips);
  const clips=list(manifest.clips).map(asRecord);
  if(!clips.length)throw new Error('No physical video clips available to export');
  const filenames=clips.map(clip=>secureArtifactPath(ctx.projectRoot,String(clip.relativePath)));
  const relativePath='exports/'+ctx.runId+'-'+ctx.node.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'.mp4';
  const absolute=secureArtifactPath(ctx.projectRoot,relativePath);
  const audio=asRecord(ctx.inputs.audio);
  const audioPath=typeof audio.relativePath==='string'?secureArtifactPath(ctx.projectRoot,audio.relativePath):undefined;
  await exportFilm({clips:filenames,output:absolute,audio:audioPath,signal:ctx.signal});
  const bytes=await readFile(absolute);
  return {id:randomUUID(),type:'film',relativePath,checksum:createHash('sha256').update(bytes).digest('hex'),metadata:{clips:clips.length,generated:true}};
}

/** Offline Piper narration; only spoken screenplay dialogue is used as TTS input. */
export async function runPiperAudio(ctx:MediaContext):Promise<ArtifactRef> {
  const script=asRecord(ctx.inputs.script);
  const scenes=list(script.scenes).map(asRecord);
  const text=scenes.map(scene=>String(scene.dialogue??'')).filter(Boolean).join('\n\n');
  const model=String(ctx.node.config.voiceModelPath??'');
  if(!model)throw new Error('Choose a local Piper ONNX voice model path');
  const relativePath='artifacts/'+ctx.runId+'/'+ctx.node.id.replace(/[^a-zA-Z0-9_-]/g,'_')+'/narration.wav';
  const absolute=secureArtifactPath(ctx.projectRoot,relativePath);
  await synthesizePiper({text,modelPath:model,output:absolute,signal:ctx.signal});
  const bytes=await readFile(absolute);
  return {id:randomUUID(),type:'audio',relativePath,checksum:createHash('sha256').update(bytes).digest('hex'),metadata:{generated:true,engine:'piper'}};
}
