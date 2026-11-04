#!/usr/bin/env node
/**
 * Explicit opt-in installation of pinned upstream skill repositories.
 * Requires git and network access; never executes downloaded scripts.
 */
import { spawn } from 'node:child_process';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname, join } from 'node:path';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'..','integrations');
const sources=[
  {name:'shuohao-skills',repo:'https://github.com/eternityspring/shuohao-skills.git',sha:'5612d2a0bd5f19d978c3ee19d1e42840335e3b4b'},
  {name:'reelbench-skills',repo:'https://github.com/eternityspring/reelbench-skills.git',sha:'df39d5df9d7adc2f82acba5594579d60361a42c7'},
];
async function git(args){
  await new Promise((res,rej)=>{
    const child=spawn('git',args,{stdio:'inherit',windowsHide:true});
    child.once('error',rej);
    child.once('close',code=>code===0?res():rej(new Error('git failed: '+args.join(' '))));
  });
}
await mkdir(base,{recursive:true});
for(const source of sources){
  const target=join(base,source.name);
  try{ await stat(target); console.log('Already installed:',target); }
  catch{
    await git(['clone','--no-checkout','--filter=blob:none',source.repo,target]);
    await git(['-C',target,'checkout','--detach',source.sha]);
    console.log('Installed pinned',source.name,source.sha);
  }
}
console.log('Upstream sources are installed but are not executed automatically.');
