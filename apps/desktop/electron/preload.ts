import { contextBridge, ipcRenderer } from 'electron';
import type { ZnithAPI, RunEvent, WorkflowGraph } from '@znith/contracts';
const bridge:ZnithAPI={
  files:{pickImage:()=>ipcRenderer.invoke('files:pick-image')},
  projects:{
    list:()=>ipcRenderer.invoke('projects:list'),
    create:(name:string)=>ipcRenderer.invoke('projects:create',name),
    open:(id:string)=>ipcRenderer.invoke('projects:open',id),
  },
  workflows:{
    list:()=>ipcRenderer.invoke('workflows:list'),
    open:(id:string)=>ipcRenderer.invoke('workflows:open',id),
    create:(projectId:string,name:string)=>ipcRenderer.invoke('workflows:create',projectId,name),
    rename:(id:string,name:string)=>ipcRenderer.invoke('workflows:rename',id,name),
    duplicate:(id:string,name:string)=>ipcRenderer.invoke('workflows:duplicate',id,name),
    delete:(id:string)=>ipcRenderer.invoke('workflows:delete',id),
    save:(id:string,graph:WorkflowGraph,expectedRevision:number)=>ipcRenderer.invoke('workflows:save',id,graph,expectedRevision),
    validate:(graph:WorkflowGraph)=>ipcRenderer.invoke('workflows:validate',graph),
  },
  runs:{
    start:(workflowId:string,nodeId?:string)=>ipcRenderer.invoke('runs:start',workflowId,nodeId),
    latest:(workflowId:string)=>ipcRenderer.invoke('runs:latest',workflowId),
    get:(id:string)=>ipcRenderer.invoke('runs:get',id),
    cancel:(id:string)=>ipcRenderer.invoke('runs:cancel',id),
    retryNode:(id:string)=>ipcRenderer.invoke('runs:retry',id),
    approveNode:(id:string,approved:boolean)=>ipcRenderer.invoke('runs:approve',id,approved),
    subscribe:(runId:string,callback:(event:RunEvent)=>void)=>{
      const listener=(_event:Electron.IpcRendererEvent,payload:RunEvent)=>{
        if(payload && payload.runId===runId) callback(payload);
      };
      ipcRenderer.on('runs:event',listener);
      return ()=>ipcRenderer.removeListener('runs:event',listener);
    },
  },
  artifacts:{readText:(id:string)=>ipcRenderer.invoke('artifacts:read-text',id),preview:(id:string)=>ipcRenderer.invoke('artifacts:preview',id),reveal:(id:string)=>ipcRenderer.invoke('artifacts:reveal',id)},
};
contextBridge.exposeInMainWorld('znith',bridge);
