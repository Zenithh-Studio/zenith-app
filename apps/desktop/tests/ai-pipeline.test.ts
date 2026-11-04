import test from 'node:test';
import assert from 'node:assert/strict';
import { parseModelJSON, localEndpoint, injectWorkflowTokens } from '@znith/providers';
import { skillForNode, validateSkillOutput } from '@znith/skill-runtime';
import { collectClipManifest } from '@znith/local-runner';

test('Ollama structured response extracts JSON safely',()=>{
  assert.deepEqual(parseModelJSON('```json\n{"beats":[1]}\n```'),{beats:[1]});
  assert.throws(()=>parseModelJSON('["not-object"]'));
});
test('local endpoint rejects non-loopback network addresses',()=>{
  assert.equal(localEndpoint('http://127.0.0.1:11434'),'http://127.0.0.1:11434');
  assert.throws(()=>localEndpoint('http://192.168.1.9:8188'));
  assert.throws(()=>localEndpoint('https://example.com'));
});
test('ComfyUI template placeholders expand recursively',()=>{
  const value=injectWorkflowTokens({'1':{inputs:{text:'$ZNITH_PROMPT',nested:['$ZNITH_INPUT_IMAGE']}}},{'$ZNITH_PROMPT':'A flower','$ZNITH_INPUT_IMAGE':'shot.png'});
  assert.deepEqual(value,{'1':{inputs:{text:'A flower',nested:['shot.png']}}});
});
test('film skill registry maps the four narrative nodes',()=>{
  assert.equal(skillForNode('film.storyboard')?.id,'novel-storyboard');
  assert.equal(skillForNode('film.story-input'),null);
  assert.doesNotThrow(()=>validateSkillOutput('novel-script',{scenes:[{action:'Open'}]}));
  assert.throws(()=>validateSkillOutput('novel-script',{scenes:[]}));
  assert.throws(()=>validateSkillOutput('novel-storyboard',{shots:[{id:'1',description:'Too short',durationSeconds:3}]}));
});
test('clip manifest preserves shot order',()=>{
  const manifest=collectClipManifest({video:[
    {relativePath:'video-2.mp4',metadata:{shotIndex:2}},
    {relativePath:'video-1.mp4',metadata:{shotIndex:1}},
  ]}) as {clips:Array<{relativePath:string}>};
  assert.deepEqual(manifest.clips.map(c=>c.relativePath),['video-1.mp4','video-2.mp4']);
});
