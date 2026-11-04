import { z } from 'zod';
import type { ArtifactType, NodeDefinition, PortDefinition, WorkflowGraph } from '@znith/contracts';

const port = (id: string, type: ArtifactType, required = true, multiple = false): PortDefinition => ({ id, type, required, multiple });
const make = (
  type: string, label: string, category: NodeDefinition['category'],
  inputs: PortDefinition[], outputs: PortDefinition[],
  configSchema: z.ZodTypeAny = z.object({}).passthrough(),
): NodeDefinition => ({
  type, label, category, inputs, outputs, configSchema, version: '0.2.0',
  description: `${label} — Znith local-first pipeline node`,
  executorId: `znith:${type}`, cacheable: type !== 'logic.approval',
});
export const NODE_DEFINITIONS: NodeDefinition[] = [
  make('film.story-input', 'Text Prompt', 'input', [], [port('story', 'story')], z.object({ prompt: z.string().min(1) })),
  make('film.outline', 'Outline Agent', 'skill', [port('story', 'story')], [port('outline', 'outline')]),
  make('film.script', 'Script Agent', 'skill', [port('story', 'story', false), port('outline', 'outline', false)], [port('script', 'script')]),
  make('film.characters', 'Character Bible', 'skill', [port('outline', 'outline')], [port('characters', 'character-bible')]),
  make('film.storyboard', 'Storyboard Agent', 'skill', [port('script', 'script'), port('characters', 'character-bible', false)], [port('shots', 'shot-list')]),
  make('logic.approval', 'Approval Gate', 'logic', [port('shots', 'shot-list')], [port('approved', 'shot-list')]),
  make('logic.batch-shots', 'Batch Shots', 'logic', [port('shots', 'shot-list')], [port('tasks', 'shot-tasks')]),
  make('media.image-reference', 'Image / Video Reference', 'input', [], [port('image', 'image')], z.object({sourcePath:z.string().optional()})),
  make('media.image-generate', 'Image Generator', 'media', [port('task', 'shot-tasks', false),port('prompt','story',false),port('reference','image',false,true)], [port('image', 'image')]),
  make('media.video-generate', 'Video Generator', 'media', [port('image', 'image',true,true), port('task', 'shot-tasks', false),port('prompt','story',false)], [port('video', 'video')]),
  make('logic.collect-clips', 'Collect Clips', 'logic', [port('video', 'video', true, true)], [port('clips', 'clip-collection')]),
  make('media.audio-generate', 'Audio Generator', 'media', [port('script', 'script')], [port('audio', 'audio')]),
  make('media.film-export', 'Film Export', 'media', [port('clips', 'clip-collection'), port('audio', 'audio', false)], [port('film', 'film')]),
];
export const NODE_REGISTRY = new Map(NODE_DEFINITIONS.map(d => [d.type, d]));
export function makeEmptyGraph(): WorkflowGraph { return {schemaVersion:2,nodes:[],edges:[]}; }
export function makeDemoGraph(): WorkflowGraph {
  return {
    schemaVersion: 2,
    nodes: [
      { id: 'story', type: 'film.story-input', position: { x: 60, y: 165 }, config: { prompt: 'Một phi hành gia tìm thấy bông hoa cuối cùng trên Mặt Trăng.' }, runtime: 'local' },
      { id: 'script', type: 'film.script', position: { x: 390, y: 165 }, config: {executionMode:'mock'}, runtime: 'local' },
      { id: 'storyboard', type: 'film.storyboard', position: { x: 720, y: 165 }, config: {executionMode:'mock'}, runtime: 'local' },
    ],
    edges: [
      { id: 'story-script', source: 'story', sourceHandle: 'story', target: 'script', targetHandle: 'story' },
      { id: 'script-storyboard', source: 'script', sourceHandle: 'script', target: 'storyboard', targetHandle: 'script' },
    ],
  };
}
