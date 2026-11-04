import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoGraph, makeEmptyGraph, NODE_DEFINITIONS } from '@znith/node-registry';
import { graphThroughNode, validateGraph } from '@znith/workflow-engine';

test('registry contains 13 distinct workflow node definitions',()=>{
  assert.equal(NODE_DEFINITIONS.length,13);
  assert.equal(new Set(NODE_DEFINITIONS.map(n=>n.type)).size,13);
});
test('sample Story → Script → Storyboard graph is valid',()=>{
  const result=validateGraph(makeDemoGraph());
  assert.deepEqual(result.errors,[]);
  assert.equal(result.valid,true);
});
test('new workflows start empty without generated sample content',()=>{
  const graph=makeEmptyGraph();
  assert.deepEqual(graph,{schemaVersion:2,nodes:[],edges:[]});
  assert.equal(validateGraph(graph).valid,true);
});
test('node execution includes only the selected node and its upstream inputs',()=>{
  const graph=graphThroughNode(makeDemoGraph(),'script');
  assert.deepEqual(graph.nodes.map(node=>node.id),['story','script']);
  assert.deepEqual(graph.edges.map(edge=>edge.id),['story-script']);
  assert.equal(validateGraph(graph).valid,true);
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
