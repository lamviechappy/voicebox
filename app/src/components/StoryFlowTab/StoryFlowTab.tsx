import { useState, useCallback, useEffect } from 'react';
import { Play, Square, RotateCcw, AlertCircle, CheckCircle2, FolderPlus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { usePlayerStore } from '@/stores/playerStore';
import { useProfiles } from '@/lib/hooks/useProfiles';
import { useStoryFlow } from '@/lib/hooks/useStoryFlow';
import { useStories, useAddStoryItem } from '@/lib/hooks/useStories';
import { getLanguageOptionsForEngine } from '@/lib/constants/languages';
import { apiClient } from '@/lib/api/client';
import type { StoryFlowGenerationResult, StoryFlowSpeakerConfig } from '@/lib/api/types';

type AppState = 'idle' | 'parsed' | 'generating' | 'done';

const ENGINE_OPTIONS = [
  { value: 'qwen', label: 'Qwen3-TTS' },
  { value: 'qwen_custom_voice', label: 'Qwen CustomVoice' },
  { value: 'luxtts', label: 'LuxTTS' },
  { value: 'chatterbox', label: 'Chatterbox' },
  { value: 'chatterbox_turbo', label: 'Chatterbox Turbo' },
  { value: 'tada', label: 'TADA' },
  { value: 'kokoro', label: 'Kokoro' },
  { value: 'fish_speech', label: 'Fish Audio S2 Pro' },
];

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function StoriesTab() {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <StoryFlowMain />
    </div>
  );
}

export { StoriesTab as StoryFlowTab };

