import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { ProjectSummary, WorkflowSummary } from '@znith/contracts';

type Props={onOpen:(id:string)=>void};
type DialogState={kind:'create'|'rename'|'duplicate'|'delete';row?:WorkflowSummary}|null;
const statusLabels:Record<string,string>={SUCCEEDED:'Succeeded',FAILED:'Failed',RUNNING:'Running',WAITING_APPROVAL:'Needs approval',CANCELLED:'Cancelled',PENDING:'Queued',READY:'Ready',SKIPPED:'Skipped'};
const formatDate=(value:number|null)=>value?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(value):'—';

export default function WorkflowManagement({onOpen}:Props) {
  const [rows,setRows]=useState<WorkflowSummary[]>([]);
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('all');
  const [sort,setSort]=useState<'updated'|'name'>('updated');
  const [page,setPage]=useState(1);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [dialog,setDialog]=useState<DialogState>(null);
  const [dialogName,setDialogName]=useState('');
  const pageSize=8;

  const refresh=async()=>{
    const [workflows,projectList]=await Promise.all([window.znith.workflows.list(),window.znith.projects.list()]);
    setRows(workflows);setProjects(projectList);
  };
  useEffect(()=>{
    let alive=true;
    const update=()=>void refresh().catch(e=>{if(alive)setMessage(String(e));});
    update();
    const timer=setInterval(update,2000);
    return()=>{alive=false;clearInterval(timer);};
  },[]);
  const filtered=useMemo(()=>{
    const text=query.trim().toLocaleLowerCase();
    const found=rows.filter(row=>(!text||`${row.name} ${row.projectName}`.toLocaleLowerCase().includes(text))&&(status==='all'||row.lastRunStatus===status));
    return found.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):b.updatedAt-a.updatedAt);
  },[rows,query,status,sort]);
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  const visible=filtered.slice((page-1)*pageSize,page*pageSize);

  const openDialog=(kind:NonNullable<DialogState>['kind'],row?:WorkflowSummary)=>{
    setMessage('');setDialog({kind,row});
    setDialogName(kind==='rename'?row?.name??'':kind==='duplicate'?`${row?.name??'Workflow'} copy`:'New Workflow');
  };
  const closeDialog=()=>{if(!busy)setDialog(null);};
  const submitDialog=async(event:FormEvent)=>{
    event.preventDefault();
    if(!dialog)return;
    if(dialog.kind!=='delete'&&!dialogName.trim())return;
    setBusy(true);setMessage('');
    try{
      if(dialog.kind==='create'){
        let projectId=projects[0]?.id;
        if(!projectId){
          const first=await window.znith.projects.create('My Project');
          await window.znith.workflows.rename(first.project.workflowId,dialogName.trim());
          await refresh();setDialog(null);onOpen(first.project.workflowId);return;
        }
        const created=await window.znith.workflows.create(projectId,dialogName.trim());
        await refresh();setDialog(null);onOpen(created.project.workflowId);return;
      }
      if(dialog.kind==='rename'&&dialog.row){
        await window.znith.workflows.rename(dialog.row.id,dialogName.trim());
        setMessage(`Renamed to “${dialogName.trim()}”.`);
      }else if(dialog.kind==='duplicate'&&dialog.row){
        const copy=await window.znith.workflows.duplicate(dialog.row.id,dialogName.trim());
        await refresh();setDialog(null);onOpen(copy.project.workflowId);return;
      }else if(dialog.kind==='delete'&&dialog.row){
        await window.znith.workflows.delete(dialog.row.id);
        setMessage(`Deleted “${dialog.row.name}”.`);
      }
      await refresh();setDialog(null);
    }catch(e){setMessage(String(e));}
    finally{setBusy(false);}
  };
  const run=async(row:WorkflowSummary)=>{
    setBusy(true);setMessage('');
    try{await window.znith.runs.start(row.id);setMessage(`Started “${row.name}”. Open the workflow to follow its run.`);await refresh();}
    catch(e){setMessage(String(e));}finally{setBusy(false);}
  };

  return <div className="management-shell">
    <header className="management-topbar"><div className="brand"><span className="brand-mark">✦</span><b>ZNITH</b><span className="brand-sub">AI VISUAL WORKFLOW STUDIO</span></div><span className="tag">LOCAL-FIRST · DESKTOP</span></header>
    <main className="management-content">
      <div className="management-title"><div><div className="eyebrow">WORKSPACE</div><h1>Workflows</h1><p>Create, connect and run AI workflows in the visual editor.</p></div><button className="run-button" disabled={busy} onClick={()=>openDialog('create')}>＋ New workflow</button></div>
      <div className="management-toolbar"><label className="search-box"><span>⌕</span><input aria-label="Search workflows" placeholder="Search workflows or projects" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><select className="field compact-select" aria-label="Filter by run status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select><select className="field compact-select" aria-label="Sort workflows" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></div>
      <div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>Workflow</th><th>Project</th><th>Nodes</th><th>Last run</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {visible.map(row=><tr key={row.id}><td><button className="workflow-name" onClick={()=>onOpen(row.id)}>{row.name}</button><span className="revision-label">Revision {row.revision}</span></td><td>{row.projectName}</td><td>{row.nodeCount}</td><td><span className={`table-status ${(row.lastRunStatus??'idle').toLowerCase()}`}><i/>{row.lastRunStatus?statusLabels[row.lastRunStatus]??row.lastRunStatus:'Not run'}</span><small className="date-subline">{formatDate(row.lastRunAt)}</small></td><td>{formatDate(row.updatedAt)}</td><td><div className="row-actions"><button title="Edit workflow" aria-label={`Edit ${row.name}`} onClick={()=>onOpen(row.id)}>Edit</button><button title="Run or restart workflow" aria-label={`${row.lastRunId?'Restart':'Run'} ${row.name}`} disabled={busy} onClick={()=>void run(row)}>{row.lastRunId?'Restart':'Run'}</button><button title="Rename workflow" aria-label={`Rename ${row.name}`} onClick={()=>openDialog('rename',row)}>Rename</button><button title="Duplicate workflow" aria-label={`Duplicate ${row.name}`} onClick={()=>openDialog('duplicate',row)}>Duplicate</button><button className="danger-action" title="Delete workflow" aria-label={`Delete ${row.name}`} onClick={()=>openDialog('delete',row)}>Delete</button></div></td></tr>)}
        {visible.length===0&&<tr><td colSpan={6} className="empty-table">{query||status!=='all'?'No workflows match these filters.':'No workflows yet. Create one to get started.'}</td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>{filtered.length} workflow{filtered.length===1?'':'s'} · Page {page} of {pageCount}</span><div><button className="ghost" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><button className="ghost" disabled={page>=pageCount} onClick={()=>setPage(page+1)}>Next</button></div></div>
      {message&&<div className="management-message" role="status">{message}</div>}
      <div className="management-footnote"><span className="status-dot"/> Workflows are saved locally. Each AI node runs through its configured local or cloud provider.</div>
    </main>
    {dialog&&<div className="dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeDialog();}}><form className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="workflow-dialog-title" onSubmit={e=>void submitDialog(e)}>
      <div className="dialog-heading"><div><span className="eyebrow">WORKFLOW</span><h2 id="workflow-dialog-title">{dialog.kind==='create'?'Create workflow':dialog.kind==='rename'?'Rename workflow':dialog.kind==='duplicate'?'Duplicate workflow':'Delete workflow'}</h2></div><button type="button" className="drawer-close" aria-label="Close dialog" onClick={closeDialog}>×</button></div>
      {dialog.kind==='delete'?<p className="dialog-copy">Delete “{dialog.row?.name}” and its run history? This action cannot be undone.</p>:<label className="dialog-label">Name<input autoFocus className="field" maxLength={100} value={dialogName} onChange={e=>setDialogName(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();closeDialog();}}} placeholder="Workflow name"/></label>}
      {message&&<p className="dialog-error" role="alert">{message}</p>}
      <div className="dialog-actions"><button type="button" className="ghost" disabled={busy} onClick={closeDialog}>Cancel</button><button className={dialog.kind==='delete'?'dialog-danger':'run-button'} disabled={busy||(dialog.kind!=='delete'&&!dialogName.trim())}>{busy?'Working…':dialog.kind==='delete'?'Delete':dialog.kind==='create'?'Create workflow':dialog.kind==='rename'?'Save name':'Create copy'}</button></div>
    </form></div>}
  </div>;
}
