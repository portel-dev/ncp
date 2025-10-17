# AI Test Prompt for Unified Discovery

Copy this prompt and give it to an AI assistant (like Claude) that has access to NCP to test the unified discovery implementation:

---

## 🧪 Test Prompt

```
I need you to thoroughly test NCP's unified discovery system for MCP servers. This system should work for both stdio and HTTP/SSE MCPs, using registry discovery and clipboard security patterns.

### Test 1: Registry Discovery with stdio MCPs

1. Search the MCP registry for servers related to "github"
2. Show me the numbered list with transport badges (💻 for stdio, 🌐 for HTTP/SSE)
3. Select one MCP to import
4. If it requires environment variables:
   - Show me what needs to be configured
   - I'll prepare credentials in clipboard format: {"env":{"VAR_NAME":"value"}}
   - Import using the clipboard pattern (secrets should NOT appear in chat)
5. Verify it was added by listing my configured MCPs
6. Test that you can discover tools from the imported MCP

Report:
- Which MCP you imported
- Transport type detected
- Environment variables required
- Whether clipboard pattern worked (secrets hidden from chat)
- Number of tools discovered

### Test 2: Web Search for HTTP/SSE MCPs

1. Search the web for "MCP HTTP endpoint" or "MCP SSE server"
2. Look for any publicly announced MCP URLs in:
   - Blog posts
   - GitHub repositories
   - API documentation
   - Company announcements
3. For any URLs found, validate them using:
   ```bash
   node tests/validate-mcp-url.js <url>
   ```
4. Report which URLs are valid MCP servers
5. For valid ones, show:
   - Server name and version
   - Number of tools
   - Auth requirements
   - Whether it's ready to import

Report:
- Search queries used
- URLs found
- Validation results for each
- How many are real MCP servers
- Auth types detected

### Test 3: Unified Discovery Flow

1. Use ncp:import from="discovery" to search for any MCP topic
2. Verify the display shows:
   - Transport badges (💻/🌐)
   - Number of environment variables needed
   - Clear descriptions
3. Select multiple MCPs (use selection: "1,3,5" or "1-5" format)
4. Import them with appropriate credentials
5. List all imported MCPs and verify:
   - Transport type is shown correctly
   - stdio shows: Command + args + env vars
   - HTTP/SSE shows: URL + auth type

Report:
- Query used
- Number of results
- Transport type distribution (how many stdio vs HTTP/SSE)
- Import success rate
- Any errors encountered

### Test 4: Clipboard Security Pattern

1. Find an MCP that requires sensitive configuration (API key, token, etc.)
2. Prepare config in clipboard: {"env":{"SECRET":"test-value-123"}}
3. Import the MCP using ncp:add
4. Verify that:
   - The secret "test-value-123" does NOT appear in our chat history
   - The MCP was configured successfully
   - You can confirm it has the env var (without showing the value)

Report:
- Did secrets appear in chat? (Should be NO)
- Was config successfully applied?
- Can you verify the MCP has credentials without exposing them?

### Test 5: HTTP/SSE Discovery (If Available)

If you found any valid HTTP/SSE MCP URLs in Test 2:

1. Create a CSV file:
   ```csv
   name,url,description
   found-mcp,<url>,Description from web search
   ```

2. Run batch import:
   ```bash
   node tests/batch-import-mcps.js tests/ai-found-mcps.csv --dry-run
   ```

3. Review the auto-detected auth requirements
4. If it looks good, import for real (without --dry-run)
5. Test the imported HTTP/SSE MCP

Report:
- URL tested
- Auth detection accuracy
- Import success
- Tools discovered
- Any issues

### Test 6: Error Handling

1. Try to import an invalid MCP (non-existent URL or name)
2. Try to import with missing required credentials
3. Try to use an MCP that's not properly configured

Report:
- Error messages shown
- Whether errors are helpful and actionable
- Any crashes or unexpected behavior

### Final Report Format

Please provide a comprehensive report with:

**Summary:**
- Total MCPs tested: X
- Successful imports: X
- Failed imports: X
- Transport types found: X stdio, X HTTP/SSE
- Clipboard pattern working: Yes/No

**Detailed Findings:**
For each test:
- Test name
- Result (Pass/Fail)
- Details
- Any issues or suggestions

**Registry Discovery:**
- Works as expected: Yes/No
- Transport detection accurate: Yes/No
- Display formatting good: Yes/No

**HTTP/SSE Support:**
- Found real HTTP/SSE MCPs: Yes/No (if yes, how many)
- URL validation works: Yes/No
- Auth detection works: Yes/No
- Import successful: Yes/No

**Clipboard Security:**
- Secrets hidden from chat: Yes/No
- Config applied correctly: Yes/No
- User experience smooth: Yes/No

**Overall Assessment:**
- Is unified discovery production-ready?
- Any bugs found?
- Any UX improvements needed?
- Recommendations for next steps
```

---

## Usage Instructions

1. **Copy the test prompt above** (everything in the code block)
2. **Start a new chat** with an AI that has NCP access
3. **Paste the prompt**
4. **Let the AI run the tests**
5. **Review the final report**

The AI will systematically test:
- ✅ Registry discovery (stdio and HTTP/SSE)
- ✅ Web search + URL validation
- ✅ Clipboard security pattern
- ✅ Batch import
- ✅ Error handling
- ✅ Complete unified flow

This validates the entire implementation end-to-end!
