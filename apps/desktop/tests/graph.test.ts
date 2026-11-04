import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoGraph, NODE_DEFINITIONS } from '@znith/node-registry';
import { validateGraph } from '@znith/workflow-engine';

test('registry contains 12 distinct MVP definitions',()=>{
  assert.equal(NODE_DEFINITIONS.length,12);
  assert.equal(new Set(NODE_DEFINITIONS.map(n=>n.type)).size,12);
});
test('default Story → Script → Storyboard is valid',()=>{
  const result=validateGraph(makeDemoGraph());
  assert.deepEqual(result.errors,[]);
  assert.equal(result.valid,true);
});
test('validator rejects a cyclic graph',()=>{
  const graph=makeDemoGraph();
  graph.edges.push({id:'cycle',source:'storyboard',sourceHandle:'shots',target:'story',targetHandle:'story'});
  const validation=validateGraph(graph);
  assert.equal(validation.valid,false);
  assert.ok(validation.errors.some(x=>x.includes('Cycle')));
});
test('validator rejects port type mismatch',()=>{
  const graph=makeDemoGraph();
  graph.edges[0]={...graph.edges[0],source:'script',sourceHandle:'script'};
  assert.equal(validateGraph(graph).valid,false);
});
test('script requires story or outline input',()=>{
  const graph=makeDemoGraph();
  graph.edges=graph.edges.filter(e=>e.target!=='script');
  assert.ok(validateGraph(graph).errors.some(x=>x.includes('needs story or outline')));
});
