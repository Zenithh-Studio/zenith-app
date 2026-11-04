import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, BackgroundVariant, MiniMap, Panel,
  applyNodeChanges, applyEdgeChanges, useReactFlow,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange
} from '@xyflow/react';
import { NODE_DEFINITIONS } from '@znith/node-registry';
import { graphSchema, type GraphNode, type ProjectData,
  type MediaPreview, type RunSnapshot, type WorkflowGraph } from '@znith/contracts';
import FlowNode from './FlowNode';
import WorkflowManagement from './WorkflowManagement';

const nodeTypes={znith:FlowNode};
const emptyGraph:WorkflowGraph={schemaVersion:2,nodes:[],edges:[]};

function CanvasFooter(){
  const {fitView,zoomIn,zoomOut}=useReactFlow();
  return <Panel position="bottom-left" className="viewport-tools"><button onClick={()=>void zoomIn()}>＋</button><button onClick={()=>void zoomOut()}>−</button><button className="zoom-value" onClick={()=>void fitView({padding:.18,duration:240})}>FIT</button><button title="Fit canvas" onClick={()=>void fitView({padding:.18,duration:240})}>⤢</button></Panel>;
}

export default function App() {
  const [view,setView]=useState<'management'|'editor'>(()=>window.location.pathname.endsWith('/editor')?'editor':'management');
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
  const [inspectorOpen,setInspectorOpen]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [pickerFilter,setPickerFilter]=useState('');
  const [branchFrom,setBranchFrom]=useState<string|null>(null);
  const [previews,setPreviews]=useState<Record<string,MediaPreview>>({});

  const openWorkflow=useCallback(async(id:string,updateAddress=true)=>{
    try {
      const data=await window.znith.workflows.open(id);
      setProject(data);setGraph(data.graph);setRevision(data.revision);setRun(null);
      setRunId(await window.znith.runs.latest(data.project.workflowId));setArtifactText('');setSelectedId(null);setDirty(false);setError('');
      setView('editor');
      if(updateAddress)window.history.pushState(null,'',`/workflows/${encodeURIComponent(id)}/editor`);
    } catch(e) {setError(String(e));}
  },[]);
  useEffect(()=>{
    const syncRoute=()=>{
      const match=window.location.pathname.match(/^\/workflows\/([^/]+)\/editor$/);
      if(match)void openWorkflow(decodeURIComponent(match[1]),false);
      else setView('management');
    };
    window.addEventListener('popstate',syncRoute);syncRoute();
    return()=>window.removeEventListener('popstate',syncRoute);
  },[openWorkflow]);
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

  useEffect(()=>{
    let alive=true;
    const refs=run?.nodes.flatMap(item=>item.outputRefs.filter(ref=>['image','video','audio','film'].includes(ref.type)))??[];
    void Promise.all(refs.map(async ref=>{
      try{return [ref.id,await window.znith.artifacts.preview(ref.id)] as const;}catch{return null;}
    })).then(entries=>{
      if(alive)setPreviews(Object.fromEntries(entries.filter((entry):entry is readonly [string,MediaPreview]=>entry!==null)));
    }).catch(()=>{if(alive)setPreviews({});});
    return()=>{alive=false;};
  },[run]);

  const flowNodes=useMemo<Node[]>(()=>graph.nodes.map(n=>({
    id:n.id,type:'znith',position:n.position,selected:n.id===selectedId,
    data:{label:NODE_DEFINITIONS.find(def=>def.type===n.type)?.label??n.type,nodeType:n.type,
      status:run?.nodes.find(x=>x.nodeId===n.id)?.status,prompt:String(n.config.prompt??''),
      provider:n.config.executionMode==='comfyui'?'Flow · ComfyUI':n.config.executionMode==='ollama'?'Ollama':n.config.executionMode==='cloud'?'Cloud LLM':'Local · Mock',
      mediaPreview:(run?.nodes.find(x=>x.nodeId===n.id)?.outputRefs??[]).map(ref=>previews[ref.id]).find(Boolean),
      onPromptChange:(value:string)=>updateNodeConfig(n.id,'prompt',value),onRun:()=>void start(),
      onDuplicate:()=>duplicateNode(n.id),onBranch:()=>openBranchPicker(n.id),
      onSettings:()=>{setSelectedId(n.id);setInspectorOpen(true);},onDelete:()=>deleteNode(n.id)},
  })),[graph.nodes,selectedId,run,previews]);
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
  const addNode=(type:string,fromNodeId?:string)=>{
    const def=NODE_DEFINITIONS.find(n=>n.type===type)!;
    const id=`${type.split('.').at(-1)}-${crypto.randomUUID().slice(0,5)}`;
    const source=graph.nodes.find(n=>n.id===fromNodeId);
    const node:GraphNode={id,type,position:source?{x:source.position.x+410,y:source.position.y+80}:{x:100+graph.nodes.length*72,y:100+graph.nodes.length*42},
      runtime:'local',config:type==='film.story-input'?{prompt:'Mô tả khung hình hoặc chuyển động cần tạo...'}:
        ['media.image-generate','media.video-generate'].includes(type)?{executionMode:'mock'}:{}};
    const sourceDef=source&&NODE_DEFINITIONS.find(n=>n.type===source.type);
    const output=sourceDef?.outputs[0];
    const targetPort=output&&def.inputs.find(input=>input.type===output.type);
    const edge=source&&output&&targetPort?{id:`edge-${crypto.randomUUID()}`,source:source.id,sourceHandle:output.id,target:node.id,targetHandle:targetPort.id}:null;
    changeGraph(g=>({...g,nodes:[...g.nodes,node],edges:edge?[...g.edges,edge]:g.edges}));setSelectedId(id);setPickerOpen(false);setBranchFrom(null);
    setNotice(`Added ${def.label}. Connect its required ports before running.`);
  };
  const openBranchPicker=(nodeId:string)=>{setBranchFrom(nodeId);setPickerFilter('');setPickerOpen(true);};
  const duplicateNode=(nodeId:string)=>{
    const original=graph.nodes.find(n=>n.id===nodeId);if(!original)return;
    const id=`${original.type.split('.').at(-1)}-${crypto.randomUUID().slice(0,5)}`;
    const copy:GraphNode={...structuredClone(original),id,position:{x:original.position.x+70,y:original.position.y+90}};
    changeGraph(g=>({...g,nodes:[...g.nodes,copy]}));setSelectedId(id);
  };
  const deleteNode=(nodeId:string)=>{
    changeGraph(g=>({...g,nodes:g.nodes.filter(n=>n.id!==nodeId),edges:g.edges.filter(e=>e.source!==nodeId&&e.target!==nodeId)}));
    if(selectedId===nodeId){setSelectedId(null);setInspectorOpen(false);}
  };
  const updateNodeConfig=(nodeId:string,key:string,value:unknown)=>changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===nodeId?{...n,config:{...n.config,[key]:value}}:n)}));
  const selectedNode=graph.nodes.find(n=>n.id===selectedId);
  const selectedDefinition=NODE_DEFINITIONS.find(n=>n.type===selectedNode?.type);
  const updateConfig=(key:string,value:unknown)=>{
    if(!selectedNode)return;
    updateNodeConfig(selectedNode.id,key,value);
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
      setRunId(id);setArtifactText('');setNotice('Workflow started');
    }catch(e){setError(String(e));}
  };
  const showArtifact=async(artifactId:string)=>{
    try{setArtifactText(await window.znith.artifacts.readText(artifactId));}catch(e){setError(String(e));}
  };
  const selectedRun=run?.nodes.find(n=>n.nodeId===selectedId);
  if(view==='management') return <WorkflowManagement onOpen={id=>void openWorkflow(id)}/>;
  const statusLabel=run?.status??'READY';
  const pickerNodes=NODE_DEFINITIONS.filter(def=>!pickerFilter||`${def.label} ${def.type} ${def.category}`.toLowerCase().includes(pickerFilter.toLowerCase()));
  return <div className="studio-app">
    <header className="studio-topbar">
      <div className="studio-brand"><span className="brand-mark">✦</span><b>ZNITH</b><span className="studio-brand-caption">VISUAL WORKFLOW</span></div>
      <button className="workflow-title-button" onClick={()=>{if(dirty&&!window.confirm('Discard unsaved changes?'))return;window.history.pushState(null,'','/workflows');setView('management');}}>← <span>{project?.workflowName??'Workflow'}</span><small>{dirty?'● Chưa lưu':'● Đã lưu'}</small></button>
      <div className="studio-header-actions"><span className="node-count">⌘ {graph.nodes.length} nodes</span><span className={`run-state ${statusLabel.toLowerCase()}`}><i/>{statusLabel}</span><button className="studio-save" disabled={!dirty||saving} onClick={()=>void save()}>{saving?'Đang lưu…':dirty?'Lưu thay đổi':'Đã lưu'}</button><button className="studio-run" disabled={!project} onClick={()=>void start()}><span>▶</span> Sử dụng workflow</button></div>
    </header>
    <div className="studio-workspace">
      <div className="studio-left-rail">
        <button className="rail-add" title="Thêm node" onClick={()=>{setBranchFrom(null);setPickerFilter('');setPickerOpen(true);}}>＋</button>
        <button title="Select" className="rail-active">↖</button>
        <button title="Pan canvas" onClick={()=>setNotice('Kéo vùng trống để di chuyển canvas.')}>✋</button>
        <span className="rail-divider"/>
        <button title="Thêm node ảnh/video" onClick={()=>{setPickerFilter('image');setBranchFrom(null);setPickerOpen(true);}}>▧</button>
        <button title="Thêm prompt" onClick={()=>addNode('film.story-input')}>T</button>
        <button className="rail-run" title="Chạy workflow" onClick={()=>void start()}>▶</button>
      </div>
      <div className="studio-canvas">
        <ReactFlow nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeClick={(_event,node)=>{setSelectedId(node.id);setInspectorOpen(false);}}
          onNodeDoubleClick={(_event,node)=>{setSelectedId(node.id);setInspectorOpen(true);}}
          onNodeContextMenu={(event,node)=>{event.preventDefault();setSelectedId(node.id);setInspectorOpen(true);}}
          onPaneClick={()=>{setSelectedId(null);setInspectorOpen(false);setPickerOpen(false);}}
          onPaneContextMenu={event=>{event.preventDefault();setBranchFrom(null);setPickerFilter('');setPickerOpen(true);}}
          fitView fitViewOptions={{padding:.18}} deleteKeyCode={['Backspace','Delete']} colorMode="dark" proOptions={{hideAttribution:true}}>
          <Background variant={BackgroundVariant.Dots} color="#303139" gap={22} size={1}/>
          <MiniMap zoomable pannable nodeColor="#9c80ed" maskColor="rgba(16,17,20,.78)" className="studio-minimap"/>
          <CanvasFooter/>
          <Panel position="top-left" className="canvas-account"><span>✦</span><b>TobyFlow</b><small>LOCAL</small></Panel>
          {run&&<Panel position="bottom-right" className={`canvas-run-banner ${run.status.toLowerCase()}`}><i/>{run.status} · {run.nodes.filter(n=>n.status==='SUCCEEDED').length}/{run.nodes.length} nodes{runId&&['RUNNING','READY','WAITING_APPROVAL'].includes(run.status)&&<button onClick={()=>void window.znith.runs.cancel(runId).catch(e=>setError(String(e)))}>Hủy</button>}</Panel>}
        </ReactFlow>
      </div>
      <aside className={`studio-inspector ${inspectorOpen?'open':''}`}>
        {selectedNode&&<>
          <div className="inspector-drawer-head"><div><span className="eyebrow">NODE SETTINGS</span><h3>{selectedDefinition?.label??selectedNode.type}</h3></div><button className="drawer-close" onClick={()=>setInspectorOpen(false)}>×</button></div>
          <p className="inspector-node-id">{selectedNode.type} · {selectedNode.id}</p>
          {selectedNode.type==='media.image-reference'&&<><label className="field-title">Reference image</label><div className="image-path-row"><input className="field" value={String(selectedNode.config.sourcePath??'')} placeholder="Choose a local image…" readOnly/><button className="ghost" onClick={()=>void window.znith.files.pickImage().then(path=>{if(path)updateConfig('sourcePath',path);}).catch(e=>setError(String(e)))}>Browse</button></div><p className="muted tiny">PNG, JPG or WebP · max 8 MiB. Znith copies the selected image into the project when this node runs.</p></>}
          <label className="field-title">Runtime</label>
          <select className="field" value={selectedNode.runtime} onChange={e=>changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedNode.id?{...n,runtime:e.target.value as GraphNode['runtime']}:n)}))}><option value="local">Local</option><option value="auto">Auto (local-first)</option><option value="cloud">Cloud (explicit opt-in)</option></select>
          {selectedNode.type==='media.audio-generate'&&<><label className="field-title">Narration mode</label><select className="field" value={String(selectedNode.config.executionMode??'mock')} onChange={e=>updateConfig('executionMode',e.target.value)}><option value="mock">Mock (offline sample)</option><option value="piper">Piper — local TTS</option></select>{selectedNode.config.executionMode==='piper'&&<><label className="field-title">Piper voice model path</label><input className="field" value={String(selectedNode.config.voiceModelPath??'')} placeholder="Absolute path to voice .onnx" onChange={e=>updateConfig('voiceModelPath',e.target.value)}/></>}</>}
          {(selectedNode.type==='media.image-generate'||selectedNode.type==='media.video-generate'||selectedNode.type==='media.film-export')&&<>
            <label className="field-title">Provider</label><select className="field" value={String(selectedNode.config.executionMode??'mock')} onChange={e=>updateConfig('executionMode',e.target.value)}><option value="mock">Preview mode · Mock</option>{selectedNode.type==='media.film-export'?<option value="ffmpeg">FFmpeg · Export MP4</option>:<option value="comfyui">Flow · ComfyUI</option>}</select>
            {selectedNode.config.executionMode==='comfyui'&&<><label className="field-title">ComfyUI address</label><input className="field" value={String(selectedNode.config.endpoint??'http://127.0.0.1:8188')} onChange={e=>updateConfig('endpoint',e.target.value)}/><label className="field-title">API workflow JSON</label><textarea className="field prompt-input" rows={8} spellCheck={false} placeholder="ComfyUI API graph; use $ZNITH_PROMPT and $ZNITH_INPUT_IMAGE" value={String(selectedNode.config.workflowJSON??'')} onChange={e=>updateConfig('workflowJSON',e.target.value)}/><p className="muted tiny">Flow generation uses your local ComfyUI graph and model. Nothing is uploaded by mock mode.</p></>}
          </>}
          {selectedNode.type==='film.story-input'&&<><label className="field-title">Prompt</label><textarea className="field prompt-input" rows={7} value={String(selectedNode.config.prompt??'')} onChange={e=>updateConfig('prompt',e.target.value)}/></>}
          {selectedDefinition?.category==='skill'&&<><label className="field-title">AI execution</label><select className="field" value={String(selectedNode.config.executionMode??'mock')} onChange={e=>{updateConfig('executionMode',e.target.value);if(e.target.value==='cloud')changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedNode.id?{...n,runtime:'cloud'}:n)}));if(e.target.value==='ollama')changeGraph(g=>({...g,nodes:g.nodes.map(n=>n.id===selectedNode.id?{...n,runtime:'local'}:n)}));}}><option value="mock">Mock</option><option value="ollama">Ollama · Local AI</option><option value="cloud">OpenAI-compatible · Cloud</option></select>{selectedNode.config.executionMode&&selectedNode.config.executionMode!=='mock'&&<><label className="field-title">Model</label><input className="field" value={String(selectedNode.config.model??'')} placeholder="e.g. qwen2.5:7b" onChange={e=>updateConfig('model',e.target.value)}/></>}{selectedNode.config.executionMode==='ollama'&&<><label className="field-title">Ollama address</label><input className="field" value={String(selectedNode.config.endpoint??'http://127.0.0.1:11434')} onChange={e=>updateConfig('endpoint',e.target.value)}/></>}</>}
          <div className="inspector-separator"/><label className="field-title">Inputs</label>{selectedDefinition?.inputs.map(port=><div className="port-detail" key={port.id}><span>{port.id}{port.required?' *':''}</span><small>{port.type}{port.multiple?' · multiple':''}</small></div>)}<label className="field-title">Outputs</label>{selectedDefinition?.outputs.map(port=><div className="port-detail" key={port.id}><span>{port.id}</span><small>{port.type}</small></div>)}
          <div className="inspector-separator"/><label className="field-title">Execution</label><div className="port-detail"><span>Status</span><small>{selectedRun?.status??'Not run'}</small></div>{selectedRun?.error&&<pre className="error">{selectedRun.error}</pre>}
          {selectedRun?.status==='WAITING_APPROVAL'&&selectedNode.type==='logic.approval'&&<div className="approval-actions"><button className="run-button" onClick={()=>void window.znith.runs.approveNode(selectedRun.id,true).catch(e=>setError(String(e)))}>Approve</button><button className="ghost" onClick={()=>void window.znith.runs.approveNode(selectedRun.id,false).catch(e=>setError(String(e)))}>Reject</button></div>}
          {selectedRun?.status==='FAILED'&&<button className="ghost" onClick={()=>void window.znith.runs.retryNode(selectedRun.id).catch(e=>setError(String(e)))}>↻ Retry node</button>}
          {selectedRun?.outputRefs.map(artifact=><button className="artifact-link" key={artifact.id} onClick={()=>void (['image','video','audio','film'].includes(artifact.type)?window.znith.artifacts.reveal(artifact.id):showArtifact(artifact.id)).catch(e=>setError(String(e)))}>▤ {['image','video','audio','film'].includes(artifact.type)?'Open':'View'} {artifact.type}</button>)}
          {artifactText&&<pre className="artifact-preview">{artifactText}</pre>}
        </>}
      </aside>
    </div>
    {(notice||error)&&<div className={`studio-toast ${error?'error-toast':''}`} role="status">{error||notice}<button onClick={()=>{setNotice('');setError('');}}>×</button></div>}
    {pickerOpen&&<div className="picker-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPickerOpen(false);}}><div className="node-picker">
      <div className="picker-heading"><div><span className="eyebrow">{branchFrom?'CREATE BRANCH':'NODE LIBRARY'}</span><h3>{branchFrom?'Choose the next node':'Add to canvas'}</h3></div><button className="drawer-close" onClick={()=>setPickerOpen(false)}>×</button></div>
      <input className="picker-search" autoFocus placeholder="Tìm node hoặc provider..." value={pickerFilter} onChange={e=>setPickerFilter(e.target.value)}/>
      <div className="picker-hint">{branchFrom?`Node sẽ nối từ ${graph.nodes.find(n=>n.id===branchFrom)?.type} nếu cổng dữ liệu tương thích.`:'Kéo node vào canvas hoặc chọn để thêm.'}</div>
      <div className="picker-results">{pickerNodes.map(def=><button key={def.type} className="picker-option" onClick={()=>addNode(def.type,branchFrom??undefined)}><span className={`picker-icon ${def.category}`}>{def.category==='input'?'T':def.category==='media'?'▧':def.category==='logic'?'⑂':'✦'}</span><span><b>{def.label}</b><small>{def.type==='media.image-generate'||def.type==='media.video-generate'?'Flow provider · ComfyUI adapter':def.description}</small></span><span className="picker-add">＋</span></button>)}</div>
      <div className="picker-foot">↑↓ Di chuyển <span>Enter Chọn</span> Esc Đóng</div>
    </div></div>}
  </div>;
}
