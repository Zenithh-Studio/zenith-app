import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface FilmExportOptions { clips: string[]; output: string; fps?: number; signal?: AbortSignal }
export function runFFmpeg(args: string[], signal?: AbortSignal): Promise<void> {
  return new Promise((resolve,reject)=>{
    const p=spawn(process.env.ZNITH_FFMPEG_PATH??'ffmpeg',args,{stdio:'ignore',signal,windowsHide:true});
    p.once('error',reject);
    p.once('close',code=>code===0?resolve():reject(new Error('FFmpeg exited with code '+code)));
  });
}
/** Use a filter graph, not concat stream-copy, so differently encoded clips can be combined. */
export async function exportFilm(options:FilmExportOptions):Promise<string> {
  if(!options.clips.length)throw new Error('No clips to export');
  const fps=options.fps??24;
  if(!Number.isFinite(fps)||fps<=0||fps>120)throw new Error('Invalid FPS');
  await mkdir(dirname(options.output),{recursive:true});
  const args=['-hide_banner','-loglevel','error','-y'];
  for(const source of options.clips)args.push('-i',source);
  const filters=options.clips.map((_,i)=>'['+i+':v]fps='+fps+',scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v'+i+']');
  filters.push(options.clips.map((_,i)=>'[v'+i+']').join('')+'concat=n='+options.clips.length+':v=1:a=0[outv]');
  args.push('-filter_complex',filters.join(';'),'-map','[outv]','-an','-c:v','libx264','-crf','22','-preset','veryfast','-movflags','+faststart',options.output);
  await runFFmpeg(args,options.signal);
  return options.output;
}
