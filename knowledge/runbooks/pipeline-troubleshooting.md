# Pipeline Troubleshooting Runbook

## Common Issues

### 1. Agent Not Responding
**Symptoms**: Pipeline stalls at analysis or fix stage
**Solution**:
1. Check Anthropic API key is valid
2. Verify rate limits not exceeded
3. Check logs: `./logs/ai-team.log`

### 2. GitHub API Errors
**Symptoms**: "Bad credentials" or 404 errors
**Solution**:
1. Verify `GITHUB_TOKEN` in `.env`
2. Ensure token has `repo` scope
3. Check repository exists and is accessible

### 3. Supabase Connection Failed
**Symptoms**: "Connection refused" or SSL errors
**Solution**:
1. Check `POSTGRES_URL` in `.env`
2. For SSL issues: Set `NODE_TLS_REJECT_UNAUTHORIZED=0` (dev only)
3. Verify Supabase project is active

### 4. RAG Search Returns No Results
**Symptoms**: Semantic search finds nothing
**Solution**:
1. Run reindex: `npx ts-node src/scripts/reindex.ts`
2. Verify `OPENAI_API_KEY` is valid
3. Check `code_embeddings` table has data

## Logs Location
- Application: `./logs/ai-team.log`
- Pipeline runs: Check Supabase `pipeline_runs` table

#runbook #troubleshooting
