---
name: voicebox-dev
description: Use this skill when the user wants to develop Voicebox features. It guides through daily development workflow, upstream sync, feature branching, and testing. Always start by reading docs/DEV.md.
---

# Voicebox Development

## Goal

Guide the user through daily Voicebox development: syncing with upstream, creating/editing feature branches, testing changes, and merging to main.

## Prerequisites

Verify upstream remote is set up:
```bash
git remote -v
```

Should show:
- `origin` → `lamviechappy/voicebox`
- `upstream` → `jamiepine/voicebox`

If upstream is missing:
```bash
git remote add upstream https://github.com/jamiepine/voicebox.git
```

## Reference Docs

Always check these first:
```bash
cat docs/DEV.md   # Development workflow
cat docs/BUILD.md # Build commands
```

## Daily Workflow

### 1. Start Fresh

```bash
# Update main with upstream
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

# Rebase your feature branch
git checkout feat/story-flow
git rebase main
```

### 2. Make Changes

```bash
# Edit code in your feature branch
git checkout feat/story-flow

# Make changes, commit
git add .
git commit -m "<type>: <description>"
```

### 3. Test Changes

```bash
# Run lint and tests
just lint
just test

# Or rebuild if needed
just clean
just build
```

### 4. Merge to Main (When Ready)

```bash
# Ensure feature is up to date
git checkout feat/story-flow
git rebase main

# Merge to main
git checkout main
git merge feat/story-flow
git push origin main
```

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, production-ready code |
| `feat/story-flow` | Story/conversation feature work |
| `feat/flow-emotion` | Emotion/flow feature work |

## Common Tasks

### Create a New Feature Branch

```bash
git checkout main
git fetch upstream
git merge upstream/main
git checkout -b feat/my-feature
```

### See What Changed

```bash
# Your changes vs main
git diff main...HEAD

# Recent commits
git log --oneline -10

# See upstream changes
git log upstream/main -10 --oneline
```

### Handle Conflicts

During rebase:
```bash
git rebase main
# Fix conflicts in editor
git add .
git rebase --continue
```

During merge:
```bash
git merge feat/my-feature
# Fix conflicts
git add .
git commit
```

### Cherry-Pick a Specific Commit

```bash
# Find the commit hash
git log upstream/main --oneline

# Cherry-pick it
git cherry-pick abc1234
```

## Commit Style

```
<type>: <short description>

<longer description if needed>
```

| Type | Use For |
|------|---------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `refactor:` | Code changes without bug fixes |
| `docs:` | Documentation |
| `style:` | Formatting |
| `test:` | Adding tests |
| `chore:` | Maintenance |

## Testing Checklist

Before any commit:
- [ ] `just lint` passes
- [ ] `just test` passes
- [ ] Build succeeds

Before merging to main:
- [ ] `just clean-deep` then rebuild
- [ ] Manual testing
- [ ] No conflicts with main

## Common Issues

### "My feature has conflicts"

```bash
git checkout feat/my-feature
git rebase main
# Fix conflicts, then:
git rebase --continue
```

### "Undo changes to a file"

```bash
git checkout -- path/to/file
```

### "Save work without committing"

```bash
git stash
# ... do other work ...
git stash pop
```

### "Accidentally committed to main"

```bash
# Undo but keep changes
git reset --soft HEAD~1

# Move to feature branch
git checkout -b feat/my-changes
# Or merge into existing branch
git checkout feat/existing-branch
git merge HEAD@{1}

# Go back to main
git checkout main
git reset HEAD~1
```

## Workflow Summary

### Morning Routine

```bash
git checkout main
git fetch upstream
git merge upstream/main
git push origin main

git checkout feat/story-flow
git rebase main
```

### While Developing

```bash
# Make changes
git add .
git commit -m "feat: my changes"

# Test
just lint && just test
```

### When Done

```bash
git checkout main
git merge feat/story-flow
git push origin main

# Optional: delete feature branch
git branch -d feat/story-flow
```

## Git Aliases (Optional)

Add to `~/.gitconfig`:

```ini
[alias]
    s = status -sb
    lg = log --graph --oneline --decorate --all
    undo = reset --soft HEAD~1
    frb = "!f() { git fetch upstream && git rebase upstream/main; }; f"
```

Usage:
```bash
git s   # Quick status
git lg  # Branch graph
git undo  # Undo last commit
git frb   # Fetch + rebase upstream
```

## Notes

- Never commit directly to `main` — always use feature branches
- Always rebase feature branches on updated `main` before merging
- Run `just lint` and `just test` before any commit
- Deep clean (`just clean-deep`) before testing builds
- Keep commit messages clear and descriptive
