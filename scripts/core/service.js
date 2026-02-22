/**
 * @file scripts/service.js
 * @description Unified Service Manager (Install, Uninstall, Start, Stop, Restart, Status).
 */

import { dirname as _dirname, join } from '@std/path';

const COMMANDS = ['install', 'uninstall', 'start', 'stop', 'restart', 'status'];

const main = async () => {
  const action = Deno.args[0];
  if (!action || !COMMANDS.includes(action)) {
    console.log(`Usage: deno run -A service.js <${COMMANDS.join('|')}>`);
    Deno.exit(1);
  }

  const os = Deno.build.os;
  const cwd = Deno.cwd();
  const execPath = await findExecutable(cwd, os);

  if (!execPath && (action === 'install' || action === 'start')) {
    console.error('Error: Could not find ciprnode executable.');
    Deno.exit(1);
  }

  console.log(`Ciprnode Service Manager: ${action.toUpperCase()} (${os})`);

  if (os === 'windows') {
    await manageWindows(action, execPath);
  } else if (os === 'linux') {
    await manageLinux(action, execPath, cwd);
  } else if (os === 'darwin') {
    await manageMac(action, execPath, cwd);
  } else {
    console.error(`Unsupported OS: ${os}`);
  }
};

const findExecutable = async (cwd, os) => {
  const ext = os === 'windows' ? '.exe' : '';
  const name = `ciprnode${ext}`;

  // Check current dir
  if (await exists(join(cwd, name))) return join(cwd, name);
  // Check dist/ (for local dev usage)
  if (await exists(join(cwd, 'dist', name))) return join(cwd, 'dist', name);

  return null;
};

// --- Windows Implementation (sc.exe) ---
const manageWindows = async (action, execPath) => {
  const serviceName = 'Ciprnode';

  switch (action) {
    case 'install':
      await runCmd('sc', [
        'create',
        serviceName,
        `binPath= "${execPath}"`,
        'start=',
        'auto',
        'DisplayName=',
        'Ciprnode Index',
      ]);
      console.log('Service installed. Run "start" to launch it.');
      break;
    case 'uninstall':
      await runCmd('sc', ['delete', serviceName]);
      break;
    case 'start':
      await runCmd('sc', ['start', serviceName]);
      break;
    case 'stop':
      await runCmd('sc', ['stop', serviceName]);
      break;
    case 'restart':
      await runCmd('sc', ['stop', serviceName]);
      // Give it a moment to stop
      await new Promise((r) => setTimeout(r, 2000));
      await runCmd('sc', ['start', serviceName]);
      break;
    case 'status':
      await runCmd('sc', ['query', serviceName]);
      break;
  }
};

// --- Linux Implementation (Systemd) ---
const manageLinux = async (action, execPath, cwd) => {
  const serviceName = 'ciprnode';

  switch (action) {
    case 'install': {
      const content = `[Unit]
Description=Ciprnode Decentralized Index
After=network.target

[Service]
ExecStart=${execPath}
WorkingDirectory=${cwd}
Restart=always
User=${Deno.env.get('USER')}
Environment=PATH=/usr/bin:/usr/local/bin

[Install]
WantedBy=multi-user.target
`;
      console.log('--- To install manually, copy this to /etc/systemd/system/ciprnode.service ---');
      console.log(content);
      console.log('-----------------------------------------------------------------------------');
      console.log('Then run: sudo systemctl daemon-reload && sudo systemctl enable ciprnode');

      // Try automatic if root? assume user handles it or sudo used.
      try {
        // If we have write access to /etc/systemd... unlikely for normal user
        // Just creating a local file for them to copy
        await Deno.writeTextFile('ciprnode.service', content);
        console.log('Generated "ciprnode.service" file in current directory.');
      } catch (_e) { /* ignore */ }
      break;
    }
    case 'uninstall':
      console.log(
        `To uninstall: sudo systemctl disable ${serviceName} && sudo rm /etc/systemd/system/${serviceName}.service`,
      );
      break;
    case 'start':
      await runCmd('sudo', ['systemctl', 'start', serviceName]);
      break;
    case 'stop':
      await runCmd('sudo', ['systemctl', 'stop', serviceName]);
      break;
    case 'restart':
      await runCmd('sudo', ['systemctl', 'restart', serviceName]);
      break;
    case 'status':
      await runCmd('sudo', ['systemctl', 'status', serviceName]);
      break;
  }
};

// --- macOS Implementation (launchctl) ---
const manageMac = async (action, execPath, cwd) => {
  const label = 'com.ciprnode.service';
  const plistPath = `${Deno.env.get('HOME')}/Library/LaunchAgents/${label}.plist`;

  switch (action) {
    case 'install': {
      const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${execPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${cwd}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>`;
      await Deno.writeTextFile(plistPath, content);
      console.log(`Created ${plistPath}`);
      console.log(`Run "start" to load it.`);
      break;
    }
    case 'uninstall':
      await runCmd('launchctl', ['unload', plistPath]);
      await Deno.remove(plistPath);
      break;
    case 'start':
      await runCmd('launchctl', ['load', plistPath]);
      break;
    case 'stop':
      await runCmd('launchctl', ['unload', plistPath]);
      break;
    case 'restart':
      await manageMac('stop', execPath, cwd);
      await new Promise((r) => setTimeout(r, 1000));
      await manageMac('start', execPath, cwd);
      break;
    case 'status':
      await runCmd('launchctl', ['list', label]);
      break;
  }
};

const runCmd = async (cmd, args) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const c = new Deno.Command(cmd, { args, stdout: 'inherit', stderr: 'inherit' });
  return (await c.output()).success;
};

const exists = async (path) => {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
};

if (import.meta.main) {
  main();
}
