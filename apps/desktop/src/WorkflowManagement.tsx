import { useEffect, useMemo, useState } from 'react';
import type { ProjectSummary, WorkflowSummary } from '@znith/contracts';

type Props={onOpen:(id:string)=>void};
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
  const create=async()=>{
    const name=window.prompt('Workflow name','New Workflow');
    if(!name?.trim())return;
    setBusy(true);setMessage('');
    try{
      let projectId=projects[0]?.id;
      if(!projectId) {
        const first=await window.znith.projects.create('My Project');
        const created=await window.znith.workflows.create(first.project.id,name.trim());
        await window.znith.workflows.delete(first.project.workflowId);
        await refresh();onOpen(created.project.workflowId);return;
      }
      const created=await window.znith.workflows.create(projectId,name.trim());
      await refresh();onOpen(created.project.workflowId);
    }catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  const run=async(row:WorkflowSummary)=>{
    setBusy(true);setMessage('');
    try{await window.znith.runs.start(row.id);setMessage(`Started “${row.name}”. Open the workflow to follow its run.`);await refresh();}
    catch(e){setMessage(String(e));}finally{setBusy(false);}
  };
  const rename=async(row:WorkflowSummary)=>{
    const name=window.prompt('Rename workflow',row.name);
    if(!name?.trim()||name===row.name)return;
    try{await window.znith.workflows.rename(row.id,name.trim());await refresh();}catch(e){setMessage(String(e));}
  };
  const duplicate=async(row:WorkflowSummary)=>{
    const name=window.prompt('Name for the copy',`${row.name} copy`);
    if(!name?.trim())return;
    try{const copy=await window.znith.workflows.duplicate(row.id,name.trim());await refresh();onOpen(copy.project.workflowId);}catch(e){setMessage(String(e));}
  };
  const remove=async(row:WorkflowSummary)=>{
    if(!window.confirm(`Delete “${row.name}” and its run history?`))return;
    try{await window.znith.workflows.delete(row.id);await refresh();setMessage(`Deleted “${row.name}”.`);}catch(e){setMessage(String(e));}
  };
  return <div className="management-shell">
    <header className="management-topbar"><div className="brand"><span className="brand-mark">✦</span><b>ZNITH</b><span className="brand-sub">AI VISUAL WORKFLOW STUDIO</span></div><span className="tag">LOCAL-FIRST · DESKTOP</span></header>
    <main className="management-content">
      <div className="management-title"><div><div className="eyebrow">WORKSPACE</div><h1>Workflows</h1><p>Create, connect and run AI workflows in the visual editor.</p></div><button className="run-button" disabled={busy} onClick={()=>void create()}>＋ New workflow</button></div>
      <div className="management-toolbar"><label className="search-box"><span>⌕</span><input aria-label="Search workflows" placeholder="Search workflows or projects" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label><select className="field compact-select" aria-label="Filter by run status" value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">All statuses</option>{Object.entries(statusLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select><select className="field compact-select" aria-label="Sort workflows" value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></div>
      <div className="workflow-table-wrap"><table className="workflow-table"><thead><tr><th>Workflow</th><th>Project</th><th>Nodes</th><th>Last run</th><th>Updated</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>
        {visible.map(row=><tr key={row.id}><td><button className="workflow-name" onClick={()=>onOpen(row.id)}>{row.name}</button><span className="revision-label">Revision {row.revision}</span></td><td>{row.projectName}</td><td>{row.nodeCount}</td><td><span className={`table-status ${(row.lastRunStatus??'idle').toLowerCase()}`}><i/>{row.lastRunStatus?statusLabels[row.lastRunStatus]??row.lastRunStatus:'Not run'}</span><small className="date-subline">{formatDate(row.lastRunAt)}</small></td><td>{formatDate(row.updatedAt)}</td><td><div className="row-actions"><button title="Edit workflow" aria-label={`Edit ${row.name}`} onClick={()=>onOpen(row.id)}>Edit</button><button title="Run or restart workflow" aria-label={`${row.lastRunId?'Restart':'Run'} ${row.name}`} disabled={busy} onClick={()=>void run(row)}>{row.lastRunId?'Restart':'Run'}</button><button title="Rename workflow" aria-label={`Rename ${row.name}`} onClick={()=>void rename(row)}>Rename</button><button title="Duplicate workflow" aria-label={`Duplicate ${row.name}`} onClick={()=>void duplicate(row)}>Duplicate</button><button className="danger-action" title="Delete workflow" aria-label={`Delete ${row.name}`} onClick={()=>void remove(row)}>Delete</button></div></td></tr>)}
        {visible.length===0&&<tr><td colSpan={6} className="empty-table">{query||status!=='all'?'No workflows match these filters.':'No workflows yet. Create one to get started.'}</td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>{filtered.length} workflow{filtered.length===1?'':'s'} · Page {page} of {pageCount}</span><div><button className="ghost" disabled={page<=1} onClick={()=>setPage(page-1)}>Previous</button><button className="ghost" disabled={page>=pageCount} onClick={()=>setPage(page+1)}>Next</button></div></div>
      {message&&<div className="management-message" role="status">{message}</div>}
      <div className="management-footnote"><span className="status-dot"/> Workflows are saved locally. Each AI node runs through its configured local or cloud provider.</div>
    </main>
  </div>;
}
