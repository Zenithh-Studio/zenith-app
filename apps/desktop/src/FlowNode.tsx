import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { NODE_REGISTRY } from '@znith/node-registry';
import type { RunStatus } from '@znith/contracts';
const colors:Record<string,string>={
  input:'#60c4c2',skill:'#a489ff',logic:'#f9b55c',media:'#79a4ff',
};
export type FlowNodeData = {label:string;nodeType:string;status?:RunStatus};
function FlowNode(props:NodeProps) {
  const data=props.data as FlowNodeData;
  const definition=NODE_REGISTRY.get(data.nodeType);
  if(!definition) return <div className="flow-node invalid">Unknown: {data.nodeType}</div>;
  const tint=colors[definition.category];
  return <div className={`flow-node ${props.selected?'selected':''}`} style={{'--node-tint':tint} as CSSProperties}>
    <div className="node-topline" />
    <div className="node-header">
      <span className="node-category">{definition.category}</span>
      <span className={`node-indicator ${(data.status||'').toLowerCase()}`} title={data.status||'Idle'} />
    </div>
    <div className="node-title">{definition.label}</div>
    <div className="node-id">{props.id}</div>
    <div className="node-ports">
      <div className="port-column">
        {definition.inputs.map((port,index)=><div className="port-row port-in" key={port.id}>
          <Handle type="target" position={Position.Left} id={port.id}
            style={{position:'absolute',left:-7,top:78+index*24,background:tint,width:10,height:10,border:'2px solid #171923'}} />
          <span>{port.id}{port.required?'*':''}</span>
        </div>)}
      </div>
      <div className="port-column port-outputs">
        {definition.outputs.map((port,index)=><div className="port-row" key={port.id}>
          <span>{port.id}</span>
          <Handle type="source" position={Position.Right} id={port.id}
            style={{position:'absolute',right:-7,top:78+index*24,background:tint,width:10,height:10,border:'2px solid #171923'}} />
        </div>)}
      </div>
    </div>
  </div>;
}
export default memo(FlowNode);
