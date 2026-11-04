import { memo, type CSSProperties } from 'react';
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import { NODE_REGISTRY } from '@znith/node-registry';
import type { MediaPreview, RunStatus } from '@znith/contracts';

const colors:Record<string,string>={input:'#c5ff32',skill:'#b99cff',logic:'#f5bd60',media:'#72b9ff'};
export type FlowNodeData={
  label:string;nodeType:string;status?:RunStatus;prompt?:string;mediaPreview?:MediaPreview;
  onPromptChange?:(value:string)=>void;onRun?:()=>void;onDuplicate?:()=>void;onBranch?:()=>void;onSettings?:()=>void;onDelete?:()=>void;
};

function FlowNode(props:NodeProps) {
  const data=props.data as FlowNodeData;
  const definition=NODE_REGISTRY.get(data.nodeType);
  if(!definition)return <div className="studio-node invalid">Unknown node: {data.nodeType}</div>;
  const tint=colors[definition.category];
  const isPrompt=data.nodeType==='film.story-input';
  const isImage=definition.outputs.some(p=>p.type==='image');
  const isVideo=definition.outputs.some(p=>p.type==='video');
  const isMedia=isImage||isVideo||definition.outputs.some(p=>['audio','film'].includes(p.type));
  return <div className={`studio-node ${isMedia?'media-node':''} ${isPrompt?'prompt-node':''} ${props.selected?'selected':''}`} style={{'--node-tint':tint} as CSSProperties}>
    <NodeToolbar isVisible={props.selected} position={Position.Top} align="center" className="node-actions">
      <button title="Run workflow" onClick={e=>{e.stopPropagation();data.onRun?.();}}>▶</button>
      <button title="Create branch" onClick={e=>{e.stopPropagation();data.onBranch?.();}}>⑂</button>
      <button title="Node settings" onClick={e=>{e.stopPropagation();data.onSettings?.();}}>⚙</button>
      <button title="Duplicate node" onClick={e=>{e.stopPropagation();data.onDuplicate?.();}}>▢</button>
      <button className="delete-node-action" title="Delete node" onClick={e=>{e.stopPropagation();data.onDelete?.();}}>⌫</button>
    </NodeToolbar>
    <div className="studio-node-heading">
      <span className="studio-node-type">{isPrompt?'✣ PROMPT':isVideo?'▣ IMAGE / VIDEO':isImage?'▧ IMAGE / VIDEO':definition.category.toUpperCase()}</span>
      <span className={`studio-node-status ${(data.status??'IDLE').toLowerCase()}`} title={data.status??'Idle'}/>
    </div>
    <div className="studio-node-title">{definition.label}</div>
    {isPrompt?<>
      <textarea className="node-prompt nodrag nowheel" rows={4} value={data.prompt??''} placeholder="Describe the shot, style, motion and camera..." onChange={e=>data.onPromptChange?.(e.target.value)} onMouseDown={e=>e.stopPropagation()}/>
      <div className="node-footer"><span>◉ Multi-image</span><span>{(data.prompt??'').length}/4000</span></div>
    </>:isMedia?<>
      <div className={`node-media-preview ${isVideo?'is-video':''}`}>
        {data.mediaPreview?.mimeType.startsWith('video/')?<video src={data.mediaPreview.dataUrl} controls muted preload="metadata"/>:
         data.mediaPreview?.mimeType.startsWith('image/')?<img src={data.mediaPreview.dataUrl} alt="Latest generated media"/>:
         <div className="media-empty"><span>{isVideo?'▶':'▧'}</span><small>{data.status==='RUNNING'?'Generating…':isVideo?'Video preview will appear here':'Add a reference image or run this node'}</small></div>}
      </div>
      <div className="node-provider"><span className="provider-spark">✦</span>{String((props.data as FlowNodeData & {provider?:string}).provider??'Local · Mock')}</div>
    </>:<div className="node-summary">{definition.description}</div>}
    {(definition.inputs.length>0||definition.outputs.length>0)&&<div className="studio-node-ports">
      <div className="studio-port-column">{definition.inputs.map(port=><div className="studio-port-row" key={port.id}><Handle type="target" position={Position.Left} id={port.id} className="typed-handle input-handle" style={{background:tint}}/><span>{port.id}{port.required?' *':''}</span></div>)}</div>
      <div className="studio-port-column studio-outputs">{definition.outputs.map(port=><div className="studio-port-row" key={port.id}><span>{port.id}</span><Handle type="source" position={Position.Right} id={port.id} className="typed-handle output-handle" style={{background:tint}}/></div>)}</div>
    </div>}
    <span className="studio-node-id">{props.id}</span>
  </div>;
}
export default memo(FlowNode);
