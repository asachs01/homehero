# Installation Guide

This guide walks you through installing the Family Household Manager add-on for Home Assistant.

## Prerequisites

- **Home Assistant with Supervisor** - Requires Home Assistant OS or a Supervised installation

That's it! The add-on is self-contained with an embedded SQLite database - no external database required.

## Step 1: Add the Repository

1. Navigate to **Settings > Add-ons > Add-on Store**
2. Click the **three-dot menu** in the top right corner
3. Select **Repositories**
4. Add the Family Household Manager repository URL:
   ```
   https://github.com/asachs01/homeassistantChores
   ```
5. Click **Add**
6. The repository will be scanned and the add-on will appear in the store

## Step 2: Install the Add-on

1. Find **"Family Household Manager"** in the add-on store
2. Click on it to view details
3. Click **Install**
4. Wait for the installation to complete (this may take a few minutes)

## Step 3: Start the Add-on

1. Go to the add-on's **Info** tab
2. Toggle **Start on boot** if desired
3. Toggle **Show in sidebar** to add a menu link
4. Click **Start**
5. Check the **Log** tab for any errors

If the add-on starts successfully, you'll see:
```
[INFO] Starting Family Household Manager...
[INFO] Using SQLite database at /data/family-chores.db
Family Household Manager running on port 3000
```

## Step 4: Complete Onboarding

1. Click **Open Web UI** or navigate to:
   ```
   http://[YOUR_HA_IP]:3000
   ```

2. You'll be redirected to the onboarding screen

3. **Create your household**:
   - Enter a name for your household (e.g., "The Smith Family")
   - Click **Create Household**

4. **Create the first parent account**:
   - Enter parent's name
   - Select an avatar
   - Create a 4-6 digit PIN (required for parents)
   - Click **Create Account**

5. You'll be redirected to the login screen

6. **Log in** with the parent account you just created

7. From the admin panel, you can:
   - Add more family members (parents and children)
   - Create tasks
   - Build routines
   - Assign routines to children

## Accessing the Interface

### From Home Assistant Sidebar

If you enabled "Show in sidebar", click **Family Household Manager** in the Home Assistant sidebar.

### Direct URL

Access the web interface directly at:
```
http://[YOUR_HA_IP]:3000
```

## Troubleshooting

### Add-on Won't Start

1. **Check the logs**: Go to the add-on's Log tab for error messages

2. **Port conflicts**:
   - If port 3000 is in use, another add-on may be using it
   - Check for conflicts in Home Assistant's network settings

3. **Rebuild the add-on**:
   - Go to the add-on's Info tab
   - Click **Rebuild** to force a fresh build

### "No household found" After Restart

The SQLite database is stored at `/data/family-chores.db` inside the add-on container. This directory persists across restarts and updates. If data is lost:
- Check the add-on logs for database errors
- Verify the `/data` directory is mounted correctly

### Can't Access Web Interface

1. Verify the add-on is running (check Info tab)
2. Check if the port is exposed correctly
3. Try accessing via IP address instead of hostname
4. Check your network/firewall settings

## Backup and Restore

### Backing Up Data

The Family Household Manager stores all data in SQLite at `/data/family-chores.db`.

**Using Home Assistant**:
- Create a full Home Assistant backup
- This includes the add-on's `/data` directory

**Manual backup**:
The SQLite database file can be copied directly while the add-on is stopped.

### Restoring Data

**From Home Assistant backup**:
- Restore the full backup
- The add-on and database will be restored together

**Manual restore**:
1. Stop the add-on
2. Replace `/data/family-chores.db` with your backup
3. Start the add-on

## Updating

When updates are available:

1. Go to **Settings > Add-ons**
2. Click on **Family Household Manager**
3. Click **Update** if available
4. The add-on will restart automatically

Database migrations are handled automatically during startup.

## Uninstalling

To remove the add-on:

1. Go to **Settings > Add-ons**
2. Click on **Family Household Manager**
3. Click **Uninstall**

**Note**: Uninstalling removes the database and all data. Create a backup first if you want to preserve your data.

## Getting Help

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section above
2. Review the add-on logs for specific error messages
3. Search existing [GitHub issues](https://github.com/asachs01/homeassistantChores/issues)
4. Open a new issue with:
   - Home Assistant version
   - Add-on version
   - Relevant log entries
   - Steps to reproduce the issue
