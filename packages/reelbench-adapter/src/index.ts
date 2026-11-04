import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface ReelbenchOptions {
  skillsRoot: string;
  signal?: AbortSignal;
}
async function runTool(script: string,args: string[],signal?:AbortSignal):Promise<string> {
  await access(script);
  return new Promise((resolve,reject)=>{
    const processHandle=spawn(process.execPath,[script,...args],{
      cwd:dirname(script),
      env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},
      signal,windowsHide:true,stdio:['ignore','pipe','pipe'],
    });
    let output='',errors='';
    processHandle.stdout.on('data',(buf:Buffer)=>{output+=buf.toString();if(output.length>10_000_000)processHandle.kill();});
    processHandle.stderr.on('data',(buf:Buffer)=>{errors=(errors+buf.toString()).slice(-3000);});
    processHandle.once('error',reject);
    processHandle.once('close',code=>code===0?resolve(output):reject(new Error('Reelbench failed ('+code+'): '+errors)));
  });
}
/**
 * Explicitly invokes the pinned upstream reelbench scripts. This is opt-in;
 * do not run arbitrary scripts from an untrusted folder or generated prompt.
 */
export async function analyzeShotCuts(video:string,options:ReelbenchOptions):Promise<Record<string,unknown>> {
  const script=resolve(options.skillsRoot,'video-shots','scripts','video-shots.mjs');
  const raw=await runTool(script,['seed',resolve(video),'--title','Znith Film'],options.signal);
  const output:unknown=JSON.parse(raw);
  if(!output||typeof output!=='object'||Array.isArray(output))throw new Error('Reelbench seed returned invalid JSON');
  return output as Record<string,unknown>;
}
export async function scrubExportMetadata(input:string,output:string,options:ReelbenchOptions):Promise<string> {
  const script=resolve(options.skillsRoot,'video-scrub','scripts','video-scrub.mjs');
  await mkdir(dirname(resolve(output)),{recursive:true});
  await runTool(script,['run',resolve(input),'-o',resolve(output)],options.signal);
  await access(output);
  return resolve(output);
}

/** Builds the upstream Reelbench sync plan for a finished film and shots.json. */
export async function createVideoSyncPlan(shotsJson:string,video:string,options:ReelbenchOptions):Promise<string> {
  const script=resolve(options.skillsRoot,'video-sync','scripts','video-sync.mjs');
  return runTool(script,['plan',resolve(shotsJson),'--video',resolve(video)],options.signal);
}
