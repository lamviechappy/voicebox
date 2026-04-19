import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
'use client';

import { Link } from '@tanstack/react-router';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Download, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Loader from 'react-loaders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/components/ui/use-toast';
import { useHistory } from '@/lib/hooks/useHistory';
import {
  useAddStoryItem,
  useExportStoryAudio,
  useRemoveStoryItem,
  useReorderStoryItems,
  useStory,
} from '@/lib/hooks/useStories';
import { useStoryPlayback } from '@/lib/hooks/useStoryPlayback';
import { useGenerationStore } from '@/stores/generationStore';
import { useStoryStore } from '@/stores/storyStore';
import { SortableStoryChatItem } from './StoryChatItem';

export function StoryContent() {
  const selectedStoryId = useStoryStore((state) => state.selectedStoryId);
  const { data: story, isLoading } = useStory(selectedStoryId);
  const removeItem = useRemoveStoryItem();
  const reorderItems = useReorderStoryItems();
  const exportAudio = useExportStoryAudio();
  const addStoryItem = useAddStoryItem();
  const { toast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingCount = useGenerationStore((s) => s.pendingGenerationIds.size);

  // Add generation popover state
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { data: historyData } = useHistory();

  // Batch selection state for generated audio items
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // Filter generations not in story and matching search
  const availableGenerations = useMemo(() => {
    if (!historyData?.items || !story) return [];
    const storyGenerationIds = new Set(story.items.map((i) => i.generation_id));
    const query = searchQuery.toLowerCase();
    return historyData.items.filter(
      (gen) =>
        gen.status === 'completed' &&
        !storyGenerationIds.has(gen.id) &&
        (gen.text.toLowerCase().includes(query) || gen.profile_name.toLowerCase().includes(query)),
    );
  }, [historyData, story, searchQuery]);

  // Get track editor height from store for dynamic padding
  const trackEditorHeight = useStoryStore((state) => state.trackEditorHeight);

  // Track editor is shown when story has items
  const hasBottomBar = story && story.items.length > 0;

  // Calculate dynamic bottom padding: track editor + gap
  const bottomPadding = hasBottomBar ? trackEditorHeight + 24 : 0;

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Playback state (for auto-scroll and item highlighting)
  const isPlaying = useStoryStore((state) => state.isPlaying);
  const currentTimeMs = useStoryStore((state) => state.currentTimeMs);
  const playbackStoryId = useStoryStore((state) => state.playbackStoryId);

  // Refs for auto-scrolling to playing item
  const itemRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastScrolledItemRef = useRef<string | null>(null);

  // Use playback hook
  useStoryPlayback(story?.items);

  // Sort items by start_time_ms
  const sortedItems = useMemo(() => {
    if (!story?.items) return [];
    return [...story.items].sort((a, b) => a.start_time_ms - b.start_time_ms);
  }, [story?.items]);

  // Batch selection handlers
  const toggleItemSelection = (itemId: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllItems = () => {
    setSelectedItems(new Set(sortedItems.map((i) => i.id)));
  };

  const deselectAllItems = () => {
    setSelectedItems(new Set());
  };

  // Select items to left of first selected item
  const selectItemsLeft = () => {
    if (!sortedItems.length) return;
    const selectedIds = Array.from(selectedItems);
    if (selectedIds.length === 0) {
      // No selection, select half on the left
      const midpoint = Math.floor(sortedItems.length / 2);
      setSelectedItems(new Set(sortedItems.slice(0, midpoint).map((i) => i.id)));
    } else {
      // Find first selected item position
      const firstSelectedIndex = sortedItems.findIndex((item) => selectedIds.includes(item.id));
      if (firstSelectedIndex > 0) {
        setSelectedItems(new Set(sortedItems.slice(0, firstSelectedIndex).map((i) => i.id)));
      }
    }
  };

  // Select items to right of last selected item
  const selectItemsRight = () => {
    if (!sortedItems.length) return;
    const selectedIds = Array.from(selectedItems);
    if (selectedIds.length === 0) {
      // No selection, select half on the right
      const midpoint = Math.floor(sortedItems.length / 2);
      setSelectedItems(new Set(sortedItems.slice(midpoint).map((i) => i.id)));
    } else {
      // Find last selected item position
      let lastSelectedIndex = -1;
      for (let i = sortedItems.length - 1; i >= 0; i--) {
        if (selectedIds.includes(sortedItems[i].id)) {
          lastSelectedIndex = i;
          break;
        }
      }
      if (lastSelectedIndex < sortedItems.length - 1) {
        setSelectedItems(new Set(sortedItems.slice(lastSelectedIndex + 1).map((i) => i.id)));
      }
    }
  };

  // Reset selection when story changes
  useEffect(() => {
    setSelectedItems(new Set());
  }, [selectedStoryId]);

  // Find the currently playing item based on timecode
  const currentlyPlayingItemId = useMemo(() => {
    if (!isPlaying || playbackStoryId !== story?.id || !sortedItems.length) {
      return null;
    }
    const playingItem = sortedItems.find((item) => {
      const itemStart = item.start_time_ms;
      const itemEnd = item.start_time_ms + item.duration * 1000;
      return currentTimeMs >= itemStart && currentTimeMs < itemEnd;
    });
    return playingItem?.generation_id ?? null;
  }, [isPlaying, playbackStoryId, story?.id, sortedItems, currentTimeMs]);

  // Auto-scroll to the currently playing item
  useEffect(() => {
    if (!currentlyPlayingItemId || currentlyPlayingItemId === lastScrolledItemRef.current) {
      return;
    }

    const element = itemRefsMap.current.get(currentlyPlayingItemId);
    if (element && scrollRef.current) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      lastScrolledItemRef.current = currentlyPlayingItemId;
    }
  }, [currentlyPlayingItemId]);

  // Reset last scrolled item when playback stops
  useEffect(() => {
    if (!isPlaying) {
      lastScrolledItemRef.current = null;
    }
  }, [isPlaying]);

  const handleRemoveItem = (itemId: string) => {
    if (!story) return;

    removeItem.mutate(
      {
        storyId: story.id,
        itemId,
      },
      {
        onError: (error) => {
          toast({
            title: 'Failed to remove item',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!story || !over || active.id === over.id) return;

    const oldIndex = sortedItems.findIndex((item) => item.generation_id === active.id);
    const newIndex = sortedItems.findIndex((item) => item.generation_id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Calculate the new order
    const newOrder = arrayMove(sortedItems, oldIndex, newIndex);
    const generationIds = newOrder.map((item) => item.generation_id);

    // Send reorder request to backend
    reorderItems.mutate(
      {
        storyId: story.id,
        data: { generation_ids: generationIds },
      },
      {
        onError: (error) => {
          toast({
            title: 'Failed to reorder items',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleExportAudio = () => {
    if (!story) return;

    exportAudio.mutate(
      {
        storyId: story.id,
        storyName: story.name,
      },
      {
        onError: (error) => {
          toast({
            title: 'Failed to export audio',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleAddGeneration = (generationId: string) => {
    if (!story) return;

    addStoryItem.mutate(
      {
        storyId: story.id,
        data: { generation_id: generationId },
      },
      {
        onSuccess: () => {
          setIsAddOpen(false);
          setSearchQuery('');
        },
        onError: (error) => {
          toast({
            title: 'Failed to add generation',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  // Move selected items to a new position
  const moveSelectedItems = (direction: 'up' | 'down') => {
    if (!story || selectedItems.size === 0) return;

    // Get selected items in sorted order
    const selectedIds = Array.from(selectedItems);
    const selectedItemsSorted = sortedItems
      .filter((item) => selectedIds.includes(item.id))
      .sort((a, b) => a.start_time_ms - b.start_time_ms);

    // Find the first and last selected indices in the sorted list
    const firstSelectedIndex = sortedItems.findIndex((item) => item.id === selectedItemsSorted[0].id);
    const lastSelectedIndex = sortedItems.findIndex((item) => item.id === selectedItemsSorted[selectedItemsSorted.length - 1].id);

    let newOrder = [...sortedItems];

    if (direction === 'up') {
      // Move selected items up by one position (if not already at top)
      if (firstSelectedIndex > 0) {
        // Get the item before the first selected
        const itemBefore = sortedItems[firstSelectedIndex - 1];
        // Remove selected items
        newOrder = sortedItems.filter((item) => !selectedIds.includes(item.id));
        // Insert selected items before the item that was before them
        const insertIndex = newOrder.findIndex((item) => item.id === itemBefore.id);
        newOrder.splice(insertIndex, 0, ...selectedItemsSorted);
      }
    } else {
      // Move selected items down by one position (if not already at bottom)
      if (lastSelectedIndex < sortedItems.length - 1) {
        // Get the item after the last selected
        const itemAfter = sortedItems[lastSelectedIndex + 1];
        // Remove selected items
        newOrder = sortedItems.filter((item) => !selectedIds.includes(item.id));
        // Insert selected items after the item that was after them
        const insertIndex = newOrder.findIndex((item) => item.id === itemAfter.id);
        newOrder.splice(insertIndex + 1, 0, ...selectedItemsSorted);
      }
    }

    const generationIds = newOrder.map((item) => item.generation_id);

    reorderItems.mutate(
      {
        storyId: story.id,
        data: { generation_ids: generationIds },
      },
      {
        onError: (error) => {
          toast({
            title: 'Failed to move items',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  if (!selectedStoryId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">Select a story</p>
          <p className="text-sm">Choose a story from the list to view its content</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading story...</div>
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <p className="text-lg font-medium mb-2">Story not found</p>
          <p className="text-sm">The selected story could not be loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h2 className="text-2xl font-bold">{story.name}</h2>
          {story.description && (
            <p className="text-sm text-muted-foreground mt-1">{story.description}</p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <AnimatePresence>
            {pendingCount > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, width: 0 }}
                animate={{ opacity: 1, scale: 1, width: 'auto' }}
                exit={{ opacity: 0, scale: 0.9, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Link
                  to="/"
                  className="flex items-center gap-2 h-8 pl-1.5 pr-3 rounded-full bg-card border border-border hover:bg-muted/50 transition-all duration-200 cursor-pointer"
                >
                  <div className="shrink-0 w-10 h-5 overflow-hidden flex items-center justify-center">
                    <div className="scale-[0.45]">
                      <Loader type="line-scale" active />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Generating {pendingCount} {pendingCount === 1 ? 'audio' : 'audios'}
                  </span>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
          <Popover open={isAddOpen} onOpenChange={setIsAddOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <div className="p-2 border-b">
                <Input
                  placeholder="Search by name or transcript..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="max-h-60 overflow-y-auto">
                {availableGenerations.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    {searchQuery ? 'No matching generations found' : 'No available generations'}
                  </div>
                ) : (
                  availableGenerations.map((gen) => (
                    <button
                      key={gen.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted transition-colors border-b last:border-b-0"
                      onClick={() => handleAddGeneration(gen.id)}
                    >
                      <div className="font-medium text-sm">{gen.profile_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {gen.text.length > 50 ? `${gen.text.substring(0, 50)}...` : gen.text}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
          {story.items.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportAudio}
              disabled={exportAudio.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Audio
            </Button>
          )}
        </div>
        {/* Batch selection toolbar */}
        {selectedItems.size > 0 && (
          <div className="flex items-center gap-2 py-2 px-2 bg-muted/50 rounded-lg">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllItems}>All</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={deselectAllItems}>None</Button>
            {/* Timeline selection buttons - always visible when items selected */}
            <div className="w-px h-4 bg-border" />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={selectItemsLeft}
              title="Select items to the left"
            >
              <ChevronLeft className="h-3 w-3 mr-1" />Left
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={selectItemsRight}
              title="Select items to the right"
            >
              Right<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
            <span className="text-xs text-muted-foreground">{selectedItems.size} selected</span>
            <div className="flex-1" />
            {/* Move buttons */}
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => moveSelectedItems('up')}
              title="Move selected items up"
            >
              <ArrowUp className="h-3 w-3 mr-1" />Up
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => moveSelectedItems('down')}
              title="Move selected items down"
            >
              Down<ArrowDown className="h-3 w-3 ml-1" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs text-destructive"
              onClick={() => {
                const itemsToDelete = sortedItems.filter((i) => selectedItems.has(i.id));
                itemsToDelete.forEach((item) => {
                  removeItem.mutate({ storyId: story.id, itemId: item.id });
                });
                setSelectedItems(new Set());
              }}
            >
              <Trash2 className="mr-1 h-3 w-3" />Delete
            </Button>
          </div>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto space-y-3"
        style={{ paddingBottom: bottomPadding > 0 ? `${bottomPadding}px` : undefined }}
      >
        {sortedItems.length === 0 ? (
          <div className="text-center py-12 px-5 border-2 border-dashed border-muted rounded-md text-muted-foreground">
            <p className="text-sm">No items in this story</p>
            <p className="text-xs mt-2">Generate speech using the box below to add items</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedItems.map((item) => item.generation_id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {sortedItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2"
                    ref={(el) => {
                      if (el) {
                        itemRefsMap.current.set(item.generation_id, el);
                      } else {
                        itemRefsMap.current.delete(item.generation_id);
                      }
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className="mt-2 w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer"
                      onClick={() => toggleItemSelection(item.id)}
                    >
                      {selectedItems.has(item.id) && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1">
                      <SortableStoryChatItem
                        item={item}
                        storyId={story.id}
                        index={index}
                        onRemove={() => handleRemoveItem(item.id)}
                        currentTimeMs={currentTimeMs}
                        isPlaying={isPlaying && playbackStoryId === story.id}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
