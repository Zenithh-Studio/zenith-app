import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZnithDatabase } from '@znith/database';

test('workflow management supports list, rename, duplicate, and safe deletion',()=>{
  const root=mkdtempSync(join(tmpdir(),'znith-workflows-'));
  const database=new ZnithDatabase(join(root,'znith.sqlite'),join(root,'projects'));
  try {
    const project=database.createProject('Table Demo');
    const originalId=project.project.workflowId;
    const created=database.createWorkflow(project.project.id,'Storyboard Pass');
    assert.equal(database.listWorkflows().length,2);
    assert.equal(database.openWorkflow(created.project.workflowId).graph.nodes.length,3);
    database.renameWorkflow(created.project.workflowId,'Final Cut Workflow');
    assert.equal(database.listWorkflows().find(w=>w.id===created.project.workflowId)?.name,'Final Cut Workflow');

    const copy=database.duplicateWorkflow(created.project.workflowId,'Final Cut Copy');
    assert.equal(database.openWorkflow(copy.project.workflowId).graph.nodes.length,3);
    database.deleteWorkflow(copy.project.workflowId);
    database.deleteWorkflow(created.project.workflowId);
    assert.deepEqual(database.listWorkflows().map(w=>w.id),[originalId]);
    assert.throws(()=>database.deleteWorkflow(originalId),/at least one workflow/);
  } finally {
    database.close();
    rmSync(root,{recursive:true,force:true});
  }
});