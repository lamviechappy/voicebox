'use client';

'use client';

import { useState, useCallback, useEffect } from 'react';
import { Play, Square, RotateCcw, AlertCircle, CheckCircle2, FolderPlus, Check, Sparkles, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { usePlayerStore } from '@/stores/playerStore';
import { useMoodStore } from '@/stores/serverStore';
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

// Fish Audio emotion presets (uses ()
const FISH_EMOTION_PRESETS = [
  { category: 'Positive', emotions: ['(happy)', '(excited)', '(delighted)', '(satisfied)', '(proud)', '(grateful)', '(confident)', '(relaxed)', '(hopeful)'] },
  { category: 'Negative', emotions: ['(sad)', '(angry)', '(frustrated)', '(upset)', '(worried)', '(scared)', '(nervous)', '(disappointed)', '(bored)'] },
  { category: 'Complex', emotions: ['(calm)', '(curious)', '(surprised)', '(confused)', '(uncertain)', '(sarcastic)', '(determined)', '(nostalgic)'] },
  { category: 'Tones', emotions: ['(in a hurry)', '(shouting)', '(whispering)', '(soft tone)'] },
  { category: 'Effects', emotions: ['[laughing]', '[chuckling]', '[sighing]', '[panting]', '[groaning]'] },
  { category: 'Pauses', emotions: ['(break)', '(long-break)'] },
];

// Chatterbox emotion presets (uses different format)
const CHATTERBOX_TAGS = [
  { category: 'Effects', emotions: ['laugh', 'chuckle', 'gasp', 'cough', 'sigh', 'groan', 'sniff', 'shush', 'clear_throat'] },
];

// Backward compatibility
const EMOTION_PRESETS = FISH_EMOTION_PRESETS;

// Fish Audio emotion guide for AI (used when enhancing)
const EMOTION_GUIDE = `Fish Audio Emotion Tags:
- Basic emotions: (happy), (sad), (angry), (excited), (calm), (nervous), (confident), (surprised), (satisfied), (delighted), (scared), (worried), (upset), (frustrated), (depressed), (embarrassed), (disgusted), (moved), (proud), (relaxed), (grateful), (curious), (sarcastic)
- Advanced: (disdainful), (anxious), (hysterical), (indifferent), (uncertain), (confused), (disappointed), (regretful), (guilty), (ashamed), (jealous), (hopeful), (optimistic), (pessimistic), (nostalgic), (lonely), (bored), (sympathetic), (compassionate), (determined), (resigned)
- Tones: (in a hurry), (shouting), (screaming), (whispering), (soft tone)
- Effects: [laughing], [chuckling], [sobbing], [crying loudly], [sighing], [groaning], [panting], [gasping]
- Pauses: (break), (long-break)

Use format: [SpeakerName] (emotion) Text
Example: [Emily] (happy) Hello there! [laughing]`;

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
  // Track number of turns selected when generation started
  const [generationStartedWithCount, setGenerationStartedWithCount] = useState<number>(0);

  // Mood state (Manual + Magic Wand)
  const [moodPopoverOpen, setMoodPopoverOpen] = useState(false);
  const [moodTab, setMoodTab] = useState<'manual' | 'magic'>('manual');
  const [moodTtsEngine, setMoodTtsEngine] = useState<string>('fish_speech');
  const [selectedEmotion, setSelectedEmotion] = useState<string>('');
  const [isApplyingEmotion, setIsApplyingEmotion] = useState(false);

  // Magic Wand API settings (persisted)
  const { apiServerUrl, setApiServerUrl, apiKey, setApiKey, selectedLlmModel, setSelectedLlmModel, prompts } = useMoodStore();
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');

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

  // Apply emotion - Manual or Magic Wand (AI)
  const handleApplyEmotion = useCallback(async () => {
    if (!script.trim()) return;
    setIsApplyingEmotion(true);

    try {
      if (moodTab === 'manual') {
        // Manual mode: apply selected emotion tag
        if (!selectedEmotion) return;
        const lines = script.split('\n');
        const enhancedLines = lines.map((line) => {
          const trimmed = line.trim();
          if (!trimmed) return trimmed;
          if (trimmed.match(/^<?\[.+\]/)) {
            if (trimmed.match(/\([a-zA-Z]+\)/)) {
              return trimmed.replace(/(\([a-zA-Z]+\))/, selectedEmotion);
            }
            return trimmed.replace(/^(<?\[[^\]]+\])/, `$1 ${selectedEmotion}`);
          }
          return `${selectedEmotion} ${trimmed}`;
        });
        setScript(enhancedLines.join('\n'));
        toast({ title: 'Emotion applied', description: `Added ${selectedEmotion}` });
      } else {
        // Magic Wand mode: use LLM to enhance
        if (!apiServerUrl || !selectedLlmModel) return;
        const guide = moodTtsEngine === 'fish_speech'
          ? EMOTION_GUIDE
          : 'Use Chatterbox effect tags: laugh, chuckle, gasp, cough, sigh, groan, sniff, shush, clear_throat';
        const selectedPromptTemplate = prompts.find(p => p.name === selectedPrompt);
        const prompt = (selectedPrompt === 'Custom' ? customPrompt : selectedPromptTemplate?.prompt) || `You are a voice director. Add emotion tags to make the script more engaging. ${guide}`;
        const fullPrompt = `${prompt}\n\nScript:\n${script}\n\nReturn the enhanced script with appropriate emotion tags inserted.`;
        const res = await fetch(`${apiServerUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: selectedLlmModel,
            messages: [{ role: 'user', content: fullPrompt }],
            temperature: 0.7,
          }),
        });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        const enhanced = data.choices?.[0]?.message?.content;
        if (enhanced) {
          setScript(enhanced);
          toast({ title: 'Magic Wand applied', description: 'Script enhanced with AI emotions' });
        }
      }
      setMoodPopoverOpen(false);
    } catch (err) {
      toast({
        title: 'Failed to apply mood',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setIsApplyingEmotion(false);
    }
  }, [moodTab, selectedEmotion, script, apiServerUrl, apiKey, selectedLlmModel, selectedPrompt, customPrompt, prompts, moodTtsEngine, toast]);

  // Clear emotions from script (remove all emotion tags)
  const handleClearEmotions = useCallback(() => {
    const cleaned = script.replace(/\([a-zA-Z]+\)/g, '').replace(/\[([a-zA-Z]+)\]/g, (match) => {
      // Keep audio effect brackets but remove text inside
      return match.startsWith('[') ? match : match;
    });
    setScript(cleaned);
    toast({
      title: 'Emotions cleared',
      description: 'Removed emotion tags from script',
    });
  }, [script, toast]);

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
    // Track how many turns we're generating
    setGenerationStartedWithCount(turnSelections.size);

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
      // Auto-select all generated results for story
      setStorySelections(new Set(resultsWithIndices.map((_, i) => i)));
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

  // Extract unique speaker names from parsed script
  const speakersInScript = parseResult
    ? [...new Set(parseResult.turns.map((t) => t.speaker_name))]
    : [];

  // Filter profiles to only show those in script
  const relevantProfiles = profiles?.filter((p) =>
    appState === 'idle' ? true : speakersInScript.includes(p.name)
  ) ?? [];

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 flex gap-6 overflow-hidden">
        {/* Left Panel: Profile settings */}
        <div className="flex flex-col min-h-0 overflow-hidden w-full max-w-[360px] shrink-0 gap-4">
          <Card className="p-4 flex flex-col gap-3 overflow-y-auto">
            <h2 className="font-semibold text-sm">Profile Settings</h2>
            {relevantProfiles.length > 0 ? (
              <div className="flex flex-col gap-3">
                {relevantProfiles.map((profile) => {
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
                {/* Mood Button with Tabs */}
                <Popover open={moodPopoverOpen} onOpenChange={setMoodPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      title="Add mood to script"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                      Mood
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[340px] p-3" align="end">
                    <div className="space-y-2">
                      {/* TTS Engine Selector */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">TTS:</Label>
                        <Select value={moodTtsEngine} onValueChange={setMoodTtsEngine}>
                          <SelectTrigger className="h-6 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fish_speech">Fish Audio S2 Pro</SelectItem>
                            <SelectItem value="chatterbox">Chatterbox</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Tabs */}
                      <Tabs value={moodTab} onValueChange={(v) => setMoodTab(v as typeof moodTab)} className="w-full">
                        <TabsList className="w-full">
                          <TabsTrigger value="manual" className="flex-1 text-xs">Manual</TabsTrigger>
                          <TabsTrigger value="magic" className="flex-1 text-xs">Magic Wand</TabsTrigger>
                        </TabsList>

                        {/* Manual Tab */}
                        <TabsContent value="manual" className="space-y-2 mt-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground">Emotions</span>
                            <Button variant="ghost" size="sm" className="h-5 text-xs" onClick={handleClearEmotions}>Clear</Button>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
                            {(moodTtsEngine === 'fish_speech' ? FISH_EMOTION_PRESETS : CHATTERBOX_TAGS).flatMap(p => p.emotions).map((emotion) => (
                              <button
                                key={emotion}
                                type="button"
                                className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${selectedEmotion === emotion ? 'bg-amber-500/20 border-amber-500 text-amber-700' : 'bg-muted/50 border-border hover:bg-muted'}`}
                                onClick={() => setSelectedEmotion(emotion)}
                              >
                                {emotion}
                              </button>
                            ))}
                          </div>
                          <Button size="sm" className="w-full" onClick={handleApplyEmotion} disabled={!selectedEmotion || isApplyingEmotion}>
                            {isApplyingEmotion ? 'Applying...' : `Apply ${selectedEmotion || ''}`}
                          </Button>
                        </TabsContent>

                        {/* Magic Wand Tab */}
                        <TabsContent value="magic" className="space-y-2 mt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">API Server</Label>
                              <Input placeholder="http://127.0.0.1:8081" value={apiServerUrl} onChange={(e) => setApiServerUrl(e.target.value)} className="h-6 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">API Key</Label>
                              <Input type="password" placeholder="sk-..." value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="h-6 text-xs" />
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="w-full text-xs" onClick={async () => {
                            if (!apiServerUrl) return;
                            setIsFetchingModels(true);
                            try {
                              const res = await fetch(`${apiServerUrl}/v1/models`, { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
                              const data = await res.json();
                              const models = data.data?.map((m: { id: string }) => m.id) || [];
                              setLlmModels(models);
                              if (models.length > 0) setSelectedLlmModel(models[0]);
                            } catch { /* ignore */ }
                            setIsFetchingModels(false);
                          }} disabled={!apiServerUrl || isFetchingModels}>
                            {isFetchingModels ? 'Fetching...' : 'Fetch Models'}
                          </Button>
                          {llmModels.length > 0 && (
                            <div className="space-y-1">
                              <Label className="text-[10px]">LLM Model</Label>
                              <Select value={selectedLlmModel} onValueChange={setSelectedLlmModel}>
                                <SelectTrigger className="h-6 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {llmModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="space-y-1">
                            <Label className="text-[10px]">System Prompt</Label>
                            <Select value={selectedPrompt} onValueChange={setSelectedPrompt}>
                              <SelectTrigger className="h-6 text-xs">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                              <SelectContent>
                                {prompts.map((p) => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <Textarea placeholder="Or custom prompt..." value={selectedPrompt === 'Custom' ? customPrompt : ''} onChange={(e) => { setCustomPrompt(e.target.value); setSelectedPrompt('Custom'); }} className="min-h-[50px] text-xs resize-none" />
                          </div>
                          <Button size="sm" className="w-full" onClick={handleApplyEmotion} disabled={!apiServerUrl || !selectedLlmModel || isApplyingEmotion}>
                            {isApplyingEmotion ? 'Enhancing...' : 'Apply Magic Wand'}
                          </Button>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </PopoverContent>
                </Popover>
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
              placeholder={`<[Speaker]> Your dialogue...`}
              className="min-h-[100px] max-h-[200px] font-mono text-xs resize-none overflow-y-auto"
              disabled={appState === 'generating' || appState === 'done'}
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Use {"<[Speaker]>"} format.</p>
              {relevantProfiles.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {relevantProfiles.map((p) => (
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
              <div className="flex flex-col gap-1 max-h-[300px] overflow-y-auto">
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
                Generating {generationResults.length + 1} of {generationStartedWithCount}...
              </p>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${generationStartedWithCount > 0 ? (generationResults.length / generationStartedWithCount) * 100 : 0}%` }}
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
