# Learning: dotenv Override for System Environment Variables

**Date**: 2024-12-14
**Context**: RAG system setup

## Problem
OpenAI API key in `.env` file was being ignored. System was using an old invalid key.

## Root Cause
A system-level environment variable `OPENAI_API_KEY` was set with an old value. By default, `dotenv.config()` does NOT override existing environment variables.

## Solution
Use the `override` option:

```typescript
// Before - doesn't override system env vars
import * as dotenv from 'dotenv';
dotenv.config();

// After - overrides system env vars with .env values
import * as dotenv from 'dotenv';
dotenv.config({ override: true });
```

## Debug Command
Check if dotenv is overriding:
```bash
npx ts-node -e "require('dotenv').config({ debug: true })"
```

Look for: `"KEY" is already defined and was NOT overwritten`

## Prevention
- Always use `{ override: true }` when .env should be source of truth
- Or remove stale system environment variables

#pattern #dotenv #gotcha
