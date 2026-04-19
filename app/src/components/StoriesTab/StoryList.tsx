'use client';

'use client';

import { BookOpen, Check, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import {
  useCreateStory,
  useDeleteStory,
  useDuplicateStory,
  useStories,
  useStory,
  useUpdateStory,
} from '@/lib/hooks/useStories';
import { cn } from '@/lib/utils/cn';
import { formatDate } from '@/lib/utils/format';
import { useStoryStore } from '@/stores/storyStore';

export function StoryList() {
  const { data: stories, isLoading } = useStories();
  const selectedStoryId = useStoryStore((state) => state.selectedStoryId);
  const setSelectedStoryId = useStoryStore((state) => state.setSelectedStoryId);
  const trackEditorHeight = useStoryStore((state) => state.trackEditorHeight);
  const { data: selectedStory } = useStory(selectedStoryId);
  const createStory = useCreateStory();
  const updateStory = useUpdateStory();
  const deleteStory = useDeleteStory();
  const duplicateStory = useDuplicateStory();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingStory, setEditingStory] = useState<{
    id: string;
    name: string;
    description?: string;
  } | null>(null);
  const [deletingStoryId, setDeletingStoryId] = useState<string | null>(null);
  const [newStoryName, setNewStoryName] = useState('');
  const [newStoryDescription, setNewStoryDescription] = useState('');
  // Batch selection state
  const [selectedStories, setSelectedStories] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Auto-select the first story when the list loads with no selection
  useEffect(() => {
    if (!selectedStoryId && stories && stories.length > 0) {
      setSelectedStoryId(stories[0].id);
    }
  }, [selectedStoryId, stories, setSelectedStoryId]);

  const handleCreateStory = () => {
    if (!newStoryName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a story name',
        variant: 'destructive',
      });
      return;
    }

    createStory.mutate(
      {
        name: newStoryName.trim(),
        description: newStoryDescription.trim() || undefined,
      },
      {
        onSuccess: (story) => {
          setSelectedStoryId(story.id);
          setCreateDialogOpen(false);
          setNewStoryName('');
          setNewStoryDescription('');
          toast({
            title: 'Story created',
            description: `"${story.name}" has been created`,
          });
        },
        onError: (error) => {
          toast({
            title: 'Failed to create story',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleEditClick = (story: { id: string; name: string; description?: string }) => {
    setEditingStory(story);
    setNewStoryName(story.name);
    setNewStoryDescription(story.description || '');
    setEditDialogOpen(true);
  };

  const handleUpdateStory = () => {
    if (!editingStory || !newStoryName.trim()) {
      toast({
        title: 'Name required',
        description: 'Please enter a story name',
        variant: 'destructive',
      });
      return;
    }

    updateStory.mutate(
      {
        storyId: editingStory.id,
        data: {
          name: newStoryName.trim(),
          description: newStoryDescription.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setEditDialogOpen(false);
          setEditingStory(null);
          setNewStoryName('');
          setNewStoryDescription('');
        },
        onError: (error) => {
          toast({
            title: 'Failed to update story',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleDeleteClick = (storyId: string) => {
    setDeletingStoryId(storyId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!deletingStoryId) return;

    deleteStory.mutate(deletingStoryId, {
      onSuccess: () => {
        // Clear selection if deleting the currently selected story
        if (selectedStoryId === deletingStoryId) {
          setSelectedStoryId(null);
        }
        setDeleteDialogOpen(false);
        setDeletingStoryId(null);
      },
      onError: (error) => {
        toast({
          title: 'Failed to delete story',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleBatchDeleteConfirm = () => {
    const idsToDelete = Array.from(selectedStories);
    let deletedCount = 0;
    let lastError: Error | null = null;

    idsToDelete.forEach((id) => {
      deleteStory.mutate(id, {
        onSuccess: () => {
          deletedCount++;
          if (deletedCount === idsToDelete.length) {
            setSelectedStories(new Set());
            setDeleteDialogOpen(false);
            setDeletingStoryId(null);
            toast({ title: `Deleted ${deletedCount} story(s)` });
          }
        },
        onError: (error) => {
          lastError = error;
          deletedCount++;
          if (deletedCount === idsToDelete.length) {
            setSelectedStories(new Set());
            setDeleteDialogOpen(false);
            setDeletingStoryId(null);
            toast({
              title: 'Some deletions failed',
              description: lastError?.message,
              variant: 'destructive',
            });
          }
        },
      });
    });
  };

  // Toggle story selection for batch operations
  const toggleStorySelection = (storyId: string) => {
    setSelectedStories((prev) => {
      const next = new Set(prev);
      if (next.has(storyId)) next.delete(storyId);
      else next.add(storyId);
      return next;
    });
  };

  const selectAllStories = () => {
    setSelectedStories(new Set(storyList.map((s) => s.id)));
  };

  const deselectAllStories = () => {
    setSelectedStories(new Set());
  };

  const handleBatchDelete = () => {
    setDeletingStoryId(null); // Using batch mode
    setDeleteDialogOpen(true);
  };

  const handleDuplicate = (storyId: string) => {
    duplicateStory.mutate(storyId, {
      onSuccess: (newStory) => {
        setSelectedStoryId(newStory.id);
        toast({ title: `Duplicated story as "${newStory.name}"` });
      },
      onError: (error) => {
        toast({
          title: 'Failed to duplicate story',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading stories...</div>
      </div>
    );
  }

  const storyList = stories || [];
  const hasTrackEditor = selectedStoryId && selectedStory && selectedStory.items.length > 0;

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Scroll Mask */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background to-transparent z-10 pointer-events-none" />

      {/* Fixed Header */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="flex items-center justify-between mb-4 px-1">
          <h2 className="text-2xl font-bold">Stories</h2>
          <Button onClick={() => setCreateDialogOpen(true)} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            New Story
          </Button>
        </div>
        {/* Batch actions toolbar */}
        {selectedStories.size > 0 && (
          <div className="flex items-center gap-2 mb-2 px-1 py-2 bg-muted/50 rounded-lg">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllStories}>All</Button>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={deselectAllStories}>None</Button>
            <span className="text-xs text-muted-foreground">{selectedStories.size} selected</span>
            <div className="flex-1" />
            <Button variant="outline" size="sm" className="h-7 text-xs text-destructive" onClick={handleBatchDelete}>
              <Trash2 className="mr-1 h-3 w-3" />Delete
            </Button>
          </div>
        )}
      </div>

      {/* Scrollable Story List */}
      <div
        className="flex-1 overflow-y-auto pt-14 relative z-0"
        style={{ paddingBottom: hasTrackEditor ? `${trackEditorHeight + 140}px` : '170px' }}
      >
        {storyList.length === 0 ? (
          <div className="text-center py-12 px-5 border-2 border-dashed border-muted rounded-2xl text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">No stories yet</p>
            <p className="text-xs mt-2">Create your first story to get started</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {storyList.map((story) => (
              <div
                key={story.id}
                role="button"
                tabIndex={0}
                className={cn(
                  'px-5 py-3 rounded-lg transition-colors group flex items-center cursor-pointer',
                  selectedStoryId === story.id ? 'bg-muted' : 'hover:bg-muted/50',
                )}
                aria-label={`Story ${story.name}, ${story.item_count} ${story.item_count === 1 ? 'item' : 'items'}, ${formatDate(story.updated_at)}`}
                aria-pressed={selectedStoryId === story.id}
                onClick={(e) => {
                  // Toggle selection if clicking checkbox area, otherwise select story
                  if ((e.target as HTMLElement).closest('.story-checkbox')) {
                    toggleStorySelection(story.id);
                  } else {
                    setSelectedStoryId(story.id);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedStoryId(story.id);
                  }
                }}
              >
                {/* Checkbox */}
                <div
                  className="story-checkbox w-4 h-4 rounded border flex items-center justify-center shrink-0 mr-3 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStorySelection(story.id);
                  }}
                >
                  {selectedStories.has(story.id) && <Check className="h-3 w-3" />}
                </div>
                <div className="flex items-start justify-between gap-2 w-full min-w-0">
                  <div className="flex-1 min-w-0 text-left overflow-hidden">
                    <h3 className="text-sm font-medium truncate">{story.name}</h3>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>
                        {story.item_count} {story.item_count === 1 ? 'item' : 'items'}
                      </span>
                      <span>·</span>
                      <span>{formatDate(story.updated_at)}</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Actions for ${story.name}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleEditClick(story)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(story.id)}>
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleDeleteClick(story.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Story Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Story</DialogTitle>
            <DialogDescription>
              Create a new story to organize your voice generations into conversations.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="story-name">Name</Label>
              <Input
                id="story-name"
                placeholder="My Story"
                value={newStoryName}
                onChange={(e) => setNewStoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateStory();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="story-description">Description (optional)</Label>
              <Textarea
                id="story-description"
                placeholder="A conversation between..."
                value={newStoryDescription}
                onChange={(e) => setNewStoryDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateStory} disabled={createStory.isPending}>
              {createStory.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Story Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Story</DialogTitle>
            <DialogDescription>Update the story name and description.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-story-name">Name</Label>
              <Input
                id="edit-story-name"
                placeholder="My Story"
                value={newStoryName}
                onChange={(e) => setNewStoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUpdateStory();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-story-description">Description (optional)</Label>
              <Textarea
                id="edit-story-description"
                placeholder="A conversation between..."
                value={newStoryDescription}
                onChange={(e) => setNewStoryDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateStory} disabled={updateStory.isPending}>
              {updateStory.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Story Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingStoryId || selectedStories.size === 1
                ? 'This will permanently delete the story and all its items. This action cannot be undone.'
                : `This will permanently delete ${selectedStories.size} stories and all their items. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={selectedStories.size > 0 ? handleBatchDeleteConfirm : handleDeleteConfirm}
                disabled={deleteStory.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteStory.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
