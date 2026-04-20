import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '@/lib/queryClient';

// ============ Mood Store (Magic Wand settings) ============
interface MoodStore {
  apiServerUrl: string;
  setApiServerUrl: (url: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  selectedLlmModel: string;
  setSelectedLlmModel: (model: string) => void;
  prompts: { name: string; prompt: string }[];
  addPrompt: (name: string, prompt: string) => void;
  updatePrompt: (name: string, newName: string, newPrompt: string) => void;
  removePrompt: (name: string) => void;
}

export const useMoodStore = create<MoodStore>()(
  persist(
    (set, _get) => ({
      apiServerUrl: '',
      setApiServerUrl: (url) => set({ apiServerUrl: url }),
      apiKey: '',
      setApiKey: (key) => set({ apiKey: key }),
      selectedLlmModel: '',
      setSelectedLlmModel: (model) => set({ selectedLlmModel: model }),
      prompts: [
        { name: 'English Podcast A2', prompt: 'You are an expert voice director. Analyze the following script. This script is for a YouTube podcast video for learning English. The audience is at A1, A2 English level. Insert inline emotional tags like (happy), (sad), (serious), or (laugh) based on the context of the script.' },
        { name: ' Storytelling', prompt: 'You are a storytelling expert. Add emotion tags to make the narrative engaging and immersive. Use appropriate (emotion) tags for each character.' },
        { name: 'Marketing', prompt: 'You are a marketing copywriter. Add excitement and persuasion emotion tags to make the content compelling.' },
        { name: 'Podcast (Chatterbox Turbo)', prompt: 'You are a professional podcast voice director. Enhance the following podcast script with Chatterbox Turbo emotion tags for a natural, engaging English podcast feel. Use these tags: laugh, chuckle, gasp, cough, sigh, groan, sniff, shush, clear_throat. Insert them naturally within dialogue to create pauses, reactions, and breathing moments — not just at line endings. Add variety: a real conversation has hesitations, interruptions, and reactions. Keep the speaker labels [Name] intact.' },
      ],
      addPrompt: (name, prompt) => set((s) => ({ prompts: [...s.prompts, { name, prompt }] })),
      updatePrompt: (name, newName, newPrompt) => set((s) => ({
        prompts: s.prompts.map((p) =>
          p.name === name ? { name: newName, prompt: newPrompt } : p
        ),
      })),
      removePrompt: (name) => set((s) => ({ prompts: s.prompts.filter((p) => p.name !== name) })),
    }),
    { name: 'voicebox-mood-settings' }
  )
);

// ============ Server Store ============
interface ServerStore {
  serverUrl: string;
  setServerUrl: (url: string) => void;

  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;

  mode: 'local' | 'remote';
  setMode: (mode: 'local' | 'remote') => void;

  keepServerRunningOnClose: boolean;
  setKeepServerRunningOnClose: (keepRunning: boolean) => void;

  maxChunkChars: number;
  setMaxChunkChars: (value: number) => void;

  crossfadeMs: number;
  setCrossfadeMs: (value: number) => void;

  normalizeAudio: boolean;
  setNormalizeAudio: (value: boolean) => void;

  autoplayOnGenerate: boolean;
  setAutoplayOnGenerate: (value: boolean) => void;

  customModelsDir: string | null;
  setCustomModelsDir: (dir: string | null) => void;
}

/**
 * Invalidate all React Query caches so stale data from the previous
 * server is not shown. Called when the server URL changes.
 */
function invalidateAllServerData() {
  queryClient.invalidateQueries();
}

export const useServerStore = create<ServerStore>()(
  persist(
    (set, get) => ({
      serverUrl: 'http://127.0.0.1:17493',
      setServerUrl: (url) => {
        const prev = get().serverUrl;
        set({ serverUrl: url });
        if (url !== prev) {
          invalidateAllServerData();
        }
      },

      isConnected: false,
      setIsConnected: (connected) => set({ isConnected: connected }),

      mode: 'local',
      setMode: (mode) => set({ mode }),

      keepServerRunningOnClose: false,
      setKeepServerRunningOnClose: (keepRunning) => set({ keepServerRunningOnClose: keepRunning }),

      maxChunkChars: 800,
      setMaxChunkChars: (value) => set({ maxChunkChars: value }),

      crossfadeMs: 50,
      setCrossfadeMs: (value) => set({ crossfadeMs: value }),

      normalizeAudio: true,
      setNormalizeAudio: (value) => set({ normalizeAudio: value }),

      autoplayOnGenerate: true,
      setAutoplayOnGenerate: (value) => set({ autoplayOnGenerate: value }),

      customModelsDir: null,
      setCustomModelsDir: (dir) => set({ customModelsDir: dir }),
    }),
    {
      name: 'voicebox-server',
    },
  ),
);
