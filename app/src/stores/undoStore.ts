import { create } from 'zustand';
import type { StoryItemDetail } from '@/lib/api/types';

interface UndoState {
  past: StoryItemDetail[][];
  future: StoryItemDetail[][];
  takeSnapshot: (items: StoryItemDetail[]) => void;
  undo: (current: StoryItemDetail[]) => StoryItemDetail[];
  redo: (current: StoryItemDetail[]) => StoryItemDetail[];
  clear: () => void;
}

export const useUndoStore = create<UndoState>((set, get) => ({
  past: [],
  future: [],

  takeSnapshot: (items: StoryItemDetail[]) => {
    set((state) => ({
      past: [...state.past, items],
      future: [], // Clear redo on new action
    }));
  },

  undo: (current: StoryItemDetail[]) => {
    const { past } = get();
    if (past.length === 0) return current;
    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    set({
      past: newPast,
      future: [current, ...get().future],
    });
    return previous;
  },

  redo: (current: StoryItemDetail[]) => {
    const { future } = get();
    if (future.length === 0) return current;
    const next = future[0];
    const newFuture = future.slice(1);
    set({
      past: [...get().past, current],
      future: newFuture,
    });
    return next;
  },

  clear: () => set({ past: [], future: [] }),
}));
