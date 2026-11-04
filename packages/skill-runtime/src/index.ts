/**
 * Znith film skills are structured task adapters, not arbitrary shell commands.
 * Upstream shuohao-skills SKILL.md instructions can be loaded separately once pinned.
 * These adapters provide stable local output contracts for the film canvas.
 */
export type FilmSkill = 'novel-outline'|'novel-script'|'novel-characters'|'novel-storyboard';
export interface SkillSpec {
  id: FilmSkill;
  label: string;
  instructions: string;
}
export const FILM_SKILLS: Record<FilmSkill, SkillSpec> = {
  'novel-outline': {
    id:'novel-outline', label:'Film outline',
    instructions:'You are an expert short-film story editor. Generate a structured film outline. Required JSON keys: title (string), premise (string), beats (array of 4-8 objects with title, action). Keep pacing suitable for a 30-60 second film. Maintain character and location consistency.',
  },
  'novel-script': {
    id:'novel-script',label:'Film screenplay',
    instructions:'You are a screenplay writer. Return JSON with title (string), scenes (array of objects with scene, heading, action, dialogue). Aim for 30-60 seconds total, concise dialogue, and precise visual action.',
  },
  'novel-characters': {
    id:'novel-characters',label:'Character bible',
    instructions:'You are a character designer. Return JSON with characters (array of objects with id, name, description, clothing, appearance, referencePrompt). Maintain consistent looks throughout the short film.',
  },
  'novel-storyboard': {
    id:'novel-storyboard',label:'Shot storyboard',
    instructions:'You are a film storyboard artist. Return JSON with shots (array of 4-8 objects with id, index, durationSeconds, description, camera, imagePrompt, videoPrompt). Make total duration 30-60 seconds. Provide a clear image-to-video action for each shot. Avoid inconsistent character details.',
  },
};
export function skillForNode(nodeType: string): SkillSpec | null {
  const lookup: Record<string,FilmSkill> = {
    'film.outline':'novel-outline',
    'film.script':'novel-script',
    'film.characters':'novel-characters',
    'film.storyboard':'novel-storyboard',
  };
  const id=lookup[nodeType];
  return id ? FILM_SKILLS[id] : null;
}
export function validateSkillOutput(id: FilmSkill, output: Record<string,unknown>): void {
  const required: Record<FilmSkill,string> = {
    'novel-outline':'beats',
    'novel-script':'scenes',
    'novel-characters':'characters',
    'novel-storyboard':'shots',
  };
  const key=required[id];
  if (!Array.isArray(output[key]) || (output[key] as unknown[]).length===0) throw new Error(`${id} must return a nonempty ${key} array`);
  if(id==='novel-storyboard') {
    const shots=output.shots as Record<string,unknown>[];
    if(shots.length<4 || shots.length>8) throw new Error('Storyboard must contain 4-8 shots for the MVP');
    const length=shots.reduce((total,shot)=>total+Number(shot.durationSeconds??0),0);
    if(!Number.isFinite(length) || length<30 || length>60) throw new Error('Storyboard total duration must be 30-60 seconds');
    for(const [index,shot] of shots.entries()) {
      if(!shot.id || typeof shot.description!=='string') throw new Error(`Shot ${index} missing id/description`);
    }
  }
}