function StoryFlowMain() {
  const [script, setScript] = useState(`[Mark] Hello Emily, how are you today?
[Emily] I'm doing great, thanks for asking! How about you?
[Mark] I'm wonderful! I was just thinking about our trip next week.
[Emily] Oh yes! I'm so excited. Have you finished planning everything?
[Mark] Almost! I booked the hotel yesterday.
[Emily] That's wonderful news! What about the activities?
[Mark] I was thinking we could go hiking on Tuesday. Does that sound good?
[Emily] That sounds perfect! I love hiking.`);

  const [appState, setAppState] = useState<AppState>('idle');
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Per-profile settings
  const [profileSettings, setProfileSettings] = useState<Record<string, { language: string; engine: string }>>({});

  // Turn selection state
  const [turnSelections, setTurnSelections] = useState<Set<number>>(new Set());
  const [storySelections, setStorySelections] = useState<Set<number>>(new Set());

  // Playback state
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [currentPlayingIndex, setCurrentPlayingIndex] = useState<number | null>(null);

  const [parseResult, setParseResult] = useState<StoryFlowParseResult | null>(null);
  const [generationResults, setGenerationResults] = useState<StoryFlowGenerationResult[]>([]);

  const { data: profiles } = useProfiles();
  const { data: stories } = useStories();
  const { parseScript, generateStoryFlow } = useStoryFlow();
  const addStoryItem = useAddStoryItem();
  const setAudio = usePlayerStore((s) => s.setAudio);
  const setAudioWithAutoPlay = usePlayerStore((s) => s.setAudioWithAutoPlay);
  const audioUrl = usePlayerStore((s) => s.audioUrl);
  const { toast } = useToast();

  // Auto-advance to next track when audio finishes
  useEffect(() => {
    if (!isPlayingAll || currentPlayingIndex === null || !audioUrl) return;

    // Check if current audio URL matches current playing result
    const currentResult = generationResults[currentPlayingIndex];
    if (!currentResult?.generation_id) return;

    const expectedUrl = apiClient.getAudioUrl(currentResult.generation_id);
    if (audioUrl === expectedUrl) {
      // Audio finished playing, check if it's actually done
      const audioEl = document.querySelector('audio');
      if (audioEl && audioEl.ended) {
        // Play next
        const nextIndex = currentPlayingIndex + 1;
        if (nextIndex < generationResults.length) {
          const nextResult = generationResults[nextIndex];
          if (nextResult.status === 'completed' && nextResult.generation_id) {
            setCurrentPlayingIndex(nextIndex);
            setAudio(apiClient.getAudioUrl(nextResult.generation_id), nextResult.generation_id, null);
          }
        } else {
          setIsPlayingAll(false);
          setCurrentPlayingIndex(null);
        }
      }
    }
  }, [audioUrl, isPlayingAll, currentPlayingIndex, generationResults, setAudio]);

  const initProfileSettings = useCallback(() => {
    if (!profiles) return {};
    const settings: Record<string, { language: string; engine: string }> = {};
    for (const p of profiles) {
      settings[p.name] = { language: p.language, engine: p.default_engine ?? 'qwen' };
    }
    return settings;
  }, [profiles]);

  const handleParse = useCallback(async () => {
    if (!profiles || profiles.length === 0) {
      setError('No voice profiles available. Create a voice profile first.');
      return;
    }
    if (Object.keys(profileSettings).length === 0) {
      const settings = initProfileSettings();
      setProfileSettings(settings);
    }
    setError(null);
    try {
      const speakers: StoryFlowSpeakerConfig[] = profiles.map((p) => ({
        name: p.name,
        language: (profileSettings[p.name]?.language ?? p.language) as StoryFlowSpeakerConfig['language'],
        engine: (profileSettings[p.name]?.engine ?? p.default_engine ?? 'qwen') as StoryFlowSpeakerConfig['engine'],
        voice_profile_id: p.id,
      }));
      const result = await parseScript({ script, speakers });
      setParseResult(result);
      // Select all turns by default
      setTurnSelections(new Set(result.turns.map((_, i) => i)));
      // Select all for story by default
      setStorySelections(new Set(result.turns.map((_, i) => i)));
      setAppState('parsed');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [script, profiles, profileSettings, initProfileSettings, parseScript]);

  const handleGenerate = useCallback(async () => {
    if (!parseResult || !selectedStoryId) {
      setError('Please select a story first.');
      return;
    }
    if (turnSelections.size === 0) {
      setError('Select at least one turn to generate.');
      return;
    }
    setError(null);
    setAppState('generating');
    setGenerationResults([]);
    setIsPlayingAll(false);

    try {
      // Filter script to only include selected turns
      const selectedTurns = parseResult!.turns.filter((_, i) => turnSelections.has(i));
      const filteredScript = selectedTurns
        .map((t) => `[${t.speaker_name}] ${t.text}`)
        .join('\n');

      const speakers: StoryFlowSpeakerConfig[] = profiles!.map((p) => ({
        name: p.name,
        language: (profileSettings[p.name]?.language ?? p.language) as StoryFlowSpeakerConfig['language'],
        engine: (profileSettings[p.name]?.engine ?? p.default_engine ?? 'qwen') as StoryFlowSpeakerConfig['engine'],
        voice_profile_id: p.id,
      }));
      const result = await generateStoryFlow({ script: filteredScript, speakers, generate_in_order: true });

      // Map results back to include original turn indices
      const resultsWithIndices = result.results.map((r, i) => ({
        ...r,
        turn_index: [...turnSelections].sort((a, b) => a - b)[i],
      }));
      setGenerationResults(resultsWithIndices);
      setAppState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setAppState('parsed');
    }
  }, [script, profiles, profileSettings, parseResult, selectedStoryId, turnSelections, generateStoryFlow]);

  const toggleTurnSelection = useCallback((index: number) => {
    setTurnSelections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectAllTurns = useCallback(() => {
    if (!parseResult) return;
    setTurnSelections(new Set(parseResult.turns.map((_, i) => i)));
  }, [parseResult]);

  const deselectAllTurns = useCallback(() => {
    setTurnSelections(new Set());
  }, []);

  const toggleStorySelection = useCallback((index: number) => {
    setStorySelections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  const selectAllStory = useCallback(() => {
    if (!parseResult) return;
    setStorySelections(new Set(parseResult.turns.map((_, i) => i)));
  }, [parseResult]);

  const deselectAllStory = useCallback(() => {
    setStorySelections(new Set());
  }, []);

  const handleAddSelectedToStory = useCallback(async () => {
    if (!selectedStoryId) return;
    const story = stories?.find((s) => s.id === selectedStoryId);
    const storyName = story?.name ?? 'Story';
    const selectedResults = generationResults.filter(
      (r, i) => storySelections.has(i) && r.status === 'completed' && r.generation_id,
    );
    for (const result of selectedResults) {
      try {
        await addStoryItem.mutateAsync({
          storyId: selectedStoryId,
          data: { generation_id: result.generation_id },
        });
      } catch { /* skip failed */ }
    }
    toast({ title: `Added ${selectedResults.length} items to "${storyName}"` });
  }, [selectedStoryId, stories, generationResults, storySelections, addStoryItem, toast]);

  const handleAddOneToStory = useCallback(async (result: StoryFlowGenerationResult, storyId: string, storyName: string) => {
    if (!result.generation_id) return;
    try {
      await addStoryItem.mutateAsync({
        storyId,
        data: { generation_id: result.generation_id },
      });
      toast({ title: `Added to "${storyName}"` });
    } catch { /* skip failed */ }
  }, [addStoryItem, toast]);

  const playAudio = useCallback(
    (result: StoryFlowGenerationResult) => {
      if (result.status === 'completed' && result.generation_id) {
        setAudioWithAutoPlay(apiClient.getAudioUrl(result.generation_id), result.generation_id, null);
      }
    },
    [setAudioWithAutoPlay],
  );

  const playAllSequentially = useCallback(() => {
    if (!generationResults.length) return;
    const firstCompleted = generationResults.findIndex(
      (r) => r.status === 'completed' && r.generation_id,
    );
    if (firstCompleted >= 0) {
      setIsPlayingAll(true);
      setCurrentPlayingIndex(firstCompleted);
      setAudioWithAutoPlay(
        apiClient.getAudioUrl(generationResults[firstCompleted].generation_id),
        generationResults[firstCompleted].generation_id,
        null,
      );
    }
  }, [generationResults, setAudioWithAutoPlay]);

  const stopPlayback = useCallback(() => {
    setIsPlayingAll(false);
    setCurrentPlayingIndex(null);
  }, []);

  const handleReset = useCallback(() => {
    setAppState('idle');
    setParseResult(null);
    setGenerationResults([]);
    setError(null);
    setSelectedStoryId(null);
    setTurnSelections(new Set());
    setStorySelections(new Set());
    setIsPlayingAll(false);
    setCurrentPlayingIndex(null);
  }, []);

  const updateProfileSetting = useCallback((profileName: string, field: 'language' | 'engine', value: string) => {
    setProfileSettings((prev) => ({
      ...prev,
      [profileName]: { ...prev[profileName], [field]: value },
    }));
  }, []);

  const hasProfiles = profiles && profiles.length > 0;
  const selectedCount = turnSelections.size;
  const storySelectedCount = storySelections.size;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
        {/* Left Panel: Profile settings */}
        <div className="flex flex-col min-h-0 overflow-hidden w-full max-w-[360px] shrink-0 gap-4">
          <Card className="p-4 flex flex-col gap-3 overflow-y-auto">
            <h2 className="font-semibold text-sm">Profile Settings</h2>
            {hasProfiles ? (
              <div className="flex flex-col gap-3">
                {profiles!.map((profile) => {
                  const settings = profileSettings[profile.name] || {
                    language: profile.language,
                    engine: profile.default_engine ?? 'qwen',
                  };
                  const langOptions = getLanguageOptionsForEngine(settings.engine);
                  return (
                    <div key={profile.id} className="border border-border rounded-md p-3 space-y-2">
                      <Badge variant="secondary" className="capitalize shrink-0">
                        {profile.name}
                      </Badge>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Language</label>
                          <Select
                            value={settings.language}
                            onValueChange={(v) => updateProfileSetting(profile.name, 'language', v)}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {langOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground">Engine</label>
                          <Select
                            value={settings.engine}
                            onValueChange={(v) => updateProfileSetting(profile.name, 'engine', v)}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {ENGINE_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No voice profiles.</p>
            )}
          </Card>

          {(appState === 'parsed' || appState === 'generating' || appState === 'done') && (
            <Card className="p-4 flex flex-col gap-3">
              <h2 className="font-semibold text-sm">Target Story</h2>
              {stories && stories.length > 0 ? (
                <Select
                  value={selectedStoryId ?? '__none__'}
                  onValueChange={(v) => setSelectedStoryId(v === '__none__' ? null : v)}
                  disabled={appState === 'generating' || appState === 'done'}
                >
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a story..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select a story...</SelectItem>
                    {stories.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">No stories.</p>
              )}
            </Card>
          )}
        </div>

        {/* Right Panel */}
        <div className="flex flex-col min-h-0 overflow-hidden flex-1 gap-4">
          {/* Script */}
          <Card className="p-4 flex flex-col gap-3 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-sm">Script</h2>
              <div className="flex gap-2">
                {appState !== 'idle' && appState !== 'generating' && (
                  <Button variant="ghost" size="sm" onClick={handleReset}><RotateCcw className="h-3 w-3 mr-1" />Reset</Button>
                )}
                {appState === 'idle' && (
                  <Button variant="outline" size="sm" onClick={handleParse} disabled={!hasProfiles}>Parse</Button>
                )}
                {appState === 'parsed' && (
                  <Button size="sm" onClick={handleGenerate} disabled={!selectedStoryId || selectedCount === 0}>
                    Generate {selectedCount > 0 ? `(${selectedCount})` : ''} Selected
                  </Button>
                )}
                {appState === 'generating' && <Button size="sm" disabled>Generating...</Button>}
                {appState === 'done' && <Button variant="outline" size="sm" onClick={handleReset}><Play className="h-3 w-3 mr-1" />New</Button>}
              </div>
            </div>
            <Textarea
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder={`[ProfileName] Your dialogue...`}
              className="min-h-[100px] font-mono text-xs resize-none"
              disabled={appState === 'generating' || appState === 'done'}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Use [ProfileName] format.</p>
              {hasProfiles && (
                <div className="flex flex-wrap gap-1">
                  {profiles!.map((p) => (
                    <Badge key={p.id} variant="outline" className="text-[10px] h-5 capitalize">{p.name}</Badge>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {error && (
            <Card className="p-3 border-red-500/30 bg-red-500/10 shrink-0">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-400">{error}</p>
              </div>
            </Card>
          )}

          {/* Parsed Preview with checkboxes */}
          {appState === 'parsed' && parseResult && (
            <Card className="p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-sm">Turns</h2>
                  <Badge variant="secondary">{selectedCount}/{parseResult.total_turns} selected</Badge>
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={selectAllTurns}>All</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={deselectAllTurns}>None</Button>
                </div>
              </div>
              <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto">
                {parseResult.turns.map((turn, idx) => (
                  <div
                    key={turn.turn_index}
                    className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                      turnSelections.has(idx) ? 'bg-accent/20' : 'bg-muted/30'
                    }`}
                    onClick={() => toggleTurnSelection(idx)}
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      turnSelections.has(idx) ? 'bg-accent border-accent' : 'border-muted-foreground'
                    }`}>
                      {turnSelections.has(idx) && <Check className="h-3 w-3" />}
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs h-5 min-w-[20px]">{idx + 1}</Badge>
                    <Badge variant="outline" className="shrink-0 capitalize min-w-[80px] justify-center text-xs">
                      {turn.speaker_name}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate flex-1">
                      {turn.text.length > 60 ? turn.text.slice(0, 60) + '...' : turn.text}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Generating */}
          {appState === 'generating' && parseResult && (
            <Card className="p-4 shrink-0">
              <p className="text-xs text-muted-foreground mb-1">
                Generating {generationResults.length + 1} of {parseResult.total_turns}...
              </p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${(generationResults.length / parseResult.total_turns) * 100}%` }}
                />
              </div>
            </Card>
          )}

          {/* Results with all controls */}
          {appState === 'done' && generationResults.length > 0 && (
            <Card className="p-4 flex-1 overflow-hidden flex flex-col gap-3">
              <div className="flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-sm">Results</h2>
                  <Badge variant="secondary">
                    {generationResults.filter((r) => r.status === 'completed').length}/{generationResults.length}
                  </Badge>
                  <Badge variant="secondary">
                    {formatDuration(generationResults.reduce((sum, r) => sum + (r.duration ?? 0), 0))} total
                  </Badge>
                </div>
                <div className="flex gap-1">
                  {isPlayingAll ? (
                    <Button variant="outline" size="sm" onClick={stopPlayback}><Square className="h-3 w-3 mr-1" />Stop</Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={playAllSequentially}><Play className="h-3 w-3 mr-1" />Play All</Button>
                  )}
                </div>
              </div>

              {/* Story selection controls */}
              <div className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={selectAllStory}>All</Button>
                  <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={deselectAllStory}>None</Button>
                </div>
                <span className="text-xs text-muted-foreground">
                  {storySelectedCount} selected
                </span>
                <div className="flex-1" />
                {selectedStoryId && storySelectedCount > 0 && (
                  <Button size="sm" className="h-6 text-[10px]" onClick={handleAddSelectedToStory}>
                    <FolderPlus className="h-3 w-3 mr-1" />Add to Story
                  </Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                {generationResults.map((result, idx) => {
                  const isCurrentlyPlaying = isPlayingAll && currentPlayingIndex === idx;
                  return (
                    <div
                      key={result.turn_index}
                      className={`flex items-center gap-2 border rounded-md p-2 ${
                        isCurrentlyPlaying ? 'border-accent bg-accent/10' : 'border-border'
                      }`}
                    >
                      {/* Play button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 shrink-0"
                        onClick={() => playAudio(result)}
                        disabled={result.status !== 'completed'}
                        title={result.status === 'completed' ? 'Play' : 'Failed'}
                      >
                        {result.status === 'completed' ? (
                          <Play className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-red-500" />
                        )}
                      </Button>

                      {/* Story selection checkbox */}
                      {selectedStoryId && result.status === 'completed' && (
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer ${
                            storySelections.has(idx)
                              ? 'bg-accent border-accent'
                              : 'border-muted-foreground'
                          }`}
                          onClick={() => toggleStorySelection(idx)}
                        >
                          {storySelections.has(idx) && <Check className="h-3 w-3" />}
                        </div>
                      )}

                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="shrink-0 text-xs h-5 min-w-[20px]">{idx + 1}</Badge>
                          <span className="text-xs font-semibold capitalize shrink-0">{result.speaker_name}</span>
                          {result.status === 'completed' ? (
                            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                          ) : (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1.5 shrink-0">Failed</Badge>
                          )}
                          {result.duration != null && (
                            <span className="text-[10px] text-muted-foreground shrink-0">{formatDuration(result.duration)}</span>
                          )}
                          {isCurrentlyPlaying && (
                            <Badge variant="outline" className="text-[10px] h-4 shrink-0">Playing</Badge>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">{result.text}</p>
                        {result.status === 'failed' && result.error && (
                          <p className="text-[10px] text-red-400 truncate">{result.error}</p>
                        )}
                      </div>

                      {/* Add to story button for individual */}
                      {selectedStoryId && result.status === 'completed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => {
                            const story = stories?.find((s) => s.id === selectedStoryId);
                            handleAddOneToStory(result, selectedStoryId, story?.name ?? 'Story');
                          }}
                          title="Add to story"
                        >
                          <FolderPlus className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

interface StoryFlowParseResult {
  turns: Array<{ turn_index: number; speaker_name: string; text: string }>;
  total_turns: number;
  total_characters: number;
}
