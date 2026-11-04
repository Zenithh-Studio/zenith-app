/**
 * Local-first AI adapters. Providers never read renderer-supplied secrets.
 * Ollama and ComfyUI endpoints are restricted to loopback by default.
 */
export function localEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) {
    throw new Error('Local AI endpoint must use http://localhost or http://127.0.0.1');
  }
  return url.origin;
}
async function requestJson(url: string, init: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Provider HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return response.json();
}
export function parseModelJSON(value: string): Record<string, unknown> {
  const clean = value.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\s*\`\`\`$/, '');
  const parsed: unknown = JSON.parse(clean);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('AI provider did not return a JSON object');
  }
  return parsed as Record<string, unknown>;
}
export class OllamaClient {
  readonly baseURL: string;
  constructor(baseURL = 'http://127.0.0.1:11434') {
    this.baseURL = localEndpoint(baseURL);
  }
  async availableModels(signal?: AbortSignal): Promise<string[]> {
    const data = await requestJson(this.baseURL + '/api/tags', { signal });
    return Array.isArray(data.models) ? data.models.map((x: {name:string}) => x.name) : [];
  }
  async generateJSON(model: string, instructions: string, input: unknown, signal?: AbortSignal): Promise<Record<string,unknown>> {
    if (!model || !/^[a-zA-Z0-9_.:\/-]+$/.test(model)) throw new Error('Configure a valid Ollama model name');
    const data = await requestJson(this.baseURL + '/api/chat', {
      method: 'POST',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        model, stream: false, format: 'json',
        options: {temperature: 0.35},
        messages: [
          {role: 'system', content: instructions + '\nReturn ONLY one valid JSON object.'},
          {role: 'user', content: JSON.stringify(input)},
        ],
      }),
      signal,
    });
    if (typeof data?.message?.content !== 'string') throw new Error('Ollama returned no message content');
    return parseModelJSON(data.message.content);
  }
}
export class OpenAICompatibleClient {
  constructor(private readonly apiKey: string, private readonly baseURL = 'https://api.openai.com/v1') {
    if (!apiKey) throw new Error('Cloud LLM key missing. Set ZNITH_CLOUD_LLM_API_KEY in the main process environment.');
    if (new URL(baseURL).protocol !== 'https:') throw new Error('Cloud AI endpoint must use HTTPS');
  }
  async generateJSON(model: string, instructions: string, input: unknown, signal?: AbortSignal): Promise<Record<string,unknown>> {
    const data = await requestJson(this.baseURL.replace(/\/$/,'') + '/chat/completions', {
      method: 'POST',
      headers: {'content-type':'application/json', authorization:'Bearer ' + this.apiKey},
      body: JSON.stringify({
        model, temperature:0.35, response_format:{type:'json_object'},
        messages:[{role:'system',content:instructions + '\nReturn valid JSON.'},{role:'user',content:JSON.stringify(input)}],
      }),
      signal,
    });
    const value = data?.choices?.[0]?.message?.content;
    if (typeof value !== 'string') throw new Error('Cloud LLM returned no JSON message');
    return parseModelJSON(value);
  }
}
export interface ComfyOutput {
  filename: string;
  subfolder: string;
  type: string;
}
export function injectWorkflowTokens(template: unknown, values: Record<string,string>): unknown {
  if (typeof template === 'string') {
    return template.replace(/\$ZNITH_[A-Z_]+/g, token => values[token] ?? token);
  }
  if (Array.isArray(template)) return template.map(x=>injectWorkflowTokens(x,values));
  if (template && typeof template === 'object') {
    return Object.fromEntries(Object.entries(template).map(([key,value])=>[key,injectWorkflowTokens(value,values)]));
  }
  return template;
}
export class ComfyUIClient {
  readonly baseURL: string;
  constructor(baseURL = 'http://127.0.0.1:8188') {
    this.baseURL = localEndpoint(baseURL);
  }
  async health(signal?: AbortSignal): Promise<boolean> {
    try { await requestJson(this.baseURL + '/system_stats', {signal}); return true; }
    catch { return false; }
  }
  async uploadImage(bytes: Uint8Array, filename: string, signal?: AbortSignal): Promise<string> {
    const form = new FormData();
    const extension=filename.split('.').at(-1)?.toLowerCase()??'png';
    const mime=({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'} as Record<string,string>)[extension]??'image/png';
    form.set('image', new Blob([new Uint8Array(bytes)], {type:mime}), filename.replace(/[^a-zA-Z0-9_.-]/g,'_'));
    form.set('overwrite', 'false');
    const data = await requestJson(this.baseURL + '/upload/image', {method:'POST',body:form,signal});
    if (typeof data.name !== 'string') throw new Error('ComfyUI image upload returned no filename');
    return data.name;
  }
  async submit(workflow: Record<string,unknown>, signal?: AbortSignal): Promise<string> {
    const data = await requestJson(this.baseURL + '/prompt', {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({prompt:workflow,client_id:'znith-desktop'}),signal,
    });
    if (typeof data.prompt_id !== 'string') throw new Error('ComfyUI did not return prompt_id: ' + JSON.stringify(data).slice(0,200));
    return data.prompt_id;
  }
  async waitForOutputs(promptId: string, signal?: AbortSignal, timeoutMs = 20*60*1000): Promise<ComfyOutput[]> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (signal?.aborted) throw new Error('ComfyUI task cancelled');
      const history = await requestJson(this.baseURL + '/history/' + encodeURIComponent(promptId), {signal});
      const entry = history?.[promptId];
      if (entry) {
        if (entry.status?.status_str === 'error') throw new Error('ComfyUI generation failed: ' + JSON.stringify(entry.status).slice(0,500));
        const files: ComfyOutput[] = [];
        for (const output of Object.values(entry.outputs ?? {}) as any[]) {
          for (const field of ['images','gifs','videos','animated']) {
            if (!Array.isArray(output?.[field])) continue;
            for (const item of output[field]) if (typeof item.filename === 'string') {
              files.push({filename:item.filename,subfolder:item.subfolder??'',type:item.type??'output'});
            }
          }
        }
        if (files.length) return files;
        if (entry.status?.completed) throw new Error('ComfyUI completed without image/video output files');
      }
      await new Promise<void>((resolve,reject)=>{
        const timer=setTimeout(resolve,1000);
        signal?.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('Cancelled'));},{once:true});
      });
    }
    throw new Error('ComfyUI generation timed out; check its queue before retrying');
  }
  async download(file: ComfyOutput, signal?: AbortSignal): Promise<Uint8Array> {
    const query=new URLSearchParams({filename:file.filename,subfolder:file.subfolder,type:file.type});
    const result=await fetch(this.baseURL+'/view?'+query.toString(),{signal});
    if(!result.ok) throw new Error('ComfyUI download failed: '+result.status);
    return new Uint8Array(await result.arrayBuffer());
  }
}
