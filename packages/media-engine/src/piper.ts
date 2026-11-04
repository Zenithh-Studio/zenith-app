import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface PiperOptions {
  text: string;
  modelPath: string;
  output: string;
  signal?: AbortSignal;
}
/** Offline TTS with a locally installed Piper executable and voice ONNX model. */
export async function synthesizePiper(options:PiperOptions):Promise<string> {
  if(!options.modelPath) throw new Error('Piper voice model path is required');
  if(!options.text.trim()) throw new Error('Script contains no spoken dialogue');
  await mkdir(dirname(options.output),{recursive:true});
  const executable=process.env.ZNITH_PIPER_PATH??'piper';
  await new Promise<void>((resolve,reject)=>{
    const child=spawn(executable,['--model',options.modelPath,'--output_file',options.output],{
      stdio:['pipe','ignore','pipe'],signal:options.signal,windowsHide:true,
    });
    let stderr='';
    child.stderr.on('data',(chunk:Buffer)=>{stderr=(stderr+chunk.toString()).slice(-2500);});
    child.once('error',reject);
    child.once('close',code=>code===0?resolve():reject(new Error('Piper failed ('+code+'): '+stderr)));
    child.stdin.end(options.text);
  });
  return options.output;
}
