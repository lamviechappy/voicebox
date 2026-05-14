import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoryFlowSpeakerConfig, StoryFlowParseResponse, StoryFlowGenerationResult } from '@/lib/api/types';

interface StoryFlowState {
  // Script and speakers
  script: string;
  speakers: StoryFlowSpeakerConfig[];

  // Parsed result
  parseResult: StoryFlowParseResponse | null;

  // Generation results
  generationResults: StoryFlowGenerationResult[];

  // Selections
  turnSelections: Set<number>;
  storySelections: Set<number>;

  // Track mode & assignments
  trackMode: 'auto' | 'manual';
  trackAssignments: Record<string, number>; // key: speaker name

  // Muted tracks
  mutedTracks: Set<number>;

  // Actions
  setScript: (script: string) => void;
  setSpeakers: (speakers: StoryFlowSpeakerConfig[]) => void;
  setParseResult: (result: StoryFlowParseResponse | null) => void;
  setGenerationResults: (results: StoryFlowGenerationResult[]) => void;
  setTurnSelections: (selections: Set<number>) => void;
  setStorySelections: (selections: Set<number>) => void;
  toggleTurnSelection: (index: number) => void;
  toggleStorySelection: (index: number) => void;
  selectAllTurns: (count: number) => void;
  deselectAllTurns: () => void;
  selectAllStory: (count: number) => void;
  deselectAllStory: () => void;
  setTrackMode: (mode: 'auto' | 'manual') => void;
  setTrackAssignment: (speakerName: string, trackId: number) => void;
  setMutedTracks: (tracks: Set<number>) => void;
  toggleMuteTrack: (trackId: number) => void;
  isTrackMuted: (trackId: number) => boolean;
  getTrackForSpeaker: (speakerName: string) => number;
  reset: () => void;
}

export const useStoryFlowStateStore = create<StoryFlowState>()(
  persist(
    (set, get) => ({
      script: '',
      speakers: [],
      parseResult: null,
      generationResults: [],
      turnSelections: new Set(),
      storySelections: new Set(),
      trackMode: 'auto',
      trackAssignments: {},
      mutedTracks: new Set(),

      setScript: (script) => set({ script }),
      setSpeakers: (speakers) => set({ speakers }),

      setParseResult: (parseResult) => set({ parseResult }),

      setGenerationResults: (generationResults) => set({ generationResults }),

      setTurnSelections: (turnSelections) => set({ turnSelections }),
      setStorySelections: (storySelections) => set({ storySelections }),

      toggleTurnSelection: (index) => {
        const { turnSelections } = get();
        const next = new Set(turnSelections);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        set({ turnSelections: next });
      },

      toggleStorySelection: (index) => {
        const { storySelections } = get();
        const next = new Set(storySelections);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        set({ storySelections: next });
      },

      selectAllTurns: (count) => {
        const all = new Set(Array.from({ length: count }, (_, i) => i));
        set({ turnSelections: all });
      },

      deselectAllTurns: () => {
        set({ turnSelections: new Set() });
      },

      selectAllStory: (count) => {
        const all = new Set(Array.from({ length: count }, (_, i) => i));
        set({ storySelections: all });
      },

      deselectAllStory: () => {
        set({ storySelections: new Set() });
      },

      setTrackMode: (trackMode) => set({ trackMode }),

      setTrackAssignment: (speakerName, trackId) => {
        const { trackAssignments } = get();
        set({
          trackAssignments: { ...trackAssignments, [speakerName]: trackId },
        });
      },

      setMutedTracks: (mutedTracks) => set({ mutedTracks }),

      toggleMuteTrack: (trackId) => {
        const { mutedTracks } = get();
        const next = new Set(mutedTracks);
        if (next.has(trackId)) next.delete(trackId);
        else next.add(trackId);
        set({ mutedTracks: next });
      },

      isTrackMuted: (trackId) => {
        return get().mutedTracks.has(trackId);
      },

      getTrackForSpeaker: (speakerName) => {
        const { trackMode, trackAssignments } = get();
        if (trackMode === 'manual') {
          return trackAssignments[speakerName] ?? -1;
        }
        // auto mode: return -1 for auto-assign
        return -1;
      },

      reset: () => {
        set({
          script: '',
          speakers: [],
          parseResult: null,
          generationResults: [],
          turnSelections: new Set(),
          storySelections: new Set(),
          trackMode: 'auto',
          trackAssignments: {},
          mutedTracks: new Set(),
        });
      },
    }),
    {
      name: 'storyflow-state',
      partialize: (state) => ({
        // Persist everything except maybe large results? For now persist all.
        script: state.script,
        speakers: state.speakers,
        trackMode: state.trackMode,
        trackAssignments: state.trackAssignments,
        mutedTracks: Array.from(state.mutedTracks),
        // We'll also persist selections and generation results if needed, but they might be large.
        // For performance, we might not persist results; but requirement says maintain results across tab navigation.
        // That's in-memory across tabs within same session; persisting across reloads not explicitly required.
        // We'll keep them in store but not persisted to localStorage? persisted state will survive page reloads; that's fine.
        // We'll store sets as arrays for serialization.
        turnSelections: Array.from(state.turnSelections),
        storySelections: Array.from(state.storySelections),
        generationResults: state.generationResults,
        parseResult: state.parseResult,
      }),
      onRehydrateStorage: () => (state) => {
        // Convert arrays back to Sets
        if (state) {
          state.turnSelections = new Set(state.turnSelections);
          state.storySelections = new Set(state.storySelections);
          state.mutedTracks = new Set(state.mutedTracks);
        }
      },
    }
  )
);
