import type { WorkflowDefinition } from './types'

const node = (
  id: string,
  type: string,
  name: string,
  x: number,
  y: number,
  config: Record<string, unknown> = {},
) => ({ id, type, name, slug: id, position: { x, y }, config })

const edge = (source: string, sourceHandle: string, target: string, targetHandle: string) => ({
  id: `${source}-${target}`,
  source,
  sourceHandle,
  target,
  targetHandle,
})

export const workflowTemplates: Record<
  string,
  { name: string; description: string; category: string; definition: WorkflowDefinition }
> = {
  blank: {
    name: 'Untitled workflow',
    description: 'A new visual AI workflow.',
    category: 'custom',
    definition: { version: 1, nodes: [], edges: [] },
  },
  story: {
    name: 'AI Story Production',
    description: 'Turn a story idea into a structured narrative and script.',
    category: 'story',
    definition: {
      version: 1,
      nodes: [
        node('idea', 'input.prompt', 'Story idea', 80, 180, {
          value: 'A botanist discovers a city growing beneath the desert.',
        }),
        node('story', 'ai.generate-text', 'Generate story', 430, 120, {
          model: 'gpt-4o-mini',
          systemPrompt: 'Write a vivid short story.',
          temperature: 0.8,
        }),
        node('scriptPrompt', 'processing.template', 'Script prompt', 760, 180, {
          template: 'Convert this story into a screenplay with scenes:\\n\\n{{input}}',
        }),
        node('script', 'ai.generate-text', 'Generate script', 1090, 120, {
          model: 'gpt-4o-mini',
          systemPrompt: 'You are an expert screenwriter.',
          temperature: 0.5,
        }),
        node('preview', 'output.preview', 'Final script', 1420, 180),
      ],
      edges: [
        edge('idea', 'prompt', 'story', 'prompt'),
        edge('story', 'text', 'scriptPrompt', 'input'),
        edge('scriptPrompt', 'text', 'script', 'prompt'),
        edge('script', 'text', 'preview', 'input'),
      ],
    },
  },
  creative: {
    name: 'AI Product Creative',
    description: 'A provider-ready product creative pipeline.',
    category: 'creative',
    definition: {
      version: 1,
      nodes: [
        node('brief', 'input.prompt', 'Creative brief', 80, 160, {
          value: 'Premium studio photograph of a ceramic speaker.',
        }),
        node('prompt', 'ai.generate-text', 'Refine prompt', 430, 160, {
          model: 'gpt-4o-mini',
          systemPrompt: 'Write a concise production-ready image prompt.',
          temperature: 0.6,
        }),
        node('image', 'ai.generate-image', 'Generate image', 780, 160),
        node('layout', 'processing.compose-layout', 'Compose layout', 1130, 160),
        node('save', 'output.save-image', 'Save image', 1480, 160),
      ],
      edges: [edge('brief', 'prompt', 'prompt', 'prompt')],
    },
  },
  video: {
    name: 'AI Video Production',
    description: 'A provider-ready text-to-video production pipeline.',
    category: 'video',
    definition: {
      version: 1,
      nodes: [
        node('brief', 'input.prompt', 'Video prompt', 80, 160, {
          value: 'A glass perfume bottle floating through a cloud chamber.',
        }),
        node('image', 'ai.generate-image', 'Generate keyframe', 430, 160),
        node('video', 'ai.image-to-video', 'Animate keyframe', 780, 160),
        node('save', 'output.save-video', 'Save video', 1130, 160),
      ],
      edges: [],
    },
  },
}
