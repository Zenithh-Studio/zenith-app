import { graphSchema, type WorkflowGraph, type ValidationResult } from '@znith/contracts';
import { NODE_REGISTRY } from '@znith/node-registry';

export function dependencies(graph: WorkflowGraph, nodeId: string): string[] {
  return [...new Set(graph.edges.filter(edge => edge.target === nodeId).map(edge => edge.source))];
}
export function graphThroughNode(graph:WorkflowGraph,nodeId:string):WorkflowGraph {
  if(!graph.nodes.some(node=>node.id===nodeId))throw new Error(`Node ${nodeId} was not found`);
  const included=new Set([nodeId]);
  let changed=true;
  while(changed){
    changed=false;
    for(const edge of graph.edges)if(included.has(edge.target)&&!included.has(edge.source)){included.add(edge.source);changed=true;}
  }
  return {...graph,nodes:graph.nodes.filter(node=>included.has(node.id)),edges:graph.edges.filter(edge=>included.has(edge.source)&&included.has(edge.target))};
}
export function validateGraph(input: unknown): ValidationResult {
  const parsed = graphSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) };
  const graph = parsed.data;
  const errors: string[] = [];
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  if (nodes.size !== graph.nodes.length) errors.push('Node IDs must be unique');
  const edgeIds = new Set<string>();
  const targets = new Map<string, number>();
  for (const node of graph.nodes) {
    const definition = NODE_REGISTRY.get(node.type);
    if (!definition) { errors.push(`Unknown node type: ${node.type}`); continue; }
    const config = definition.configSchema.safeParse(node.config);
    if (!config.success) errors.push(`Invalid config for ${node.id}: ${config.error.issues.map(x=>x.message).join(', ')}`);
    if (node.runtime === 'cloud' && definition.category !== 'media' && definition.category !== 'skill') {
      errors.push(`Node ${node.id} does not support cloud runtime`);
    }
  }
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) errors.push(`Duplicate edge ID ${edge.id}`);
    edgeIds.add(edge.id);
    const source = nodes.get(edge.source), target = nodes.get(edge.target);
    if (!source || !target) { errors.push(`Edge ${edge.id} references an unknown node`); continue; }
    const from = NODE_REGISTRY.get(source.type)?.outputs.find(port => port.id === edge.sourceHandle);
    const to = NODE_REGISTRY.get(target.type)?.inputs.find(port => port.id === edge.targetHandle);
    if (!from || !to) { errors.push(`Edge ${edge.id} has unknown port handle`); continue; }
    if (from.type !== to.type) errors.push(`Edge ${edge.id} mismatches ports: ${from.type} → ${to.type}`);
    const key = `${edge.target}:${edge.targetHandle}`;
    targets.set(key, (targets.get(key) ?? 0) + 1);
    if (!to.multiple && targets.get(key)! > 1) errors.push(`Port ${key} allows only one connection`);
    if (edge.source === edge.target) errors.push(`Self-edge ${edge.id} is not allowed`);
  }
  for (const node of graph.nodes) {
    const definition = NODE_REGISTRY.get(node.type);
    if (!definition) continue;
    for (const input of definition.inputs.filter(p => p.required)) {
      if (!targets.has(`${node.id}:${input.id}`)) errors.push(`Required input missing: ${node.id}.${input.id}`);
    }
    if (node.type === 'film.script') {
      if (!targets.has(`${node.id}:story`) && !targets.has(`${node.id}:outline`)) {
        errors.push(`Script Agent ${node.id} needs story or outline`);
      }
    }
  }
  const visiting = new Set<string>(), visited = new Set<string>();
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target]);
  function dfs(id: string): void {
    if (visiting.has(id)) { errors.push(`Cycle detected at ${id}`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of children.get(id) ?? []) if (nodes.has(next)) dfs(next);
    visiting.delete(id); visited.add(id);
  }
  for (const id of nodes.keys()) dfs(id);
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}
export function downstreamOf(graph: WorkflowGraph, nodeId: string): Set<string> {
  const found = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const from = stack.pop()!;
    for (const edge of graph.edges.filter(e=>e.source === from)) {
      if (!found.has(edge.target)) { found.add(edge.target); stack.push(edge.target); }
    }
  }
  return found;
}
