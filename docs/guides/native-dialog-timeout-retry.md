# Native Dialog Timeout & Retry Mechanism

## The Problem

When using native OS dialogs as fallback for MCP elicitation:

**Before Fix:**
- Dialog timeout: 300 seconds (5 minutes)
- AI timeout: ~30-60 seconds
- **Result**: AI gives up, but dialog is still waiting for user
- User clicks "Approve" at 90 seconds → Too late, AI already cancelled

## The Solution: Progressive Timeout with Retry

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Flow 1: User responds within 45 seconds (Happy Path)        │
├─────────────────────────────────────────────────────────────┤
│ 1. AI requests add/remove operation                         │
│ 2. Native dialog shows (45s timeout)                        │
│ 3. User clicks "Approve" within 45s                         │
│ 4. Operation proceeds ✅                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Flow 2: User responds after 45s (Retry Path)                │
├─────────────────────────────────────────────────────────────┤
│ 1. AI requests add/remove operation                         │
│ 2. Native dialog shows (45s timeout)                        │
│ 3. 45 seconds elapse...                                     │
│ 4. AI receives: "⏳ Waiting for confirmation..." + retry    │
│    instructions                                              │
│ 5. User sees dialog, clicks "Approve" at 60s               │
│ 6. AI retries same operation                                │
│ 7. System finds cached response → Operation proceeds ✅     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Flow 3: User never responds (Timeout Path)                  │
├─────────────────────────────────────────────────────────────┤
│ 1. AI requests add/remove operation                         │
│ 2. Native dialog shows (45s timeout)                        │
│ 3. 45 seconds elapse... dialog times out                    │
│ 4. AI receives: "⏳ Waiting for confirmation..."            │
│ 5. Dialog closes automatically                              │
│ 6. AI retries → Gets "already timed out" response           │
│ 7. Operation cancelled ❌                                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. **Dialog Caching (native-dialog.ts)**

```typescript
// Pending dialogs - track dialogs that are still waiting
const pendingDialogs = new Map<string, PendingDialog>();

// Completed dialogs - cache responses for 60 seconds
const completedDialogs = new Map<string, { result: DialogResult; timestamp: number }>();

// Hash dialog by content to match retries
function getDialogHash(options: DialogOptions): string {
  return `${options.title}:${options.message}:${options.buttons?.join(',')}`;
}
```

#### 2. **Smart Timeout Handling**

- **First call**: Shows dialog, waits up to 45 seconds
- **Timeout occurs**: Returns `{ timedOut: true, stillPending: true }`
- **Retry call**: Checks cache:
  - If user responded → Return cached result
  - If still pending → Return timeout again
  - If already timed out → Return cancelled

#### 3. **User-Friendly Error Messages (ncp-management.ts)**

```typescript
if (result.timedOut && result.stillPending) {
  return {
    success: false,
    error: `⏳ Waiting for user confirmation...\n\n` +
           `A confirmation dialog is still open on your system. Please:\n` +
           `1. Check for a dialog box asking to approve MCP installation\n` +
           `2. Click "Approve" or "Cancel" in that dialog\n` +
           `3. Retry this operation (I'll check if you already responded)\n\n` +
           `💡 If you already clicked Approve, just retry this exact same operation and it will proceed.`
  };
}
```

### Configuration

**Default timeout**: 45 seconds (configurable via `DialogOptions.timeoutSeconds`)

**Why 45 seconds?**
- Long enough for user to read and respond
- Short enough to keep AI responsive
- Balances user experience with AI timeout constraints

**Cache retention**: 60 seconds after user responds

### Benefits

1. ✅ **AI stays responsive** - Returns within 45 seconds
2. ✅ **User has flexibility** - Can respond after initial timeout
3. ✅ **No lost confirmations** - Responses cached for retry
4. ✅ **Clear guidance** - User knows exactly what to do
5. ✅ **Automatic cleanup** - Stale cache entries removed

### Testing Scenarios

#### Test 1: Quick Response (< 45s)
```
1. Trigger: Add MCP
2. Dialog appears
3. Click "Approve" within 30 seconds
4. Expected: Operation succeeds immediately
```

#### Test 2: Slow Response (> 45s, < 60s)
```
1. Trigger: Add MCP
2. Dialog appears
3. Wait 50 seconds, then click "Approve"
4. Expected: AI shows "Waiting..." message
5. Retry: Same add operation
6. Expected: Operation succeeds using cached response
```

#### Test 3: No Response
```
1. Trigger: Add MCP
2. Dialog appears
3. Don't click anything
4. Expected: After 45s, AI shows "Waiting..." message
5. Expected: Dialog closes automatically
6. Retry: Same add operation
7. Expected: "Already timed out" → Operation cancelled
```

### Implementation Details

**File**: `src/utils/native-dialog.ts`
- Lines 29-55: Dialog caching structures
- Lines 80-181: Smart timeout and retry logic

**File**: `src/internal-mcps/ncp-management.ts`
- Lines 250-278: Add operation retry handling
- Lines 401-429: Remove operation retry handling

### How AI Should Retry

When AI receives timeout message:

1. **Parse the error**: Check for "⏳ Waiting for user confirmation..."
2. **Inform user**: Show the message with instructions
3. **Wait briefly**: Optional 5-10 second delay
4. **Retry exact operation**: Same parameters, same MCP name
5. **Check result**:
   - Success → User approved, proceed
   - Timeout again → User hasn't responded, inform and wait
   - Error → Different error, handle accordingly

### Future Enhancements

1. **Progress indicators**: Show countdown timer in dialog
2. **Audio notification**: Alert user when dialog appears
3. **Configurable timeouts**: Per-operation timeout settings
4. **Async notifications**: Push notification when dialog times out
5. **Multi-step confirmations**: Chain multiple confirmations with state

### Related Documentation

- [MCP Prompts for User Interaction](./mcp-prompts-for-user-interaction.md)
- [Clipboard Security Pattern](./clipboard-security-pattern.md)
- [Telemetry Design](./telemetry-design.md)
