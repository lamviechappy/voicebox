# Voicebox Development Guide

This guide covers the recommended workflow for developing Voicebox while staying in sync with upstream (jamiepine/voicebox) updates.

## Git Setup

### Adding Upstream Remote

If you cloned your fork, set up the upstream remote to track the original repo:

```bash
# Add upstream remote
git remote add upstream https://github.com/jamiepine/voicebox.git

# Verify remotes
git remote -v
# Output:
# origin    https://github.com/lamviechappy/voicebox.git (fetch)
# origin    https://github.com/lamviechappy/voicebox.git (push)
# upstream  https://github.com/jamiepine/voicebox.git (fetch)
# upstream  https://github.com/jamiepine/voicebox.git (push)
```

## Branch Strategy

### Your Branches

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready code |
| `feat/story-flow` | Your story/conversation feature work |
| `feat/flow-emotion` | Another feature branch (emotion/flow) |

### Workflow Overview

```
main                    →  Production branch (don't touch directly)
  └─ feat/story-flow   →  Your story feature work
  └─ feat/flow-emotion →  Your emotion feature work
```

## Daily Development Workflow

### 1. Start Fresh (Each Day)

```bash
# Make sure you're on main and it's up to date
git checkout main
git fetch upstream
git merge upstream/main

# Create/update your feature branch
git checkout feat/story-flow
git rebase main
```

### 2. Make Your Changes

```bash
# Edit code in your feature branch
git checkout feat/story-flow

# Make changes, commit
git add .
git commit -m "feat: my custom feature"
```

### 3. Test Before Merging

```bash
# Clean rebuild to test your changes
just clean-deep
just setup
just build

# Run tests
just test
```

### 4. Merge to Main (When Ready)

```bash
# Merge your feature into main
git checkout main
git merge feat/story-flow

# Push to your remote
git push origin main
```

## Staying in Sync with Upstream

### Fetching Upstream Changes

```bash
# Fetch all upstream branches and tags
git fetch upstream

# See what's new
git log main..upstream/main --oneline
```

### Merging Upstream into Main

```bash
git checkout main
git merge upstream/main
git push origin main
```

### Rebasing Your Feature Branch

```bash
# Update main first
git checkout main
git fetch upstream
git merge upstream/main

# Rebase your feature branch on updated main
git checkout feat/story-flow
git rebase main

# Resolve conflicts if any, then continue
git rebase --continue
```

## Handling Conflicts

### During Rebase

```bash
git rebase main

# If conflicts occur:
# 1. Edit conflicting files
# 2. git add <resolved-files>
# 3. git rebase --continue
# 4. Repeat until done
```

### During Merge

```bash
git merge main

# If conflicts occur:
# 1. Edit conflicting files
# 2. git add <resolved-files>
# 3. git commit (merge commit is created automatically)
```

### Selectively Accepting Upstream Changes

If upstream has a specific commit you want:

```bash
# Cherry-pick a specific commit
git cherry-pick abc1234
```

Or to see exactly what changed:

```bash
# Show diff between your code and upstream
git diff main upstream/main -- <file>

# Then manually apply changes you want
```

## Comparing Code

### See What You've Changed

```bash
# Your changes vs main
git diff main...feat/story-flow

# Your changes vs upstream
git diff upstream/main...feat/story-flow
```

### See What Upstream Changed

```bash
# Recent upstream commits
git log upstream/main -10 --oneline

# See a specific commit's changes
git show abc1234
```

## Feature Branch Workflow

### Creating a New Feature Branch

```bash
# From main (up to date)
git checkout main
git merge upstream/main

# Create and switch to new branch
git checkout -b feat/my-feature
```

### Keeping Feature Branch Updated

```bash
# Work on your feature
git checkout feat/my-feature
# ... make changes ...

# Update main
git checkout main
git fetch upstream
git merge upstream/main

# Rebase your feature onto updated main
git checkout feat/my-feature
git rebase main
```

### Merging Feature Back to Main

```bash
# Make sure feature is up to date
git checkout feat/story-flow
git rebase main

# Test thoroughly
just clean-deep
just setup
just build
just test

# Merge to main
git checkout main
git merge feat/story-flow
git push origin main

# Delete feature branch when done
git branch -d feat/story-flow
```

## Recommended Commit Style

### Format

```
<type>: <short description>

<longer description if needed>
```

### Types

| Type | Use For |
|------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `refactor:` | Code changes that don't fix bugs |
| `docs:` | Documentation |
| `style:` | Formatting, linting |
| `test:` | Adding tests |
| `chore:` | Maintenance, dependencies |

### Examples

```bash
git commit -m "feat: add story list batch selection"
git commit -m "fix: prevent app crash on empty story"
git commit -m "refactor: extract TTS generation logic"
git commit -m "docs: update BUILD.md with new commands"
```

## Testing Your Changes

### Before Any Commit

```bash
# Run linting
just lint

# Fix issues
just fix

# Run tests
just test
```

### Before Merging to Main

```bash
# Deep clean rebuild
just clean-deep
just setup

# Build and test
just build

# E2E test with specific model
just test-models --only kokoro
```

## Workflow Summary

### Regular Development

```bash
# Morning: update main
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

# Work on feature
git checkout feat/story-flow
git rebase main

# ... make changes ...

# Commit
git add .
git commit -m "feat: my changes"

# Test
just test

# When ready: merge to main
git checkout main
git merge feat/story-flow
git push origin main
```

### When Upstream Updates

```bash
# Update main with upstream
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

# Update your feature
git checkout feat/story-flow
git rebase main

# Resolve conflicts, test, commit
# ... then merge to main when ready
```

## Useful Git Aliases

Add to your `~/.gitconfig`:

```ini
[alias]
    # Short status
    s = status -sb

    # Graph log
    lg = log --graph --oneline --decorate --all

    # Undo last commit (keep changes)
    undo = reset --soft HEAD~1

    # Stash with name
    snapshot = stash push -m

    # Fetch and rebase
    frb = "!f() { git fetch upstream && git rebase upstream/main; }; f"
```

Usage:
```bash
git s           # Quick status
git lg          # See branch graph
git undo        # Undo last commit
git frb         # Fetch and rebase main
```

## Common Issues

### "My feature has conflicts with main"

```bash
git checkout feat/story-flow
git rebase main
# Fix conflicts, then:
git rebase --continue
```

### "I want to undo my changes to a file"

```bash
# Restore file from last commit
git checkout -- path/to/file
```

### "I want to save my work without committing"

```bash
# Stash changes
git stash
# ... do other work ...
# Get changes back
git stash pop
```

### "I accidentally committed to main"

```bash
# Undo the commit but keep changes
git reset --soft HEAD~1

# Move to feature branch
git checkout -b feat/my-changes
# Or if you already have the branch:
git checkout feat/my-existing-branch
git merge HEAD@{1}  # Merge the unstaged changes
git checkout main
git reset HEAD~1
```

## Code Review Checklist

Before merging any feature:

- [ ] All tests pass (`just test`)
- [ ] Build succeeds (`just build`)
- [ ] No lint errors (`just lint`)
- [ ] Changes tested manually
- [ ] Commit messages are clear
- [ ] No sensitive data committed
- [ ] Conflict-free merge to main

## Next Steps

After setting up your workflow:

1. Read `docs/BUILD.md` for build commands
2. Set up your upstream remote
3. Create your feature branches
4. Start developing!