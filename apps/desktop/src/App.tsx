import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap, Panel,
  applyNodeChanges, applyEdgeChanges, addEdge,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange
} from '@xyflow/react';
import { NODE_DEFINITIONS } from '@znith/node-registry';
import { graphSchema, type GraphNode, type ProjectData, type ProjectSummary,
  type RunSnapshot, type WorkflowGraph } from '@znith/contracts';
import FlowNode from './FlowNode';

const nodeTypes={znith:FlowNode};
const emptyGraph:WorkflowGraph={schemaVersion:2,nodes:[],edges:[]};
const CATEGORY_ORDER=['input','skill','logic','media'] as const;
const CATEGORY_LABEL:Record<string,string>={input:'INPUT',skill:'AI SKILLS',logic:'LOGIC',media:'MEDIA'};

export default function App() {
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [project,setProject]=useState<ProjectData|null>(null);
  const [graph,setGraph]=useState<WorkflowGraph>(emptyGraph);
  const [revision,setRevision]=useState(1);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [runId,setRunId]=useState<string|null>(null);
  const [run,setRun]=useState<RunSnapshot|null>(null);
  const [artifactText,setArtifactText]=useState('');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [saving,setSaving]=useState(false);
  const [dirty,setDirty]=useState(false);

  const openProject=useCallback(async(id:string)=>{
    try {
      const data=await window.znith.projects.open(id);
      setProject(data);setGraph(data.graph);setRevision(data.revision);setRun(null);
      setRunId(null);setArtifactText('');setSelectedId(null);setDirty(false);setError('');
    } catch(e) {setError(String(e));}
  },[]);
  useEffect(()=>{
    let enabled=true;
    void window.znith.projects.list().then(p=>{
      if(!enabled)return;
      setProjects(p);
      if(p[0])void openProject(p[0].id);
    }).catch(e=>setError(String(e)));
    return()=>{enabled=false;};
  },[openProject]);

  useEffect(()=>{
    if(!runId)return;
    let alive=true;
    const refresh=()=>void window.znith.runs.get(runId).then(snapshot=>{
      if(alive)setRun(snapshot);
    }).catch(e=>{if(alive)setError(String(e));});
    refresh();
    const unsub=window.znith.runs.subscribe(runId,refresh);
    const poll=setInterval(refresh,1300);
    return()=>{alive=false;unsub();clearInterval(poll);};
  },[runId]);

  const flowNodes=useMemo<Node[]>(()=>graph.nodes.map(n=>({
    id:n.id,type:'znith',position:n.position,selected:n.id===selectedId,
    data:{label:n.type,nodeType:n.type,status:run?.nodes.find(x=>x.nodeId===n.id)?.status},
  })),[graph.nodes,selectedId,run]);
  const flowEdges=useMemo<Edge[]>(()=>graph.edges.map(e=>({
    id:e.id,source:e.source,target:e.target,sourceHandle:e.sourceHandle,targetHandle:e.targetHandle,
    type:'smoothstep',animated:run?.nodes.some(n=>n.nodeId===e.target&&n.status==='RUNNING')??false,
    style:{stroke:'#737996',strokeWidth:1.8},
  })),[graph.edges,run]);
  const changeGraph=(updater:(prev:WorkflowGraph)=>WorkflowGraph)=>{
    setGraph(updater);setDirty(true);setNotice('');
  };
  const onNodesChange=useCallback((changes:NodeChange[])=>{
    if(changes.every(c=>c.type==='select'))return;
    changeGraph(prev=>{
      const current:Node[]=prev.nodes.map(n=>({id:n.id,type:'znith',position:n.position,data:{}}));
      const changed=applyNodeChanges(changes,current);
      const positions=new Map(changed.map(n=>[n.id,n.position]));
      return {...prev,nodes:prev.nodes.filter(n=>positions.has(n.id)).map(n=>({...n,position:positions.get(n.id)!})),
        edges:prev.edges.filter(e=>positions.has(e.source)&&positions.has(e.target))};
    });
  },[]);
  const onEdgesChange=useCallback((changes:EdgeChange[])=>{
    changeGraph(prev=>{
      const base:Edge[]=prev.edges.map(e=>({...e,type:'smoothstep'}));
      const edges=applyEdgeChanges(changes,base);
      return {...prev,edges:edges.map(e=>({id:e.id,source:e.source,target:e.target,sourceHandle:e.sourceHandle??'',targetHandle:e.targetHandle??''}))};
    });
  },[]);
  const onConnect=useCallback((connection:Connection)=>{
    if(!connection.sourceHandle||!connection.targetHandle) return;
    changeGraph(prev=>({...prev,edges:[...prev.edges,{
      id:`edge-${crypto.randomUUID()}`,source:connection.source,target:connection.target,
      sourceHandle:connection.sourceHandle!,targetHandle:connection.targetHandle!
    }]}));
  },[]);
  const addNode=(type:string)=>{
    const def=NODE_DEFINITIONS.find(n=>n.type===type)!;
    const id=`${type.split('.').at(-1)}-${crypto.randomUUID().slice(0,5)}`;
    const node:GraphNode={id,type,position:{x:100+graph.nodes.length*26,y:110+graph.nodes.length*34},
      runtime:'local',config:type==='film.story-input'?{prompt:'Nhập ý tưởng phim tại đây...'}:{}};
    changeGraph(g=>({...g,nodes:[...g.nodes,node]}));setSelectedId(id);
    setNotice(`Added ${def.label}. Connect its required ports before running.`);
  };
  const selectedNode=graph.nodes.find(n=>n.id===selectedId);
  const selectedDefinition=NODE_DEFINITIONS.find(n=>n.type===selectedNode?.type);
  const updateConfig=(key:string,value:unknown)=>{
    if(!selectedNode)return;
    changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedNode.id?{...n,config:{...n.config,[key]:value}}:n)}));
  };
  const save=async()=>{
    if(!project)return;
    setSaving(true);setError('');
    try{
      const valid=graphSchema.parse(graph);
      const newRevision=await window.znith.workflows.save(project.project.workflowId,valid,revision);
      setRevision(newRevision);setDirty(false);setNotice(`Saved revision ${newRevision}`);
    } catch(e){setError(String(e));} finally{setSaving(false);}
  };
  const start=async()=>{
    if(!project)return;
    setError('');setNotice('');
    try {
      const validation=await window.znith.workflows.validate(graph);
      if(!validation.valid){setError(validation.errors.join('\n'));return;}
      if(dirty) {
        const next=await window.znith.workflows.save(project.project.workflowId,graph,revision);
        setRevision(next);setDirty(false);
      }
      const id=await window.znith.runs.start(project.project.workflowId);
      setRunId(id);setArtifactText('');setNotice('Mock workflow started');
    }catch(e){setError(String(e));}
  };
  const createProject=async()=>{
    const name=window.prompt('Tên project mới', 'My Film');
    if(!name?.trim())return;
    try {
      const created=await window.znith.projects.create(name);
      setProjects(await window.znith.projects.list());
      await openProject(created.project.id);
    }catch(e){setError(String(e));}
  };
  const showArtifact=async(artifactId:string)=>{
    try{setArtifactText(await window.znith.artifacts.readText(artifactId));}catch(e){setError(String(e));}
  };
  const selectedRun=run?.nodes.find(n=>n.nodeId===selectedId);
  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">✦</span><b>ZNITH</b><span className="brand-sub">AI FILM STUDIO</span></div>
      <div className="top-actions">
        <span className="tag">DESKTOP · LOCAL-FIRST</span>
        <span className="project-select-label">PROJECT</span>
        <select className="project-select" value={project?.project.id??''} onChange={e=>{if(dirty&&!window.confirm('Discard unsaved changes?'))return;void openProject(e.target.value);}}>
          {projects.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
        </select>
        <button className="ghost" onClick={()=>void createProject()}>+ Project</button>
        <button className="ghost" disabled={!project||!dirty||saving} onClick={()=>void save()}>{saving?'Saving...':dirty?'Save *':'Saved'}</button>
        <button className="run-button" disabled={!project} onClick={()=>void start()}>▶ Run Mock</button>
      </div>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <div className="panel-head"><h3>Node Library</h3><small>12 MODULES</small></div>
        <p className="muted tiny">Add nodes to the canvas, then connect matching typed ports.</p>
        {CATEGORY_ORDER.map(category=><section className="library-section" key={category}>
          <div className="library-heading">{CATEGORY_LABEL[category]}</div>
          {NODE_DEFINITIONS.filter(n=>n.category===category).map(n=><button className="library-node" key={n.type} onClick={()=>addNode(n.type)}>
            <span className={`category-marker ${category}`}></span><span>{n.label}</span><span className="plus">+</span>
          </button>)}
        </section>)}
        <div className="sidebar-foot"><span className="status-dot"/> Mock executor active<br/><small>No models or cloud keys required</small></div>
      </aside>
      <main className="main-content">
        <div className="canvas-heading"><div><h2>Workflow Canvas</h2><small>{project?.project.name??'Loading...'} · revision {revision} {dirty?'· Unsaved':''}</small></div><span className="canvas-version">ZNITH v0.2 · PHASE 1+2</span></div>
        <div className="flow-area">
          <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onNodeClick={(_event,node)=>setSelectedId(node.id)}
            onPaneClick={()=>setSelectedId(null)} fitView fitViewOptions={{padding:0.25}}
            deleteKeyCode={['Backspace','Delete']} colorMode="dark" proOptions={{hideAttribution:true}}>
            <Background color="#2b3044" gap={24} size={1} />
            <Controls showInteractive={false}/>
            <MiniMap zoomable pannable nodeColor="#7e66c4" maskColor="rgba(12,14,23,.7)" />
            <Panel position="top-left" className="flow-panel">◈ DAG EDITOR <span>drag · connect · run</span></Panel>
          </ReactFlow>
        </div>
        <div className="console-pane">
          <div className="console-title"><strong>Execution</strong><span className={`execution-pill ${run?.status?.toLowerCase()??''}`}>{run?.status??'IDLE'}</span>{runId&&<button className="link" onClick={()=>void window.znith.runs.cancel(runId).catch(e=>setError(String(e)))}>Cancel</button>}</div>
          {run?<div className="run-steps">{run.nodes.map(n=><button onClick={()=>setSelectedId(n.nodeId)} key={n.id} className={`step ${n.status.toLowerCase()}`}><span className="step-dot"/>{n.nodeId}<small>{n.status}</small></button>)}</div>:<div className="console-empty">Run the demo graph to generate local mock Script and Storyboard JSON artifacts.</div>}
          {notice&&<div className="notice">{notice}</div>}
          {error&&<pre className="error">{error}</pre>}
        </div>
      </main>
      <aside className="inspector">
        <div className="panel-head"><h3>Inspector</h3><small>PROPERTIES</small></div>
        {selectedNode ? <>
          <div className="inspector-header"><span className={`category-marker ${selectedDefinition?.category}`}/><b>{selectedDefinition?.label??selectedNode.type}</b></div>
          <p className="muted tiny">{selectedNode.type}<br/>{selectedNode.id}</p>
          <label className="field-title">Runtime</label>
          <select className="field" value={selectedNode.runtime} onChange={e=>changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedNode.id?{...n,runtime:e.target.value as GraphNode['runtime']}:n)}))}>
            <option value="local">Local mock</option><option value="auto">Auto (local-first)</option><option value="cloud">Cloud (not implemented)</option>
          </select>
          {selectedNode.type==='film.story-input'&&<><label className="field-title">Story prompt</label>
            <textarea className="field prompt-input" value={String(selectedNode.config.prompt??'')} onChange={e=>updateConfig('prompt',e.target.value)} rows={8}/></>}
          <div className="inspector-separator"/>
          <label className="field-title">Inputs</label>
          {selectedDefinition?.inputs.map(p=><div className="port-detail" key={p.id}><span>{p.id}{p.required?' *':''}</span><small>{p.type}</small></div>)}
          <label className="field-title">Outputs</label>
          {selectedDefinition?.outputs.map(p=><div className="port-detail" key={p.id}><span>{p.id}</span><small>{p.type}</small></div>)}
          <div className="inspector-separator"/>
          <label className="field-title">Execution</label>
          <div className="port-detail"><span>Status</span><small>{selectedRun?.status??'Not run'}</small></div>
          {selectedRun?.error&&<pre className="error">{selectedRun.error}</pre>}
          {selectedRun?.status==='FAILED'&&<button className="ghost" onClick={()=>void window.znith.runs.retryNode(selectedRun.id).catch(e=>setError(String(e)))}>↻ Retry node</button>}
          {selectedRun?.outputRefs.map(a=><button className="artifact-link" key={a.id} onClick={()=>void showArtifact(a.id)}>▤ View {a.type} JSON</button>)}
          {artifactText&&<pre className="artifact-preview">{artifactText}</pre>}
        </>:<div className="inspector-placeholder">Select a canvas node to edit its configuration or inspect generated artifacts.</div>}
      </aside>
    </div>
  </div>;
}
