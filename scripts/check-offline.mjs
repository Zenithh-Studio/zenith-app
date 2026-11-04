#!/usr/bin/env node
// Dependency-free structural smoke test; uses globally installed TypeScript if pnpm packages aren't installed.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');
const require=createRequire(join(root,'apps/desktop/package.json'));
let ts;
try {ts=require('typescript');}
catch {
  const globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  ts=require(join(globalRoot,'typescript'));
}
function allFiles(directory){
  return readdirSync(directory,{withFileTypes:true}).flatMap(e=>{
    if(['.git','node_modules','dist','dist-electron'].includes(e.name))return [];
    const path=join(directory,e.name);
    return e.isDirectory()?allFiles(path):[path];
  });
}
const files=allFiles(root);
let parsed=0;
for(const file of files){
  const extension=extname(file);
  if(extension==='.json')JSON.parse(readFileSync(file,'utf8'));
  if(extension==='.ts'||extension==='.tsx') {
    const contents=readFileSync(file,'utf8');
    const source=ts.createSourceFile(file,contents,ts.ScriptTarget.Latest,true,extension==='.tsx'?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    assert.equal(source.parseDiagnostics.length,0,`${file}: ${source.parseDiagnostics.map(x=>x.messageText).join(', ')}`);
    parsed++;
  }
}
const registry=readFileSync(join(root,'packages/node-registry/src/index.ts'),'utf8');
const count=(registry.match(/make\('(film\.|logic\.|media\.)/g)||[]).length;
assert.equal(count,13,'Expected exactly 13 node definitions');
const runnerFile=join(root,'packages/local-runner/src/index.ts');
const runnerSource=ts.createSourceFile(runnerFile,readFileSync(runnerFile,'utf8'),ts.ScriptTarget.Latest,true);
const fn=runnerSource.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='mockNode');
assert.ok(fn,'mockNode must exist');
const transpiled=ts.transpileModule(fn.getText(runnerSource),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const context={exports:{},module:{exports:{}},console};
vm.runInNewContext(transpiled,context,{timeout:2000});
const mockNode=context.exports.mockNode;
const story=mockNode({type:'film.story-input',config:{prompt:'Moon flower'}},{});
assert.equal(story.prompt,'Moon flower');
const script=mockNode({type:'film.script',config:{}},{story});
assert.equal(script.scenes.length,2);
const board=mockNode({type:'film.storyboard',config:{}},{script});
assert.equal(board.shots.length,5);
console.log(`PASS: ${parsed} TypeScript/TSX files parsed; JSON files valid; 13 nodes present; mock story/script/storyboard outputs verified.`);
console.log('NOTE: This check is not a dependency installation, typecheck, Electron startup, or package build.');
