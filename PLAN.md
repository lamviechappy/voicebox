# Plan: Story-Flow Feature

## Context

Users want to generate multi-speaker stories more efficiently. Currently, Stories mode requires:
- Click Generate → switch speaker → click Generate → add to timeline → repeat

Story-Flow will allow:
- Pre-configure each speaker with name, language, engine, effects
- Paste script with `[SpeakerName] text` format
- Auto-parse, generate in order, add to timeline

## Sample Input Format
```
[Mark] Hello Emily, how are you?
[Emily] I'm fine thanks!
[Lisa] Hi everyone! Great to see you both!
```

## Files to Create (Backend)

### 1. `backend/models.py` — Add new request/response models
- `StoryFlowConfig` — Speaker configs (name, language, engine, effects_chain)
- `StoryFlowScript` — Full script with speaker configs + raw script text
- `StoryFlowRequest` — Request with `script: str` and `speakers: list[SpeakerConfig]`
- `StoryFlowTurn` — Parsed turn (speaker_index, text, speaker_config)
- `StoryFlowResponse` — Generated items with order info

### 2. `backend/services/story_flow.py` (~150 lines)
- `parse_story_script(script: str, speakers: list[SpeakerConfig]) -> list[StoryFlowTurn]`
- `generate_story_flow(script: str, speakers: list[SpeakerConfig], db: Session) -> list[Generation]`
  - Parse script
  - For each turn, call generation service with speaker's config
  - Return list of generated generations in order

### 3. `backend/routes/story_flow.py` (~60 lines)
- POST `/story-flow/generate` — Generate all turns
- GET `/story-flow/parse` — Just parse (for preview)

## Files to Create (Frontend)

### 4. `app/src/components/StoryFlowTab/StoryFlowTab.tsx` (~200 lines)
Main page with:
- Speaker config form (add/remove speakers, each with name, language, engine, effects)
- Script textarea with placeholder showing format
- Parse preview (shows parsed turns)
- "Generate All" button
- Progress indicator during generation
- Results list (can play/delete individual)

### 5. `app/src/lib/hooks/useStoryFlow.ts` (~60 lines)
- `parseScript(script: string, speakers: SpeakerConfig[]): ParsedTurn[]`
- `generateStoryFlow(script: string, speakers: SpeakerConfig[]): Promise<Generation[]>`
- `useStoryFlow()`

### 6. Router and Sidebar updates
- `router.tsx` — Add `/story-flow` route
- `Sidebar.tsx` — Add StoryFlow tab below Stories
- `api/client.ts` — Add API client methods

## Implementation Details

### Script Parsing Logic
```python
import re
TURN_PATTERN = re.compile(r'\[([^\]]+)\]\s*(.+?)(?=\[[^\]]+\]|$)', re.DOTALL)

def parse_script(script: str, speakers: list[SpeakerConfig]) -> list[StoryFlowTurn]:
    turns = []
    for match in TURN_PATTERN.finditer(script):
        speaker_name = match.group(1).strip()
        text = match.group(2).strip()
        # Find speaker config by name
        speaker_config = next(s for s in speakers if s.name == speaker_name)
        if not speaker_config:
            raise ValueError(f"Unknown speaker: {speaker_name}")
        turns.append(StoryFlowTurn(
            speaker_index=speakers.index(speaker_config),
            text=text,
            config=speaker_config,
        ))
    return turns
```

### Speaker Config Schema
```typescript
interface StoryFlowSpeaker {
  name: string;           // "Mark", "Emily", etc.
  language: LanguageCode;
  engine: Engine;
  modelSize?: '1.7B' | '0.6B';
  voiceProfileId?: string;
  effectsChain?: EffectConfig[];
}
```

### Generation Flow
1. User clicks "Generate All"
2. Parse script → get turns[]
3. For each turn (sequential, not parallel):
   - Call generation API with turn's speaker config
   - Track progress (turn index / total turns)
   - Add generation to result list
4. Return all generations
5. User can play individual or add all to story timeline

## Changes to Existing Files

| File | Change |
|------|--------|
| `backend/models.py` | Add StoryFlow* models |
| `backend/services/__init__.py` | Export story_flow functions |
| `backend/routes/__init__.py` | Add story-flow routes |
| `app/src/router.tsx` | Add `/story-flow` route |
| `app/src/components/Sidebar.tsx` | Add StoryFlow tab |
| `app/src/lib/api/client.ts` | Add generateStoryFlow() |

## Implementation Order

1. Backend models first
2. Backend service (parsing + generation)
3. Backend routes
4. Frontend hook
5. Frontend component
6. Router + Sidebar + API client
7. Test end-to-end