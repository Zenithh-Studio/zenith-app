import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZnithDatabase } from '@znith/database';
import { LocalScheduler, secureArtifactPath } from '@znith/local-runner';

const delay=(ms:number)=>new Promise<void>(res=>setTimeout(res,ms));
test('persistent mock workflow saves generated JSON artifacts',async()=>{
  const root=await mkdtemp(join(tmpdir(),'znith-test-'));
  const db=new ZnithDatabase(join(root,'state.sqlite'),join(root,'projects'));
  const scheduler=new LocalScheduler(db);
  try {
    const project=db.createProject('Test Film');
    scheduler.start();
    const runId=scheduler.startRun(project.project.workflowId);
    let snapshot=db.getRun(runId);
    for(let i=0;i<120 && !['SUCCEEDED','FAILED'].includes(snapshot.status);i++) {
      await delay(50);snapshot=db.getRun(runId);
    }
    assert.equal(snapshot.status,'SUCCEEDED',JSON.stringify(snapshot,null,2));
    assert.equal(snapshot.nodes.length,3);
    for(const node of snapshot.nodes) {
      assert.equal(node.status,'SUCCEEDED');
      assert.equal(node.outputRefs.length,1);
      const artifact=node.outputRefs[0];
      const content=JSON.parse(await readFile(secureArtifactPath(project.project.rootPath,artifact.relativePath),'utf8'));
      assert.equal(content.mock,true);
      if(node.nodeId==='storyboard') assert.equal(content.shots.length,5);
    }
  } finally {scheduler.stop();db.close();await rm(root,{recursive:true,force:true});}
});
test('project graph persists after closing SQLite',async()=>{
  const root=await mkdtemp(join(tmpdir(),'znith-persist-'));
  try {
    const location=join(root,'db.sqlite'),projectDir=join(root,'projects');
    const db=new ZnithDatabase(location,projectDir);
    const project=db.createProject('Persistent Film');
    const next=db.saveWorkflow(project.project.workflowId,project.graph,1);
    assert.equal(next,2);
    assert.throws(()=>db.saveWorkflow(project.project.workflowId,project.graph,1));
    db.close();
    const reopened=new ZnithDatabase(location,projectDir);
    assert.equal(reopened.openProject(project.project.id).revision,2);
    reopened.close();
  } finally {await rm(root,{recursive:true,force:true});}
});
