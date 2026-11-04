import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDemoGraph, makeEmptyGraph, NODE_DEFINITIONS } from '@znith/node-registry';
import { graphThroughNode, updateGraphNodes, validateConnection, validateGraph } from '@znith/workflow-engine';

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
test('dragging or deleting a node preserves its graph data and unrelated nodes',()=>{
  const graph=makeDemoGraph();
  graph.nodes[1].config.model='qwen2.5:7b';
  const moved=updateGraphNodes(graph,new Map([['script',{x:920,y:410}]]),new Set());
  assert.deepEqual(moved.nodes[1],{...graph.nodes[1],position:{x:920,y:410}});
  const removed=updateGraphNodes(moved,new Map(),new Set(['storyboard']));
  assert.deepEqual(removed.nodes.map(node=>node.id),['story','script']);
  assert.deepEqual(removed.edges.map(edge=>edge.id),['story-script']);
  assert.equal(removed.nodes[1].config.model,'qwen2.5:7b');
});
test('connections accept compatible ports and reject duplicates or type mismatches',()=>{
  const graph=makeDemoGraph();
  graph.nodes.push({id:'outline-extra',type:'film.outline',position:{x:390,y:400},config:{executionMode:'mock'},runtime:'local'});
  const valid={source:'story',sourceHandle:'story',target:'outline-extra',targetHandle:'story'};
  assert.equal(validateConnection(graph,valid),null);
  assert.match(validateConnection(graph,{source:'story',sourceHandle:'story',target:'script',targetHandle:'story'})??'',/already connected/);
  assert.match(validateConnection(graph,{source:'script',sourceHandle:'script',target:'outline-extra',targetHandle:'story'})??'',/different data types/);
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
