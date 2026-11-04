import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { extname, join, resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { ZnithDatabase } from '@znith/database';
import { LocalScheduler, secureArtifactPath } from '@znith/local-runner';
import { graphSchema } from '@znith/contracts';
import { validateGraph } from '@znith/workflow-engine';

let database:ZnithDatabase;
let scheduler:LocalScheduler;
let mainWindow:BrowserWindow|null=null;
const idSchema=z.string().uuid();
const projectNameSchema=z.string().trim().min(1).max(100);
const revisionSchema=z.number().int().positive();

async function createWindow():Promise<void> {
  mainWindow = new BrowserWindow({
    width:1480,height:900,minWidth:1024,minHeight:640,
    backgroundColor:'#0e1018',
    show:false,
    webPreferences:{
      preload:join(__dirname,'preload.js'),
      contextIsolation:true,nodeIntegration:false,sandbox:true,
    },
  });
  mainWindow.once('ready-to-show',()=>mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({url})=>{
    if(url.startsWith('https://')) void shell.openExternal(url);
    return {action:'deny'};
  });
  mainWindow.webContents.on('will-navigate',event=>event.preventDefault());
  const devServer=process.env.ZNITH_DEV_SERVER;
  if(devServer && app.isPackaged===false) await mainWindow.loadURL(devServer);
  else await mainWindow.loadFile(join(__dirname,'../dist/index.html'));
}
function registerIPC():void {
  ipcMain.handle('files:pick-image',async()=>{
    const result=await dialog.showOpenDialog(mainWindow!,{title:'Choose a reference image',properties:['openFile'],filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}]});
    return result.canceled?null:result.filePaths[0]??null;
  });
  ipcMain.handle('projects:list',()=>database.listProjects());
  ipcMain.handle('projects:create',(_e,name:unknown)=>database.createProject(projectNameSchema.parse(name)));
  ipcMain.handle('projects:open',(_e,id:unknown)=>database.openProject(idSchema.parse(id)));
  ipcMain.handle('workflows:list',()=>database.listWorkflows());
  ipcMain.handle('workflows:open',(_e,id:unknown)=>database.openWorkflow(idSchema.parse(id)));
  ipcMain.handle('workflows:create',(_e,projectId:unknown,name:unknown)=>database.createWorkflow(idSchema.parse(projectId),projectNameSchema.parse(name)));
  ipcMain.handle('workflows:rename',(_e,id:unknown,name:unknown)=>database.renameWorkflow(idSchema.parse(id),projectNameSchema.parse(name)));
  ipcMain.handle('workflows:duplicate',(_e,id:unknown,name:unknown)=>database.duplicateWorkflow(idSchema.parse(id),projectNameSchema.parse(name)));
  ipcMain.handle('workflows:delete',(_e,id:unknown)=>database.deleteWorkflow(idSchema.parse(id)));
  ipcMain.handle('workflows:validate',(_e,graph:unknown)=>validateGraph(graph));
  ipcMain.handle('workflows:save',(_e,id:unknown,graph:unknown,revision:unknown)=>
    database.saveWorkflow(idSchema.parse(id),graphSchema.parse(graph),revisionSchema.parse(revision)));
  ipcMain.handle('runs:start',(_e,id:unknown,nodeId:unknown)=>scheduler.startRun(idSchema.parse(id),nodeId===undefined?undefined:z.string().min(1).max(100).parse(nodeId)));
  ipcMain.handle('runs:latest',(_e,id:unknown)=>database.latestRunId(idSchema.parse(id)));
  ipcMain.handle('runs:get',(_e,id:unknown)=>database.getRun(idSchema.parse(id)));
  ipcMain.handle('runs:cancel',(_e,id:unknown)=>scheduler.cancelRun(idSchema.parse(id)));
  ipcMain.handle('runs:retry',(_e,id:unknown)=>scheduler.retryNode(idSchema.parse(id)));
  ipcMain.handle('runs:approve',(_e,id:unknown,approved:unknown)=>scheduler.approveNode(idSchema.parse(id),z.boolean().parse(approved)));
  ipcMain.handle('artifacts:reveal',(_e,id:unknown)=>{
    const artifact=database.findArtifact(idSchema.parse(id));
    if(!artifact)throw new Error('Artifact missing');
    const project=database.listProjects().find(p=>p.id===artifact.projectId);
    if(!project)throw new Error('Project missing');
    shell.showItemInFolder(secureArtifactPath(project.rootPath,artifact.relativePath));
  });
  ipcMain.handle('artifacts:read-text',async(_e,id:unknown)=>{
    const row=database.findArtifact(idSchema.parse(id));
    if(!row) throw new Error('Artifact missing');
    const project=database.listProjects().find(p=>p.id===row.projectId);
    if(!project) throw new Error('Project missing');
    const absolute=secureArtifactPath(project.rootPath,row.relativePath);
    const content=await readFile(absolute);
    if(content.byteLength>2*1024*1024) throw new Error('Preview is limited to 2 MiB');
    return content.toString('utf8');
  });
  ipcMain.handle('artifacts:preview',async(_e,id:unknown)=>{
    const row=database.findArtifact(idSchema.parse(id));
    if(!row || !['image','video','audio','film'].includes(row.type))throw new Error('Media artifact missing');
    const project=database.listProjects().find(p=>p.id===row.projectId);
    if(!project)throw new Error('Project missing');
    const absolute=secureArtifactPath(project.rootPath,row.relativePath);
    const content=await readFile(absolute);
    if(content.byteLength>8*1024*1024)throw new Error('Inline preview is limited to 8 MiB');
    const ext=extname(row.relativePath).toLowerCase();
    const mimeTypes:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm','.wav':'audio/wav','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
    const mimeType=mimeTypes[ext];
    if(!mimeType)throw new Error('Unsupported media preview format');
    return {mimeType,dataUrl:`data:${mimeType};base64,${content.toString('base64')}`};
  });
}
app.whenReady().then(async()=>{
  const databaseFile=join(app.getPath('userData'),'znith.sqlite');
  const projectsRoot=join(app.getPath('documents'),'Znith Projects');
  database=new ZnithDatabase(databaseFile,projectsRoot);
  database.ensureDemo();
  scheduler=new LocalScheduler(database);
  scheduler.on('change',event=>mainWindow?.webContents.send('runs:event',event));
  registerIPC();
  scheduler.start();
  await createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();});
}).catch(error=>{console.error('[znith] Desktop initialization failed',error);app.quit();});
let shutdownStarted=false;
let shutdownFinished=false;
app.on('before-quit',event=>{
  if(shutdownFinished) return;
  event.preventDefault();
  if(shutdownStarted) return;
  shutdownStarted=true;
  scheduler?.stop();
  void (async()=>{
    try { await scheduler?.waitForIdle(); }
    finally { database?.close();shutdownFinished=true;app.quit(); }
  })();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
