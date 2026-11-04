import { contextBridge, ipcRenderer } from 'electron';
import type { ZnithAPI, RunEvent, WorkflowGraph } from '@znith/contracts';
const bridge:ZnithAPI={
  projects:{
    list:()=>ipcRenderer.invoke('projects:list'),
    create:(name:string)=>ipcRenderer.invoke('projects:create',name),
    open:(id:string)=>ipcRenderer.invoke('projects:open',id),
  },
  workflows:{
    save:(id:string,graph:WorkflowGraph,expectedRevision:number)=>ipcRenderer.invoke('workflows:save',id,graph,expectedRevision),
    validate:(graph:WorkflowGraph)=>ipcRenderer.invoke('workflows:validate',graph),
  },
  runs:{
    start:(workflowId:string)=>ipcRenderer.invoke('runs:start',workflowId),
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
  artifacts:{readText:(id:string)=>ipcRenderer.invoke('artifacts:read-text',id),reveal:(id:string)=>ipcRenderer.invoke('artifacts:reveal',id)},
};
contextBridge.exposeInMainWorld('znith',bridge);
