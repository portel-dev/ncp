# macOS Permissions for NCP Scheduler

## Required Permissions

The NCP scheduler uses your system's crontab to run scheduled tasks. On macOS, this requires **Automation** permissions.

## First-Time Setup

When you create your first schedule, macOS will show a permission dialog:

```
"[App Name]" would like to access data from other apps.
```

Click **Allow** to grant permission.

## Manual Permission Setup

If you accidentally clicked "Don't Allow", you can grant permissions manually:

### For Terminal/iTerm Users

1. Open **System Preferences**
2. Go to **Security & Privacy** → **Privacy** tab
3. Select **Automation** from the left sidebar
4. Find your terminal app (iTerm, Terminal, etc.)
5. Check the box next to **System Events**

### For Claude Desktop Users

1. Open **System Preferences**
2. Go to **Security & Privacy** → **Privacy** tab
3. Select **Automation** from the left sidebar
4. Find **Claude** in the list
5. Check the box next to **System Events**

### For Other MCP Clients

The app running the MCP server (not Node.js itself) needs permission:
- VS Code → Grant Automation permission to "Code"
- Cursor → Grant Automation permission to "Cursor"
- Custom apps → Grant Automation permission to your app

## Troubleshooting

### Permission Dialog Keeps Appearing

If the dialog appears every time despite clicking Allow:

1. **Reset the permission**:
   ```bash
   tccutil reset AppleEvents
   ```

2. **Restart your terminal/application**

3. **Try creating a schedule again** - the dialog should appear one more time

4. **Click Allow** - it should now persist

### Permission Not Listed

If your app doesn't appear in Automation settings:

1. The app hasn't requested permission yet - create a schedule to trigger the request
2. After the dialog appears and you click Allow, it will show in settings

### Still Having Issues?

Create a test schedule to verify permissions:

```bash
ncp run schedule:create --params '{
  "name": "permission-test",
  "schedule": "*/5 * * * *",
  "tool": "Shell:run_command",
  "parameters": {"command": "echo test"}
}'
```

If this works without showing the dialog, permissions are correctly configured.

## Why This Permission is Needed

NCP scheduler integrates with your system's cron daemon to ensure:
- ✅ Scheduled tasks run even when the MCP server is not active
- ✅ Tasks survive system reboots
- ✅ Standard Unix cron syntax works as expected
- ✅ Reliability and consistency with other system automation

The permission allows NCP to:
- Read your current crontab (`crontab -l`)
- Add new scheduled tasks (`crontab`)
- Remove scheduled tasks when deleted

## Security Note

This permission only allows the app to:
- Modify **your user's** crontab (not system-wide)
- Send automation commands to System Events

It does **NOT** grant:
- Full Disk Access
- Access to other apps' data
- System-level modifications
