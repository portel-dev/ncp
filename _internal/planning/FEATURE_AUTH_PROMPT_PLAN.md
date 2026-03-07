# Auth Prompt On-Demand Feature Plan

**Branch**: `feature/auth-prompt-on-demand`
**Status**: Planning & Implementation
**Target**: Revolutionary UX for MCP authentication

## 🎯 Vision

Transform MCP authentication from a friction-heavy setup process into seamless on-demand prompting that doesn't block AI workflows.

## 🚀 Core Innovation

### **Dual Timeline UX**
- **AI Timeline**: Continue after 35s with "auth needed" message
- **User Timeline**: Keep prompt open for 2 minutes for user convenience
- **No Blocking**: AI workflow never hangs waiting for auth

### **Terminal-First Implementation**
- Use inquirer.js for rich terminal prompts
- Cross-platform compatibility through CLI
- Perfect fit for NCP's command-line nature

## 📋 Implementation Phases

### **Phase 1: Core Infrastructure**
- [ ] Auth error detection and parsing
- [ ] Terminal prompt manager with timeouts
- [ ] Dialog queue management (one prompt at a time)
- [ ] Basic credential caching for session

### **Phase 2: MCP Integration**
- [ ] Hook into NCP's MCP error handling
- [ ] Test with Supabase MCP (needs URL + API key)
- [ ] Test with Figma MCP (needs personal access token)
- [ ] Validate error pattern recognition

### **Phase 3: Enhanced UX**
- [ ] Late response handling (user responds after AI continues)
- [ ] Credential persistence options
- [ ] Retry failed operations with new credentials
- [ ] Progress indicators and user feedback

### **Phase 4: Ecosystem Expansion**
- [ ] Support for more auth patterns (OAuth, JWT, etc.)
- [ ] Standard schema for MCP auth requirements
- [ ] Documentation for MCP developers
- [ ] Integration testing with all working MCPs

## 🏗️ Technical Architecture

### **AuthPromptManager**
```typescript
class AuthPromptManager {
  private activePrompts = new Map<string, AuthPrompt>();
  private credentialCache = new Map<string, Credentials>();

  async promptForAuth(mcpName: string, error: Error): Promise<void>
  closePrompt(mcpName: string): void
  handleLateResponse(mcpName: string, credentials: Credentials): void
}
```

### **Error Detection**
```typescript
const authErrorPatterns = {
  supabase: {
    missing_url: /SUPABASE_URL.*required/i,
    missing_key: /SUPABASE_ANON_KEY.*required/i,
    prompts: [
      { field: 'url', message: 'Supabase Project URL', type: 'input' },
      { field: 'key', message: 'Supabase Anon Key', type: 'password' }
    ]
  }
  // ... more patterns
};
```

### **Prompt Flow**
1. MCP error detected → Parse for auth requirements
2. Show terminal prompt with 2min timeout
3. AI gets "auth needed" message after 35s
4. Handle user response whenever it arrives
5. Cache credentials and retry operation

## 🎮 Target MCPs for Testing

### **Ready for Auth Prompts**
1. **@supabase/mcp-server-supabase** - URL + API key
2. **figma-mcp** - Personal access token
3. **@upstash/context7-mcp** - Potential Redis credentials

### **Future Candidates**
- Any MCP that throws auth-related errors
- Cloud providers (when packages exist)
- API services with clear error patterns

## 📊 Success Metrics

### **UX Improvements**
- Time from "try MCP" to "working MCP" (target: <2 minutes)
- Reduction in support requests about MCP setup
- User retention after first auth prompt

### **Technical Performance**
- Auth prompt response time (<500ms)
- Credential caching hit rate
- Zero AI workflow interruptions

## 🔒 Security Considerations

### **Credential Handling**
- Memory-only storage by default
- No credentials in AI context
- Optional secure persistence with user consent
- Clear credential lifecycle management

### **Input Validation**
- Sanitize all user inputs
- Validate credential formats
- Secure transmission to MCPs
- Audit trail for debugging

## 🎯 Competitive Advantages

1. **First to Market**: No other MCP client does on-demand auth
2. **Seamless UX**: Zero workflow interruption
3. **Developer Friendly**: Reduces MCP onboarding friction
4. **Ecosystem Growth**: Encourages MCP experimentation

## 📝 Success Scenarios

### **Before (Current)**
```bash
$ npx ncp run supabase:create_table
Error: SUPABASE_URL environment variable is required

# User must:
# 1. Stop and research Supabase setup
# 2. Find API keys in Supabase dashboard
# 3. Export environment variables
# 4. Restart command
# Total time: 5-10 minutes
```

### **After (With Auth Prompts)**
```bash
$ npx ncp run supabase:create_table

🔐 Supabase Authentication Required
⏰ AI continues in 35s, prompt closes in 2min

🔗 Supabase URL: https://xyz.supabase.co
🔑 API Key: ••••••••••••••••••••
💾 Remember for this session? Yes

✅ Connected! Creating table...
# Total time: <60 seconds
```

## 🚦 Next Steps

1. **Start with basic terminal prompt infrastructure**
2. **Test with Supabase MCP for proof of concept**
3. **Iterate on UX based on real usage**
4. **Expand to more MCPs and auth patterns**

---

*This feature represents a fundamental shift in how users interact with MCPs - from setup-heavy to discovery-first workflows.*