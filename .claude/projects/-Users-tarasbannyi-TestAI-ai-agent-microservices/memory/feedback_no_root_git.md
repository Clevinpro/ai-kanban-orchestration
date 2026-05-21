---
name: feedback-no-root-git
description: Do not create git repo at root of ai-agent-microservices workspace
metadata:
  type: feedback
---

Never run `git init` at `/Users/tarasbannyi/TestAI/ai-agent-microservices/`. Sub-repos (`ai-platform`, `ai-platform-fe`) have their own `.git`. Root is a bare workspace — no root-level git.

**Why:** User explicitly rejected root git init.
**How to apply:** Skip `has_git: false → git init` step for this project. Also skip any `git commit` at root level.
