/**
 * @file scripts/install.js
 * @description Script to install Ciprnode as a system service (Windows Service / Systemd / LaunchAgent).
 */

import { dirname as _dirname, fromFileUrl as _fromFileUrl, join } from '@std/path';

const install = async () => {
  console.log('Ciprnode Service Installer');
  const os = Deno.build.os;

  // Determine the executable path
  // If run from source (deno run), we assume we want to install the 'dist' binary or the source?
  // Usually a service runs the compiled binary.
  // Let's assume this script is run FROM the location where the binary is (e.g. inside dist/).

  let execPath = '';
  const cwd = Deno.cwd();

  if (os === 'windows') {
    if (await exists(join(cwd, 'ciprnode.exe'))) execPath = join(cwd, 'ciprnode.exe');
    else if (await exists(join(cwd, 'dist', 'ciprnode.exe'))) {
      execPath = join(cwd, 'dist', 'ciprnode.exe');
    }
  } else {
    if (await exists(join(cwd, 'ciprnode'))) execPath = join(cwd, 'ciprnode');
    else if (await exists(join(cwd, 'dist', 'ciprnode'))) execPath = join(cwd, 'dist', 'ciprnode');
  }

  if (!execPath) {
    console.error('Error: Could not find ciprnode executable in current directory or dist/.');
    console.error('Please run this script from the directory containing the ciprnode executable.');
    Deno.exit(1);
  }

  console.log(`Target executable: ${execPath}`);

  if (os === 'windows') {
    await installWindows(execPath, cwd);
  } else if (os === 'linux') {
    await installLinux(execPath, cwd);
  } else if (os === 'darwin') {
    await installMac(execPath, cwd);
  } else {
    console.error(`Unsupported OS: ${os}`);
  }
};

const installWindows = async (execPath, _cwd) => {
  const serviceName = 'Ciprnode';
  console.log(`Installing Windows Service '${serviceName}'...`);

  // Command: sc create Ciprnode binPath= "..." start= auto
  const cmd = new Deno.Command('sc', {
    args: [
      'create',
      serviceName,
      `binPath= "${execPath}"`,
      'start=',
      'auto',
      'DisplayName=',
      'Ciprnode Decentralized Index',
    ],
    stdout: 'inherit',
    stderr: 'inherit',
  });

  const output = await cmd.output();
  if (output.success) {
    console.log('Service created successfully!');
    console.log('To start it, run: sc start Ciprnode');
  } else {
    console.error('Failed to create service. Ensure you are running as Administrator.');
  }
};

const installLinux = async (execPath, cwd) => {
  const serviceName = 'ciprnode.service';
  const serviceContent = `[Unit]
Description=Ciprnode Decentralized Index
After=network.target

[Service]
ExecStart=${execPath}
WorkingDirectory=${cwd}
Restart=always
User=${Deno.env.get('USER')}
Environment=PATH=/usr/bin:/usr/local/bin
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

  const instructions = `
### Manual Linux Installation (Systemd)

1. Create a service file:
   sudo nano /etc/systemd/system/${serviceName}

2. Paste the following content:
${serviceContent}

3. Reload and start:
   sudo systemctl daemon-reload
   sudo systemctl enable ${serviceName}
   sudo systemctl start ${serviceName}
`;
  console.log(instructions);

  // Optionally try to write it if root?
  // Usually safer to just print instructions for Linux users or generate the file.
  await Deno.writeTextFile(serviceName, serviceContent);
  console.log(`\nGenerated local file '${serviceName}' for your convenience.`);
};

const installMac = async (execPath, cwd) => {
  const label = 'com.ciprnode.service';
  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
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
</plist>
`;
  const instructions = `
### Manual macOS Installation (LaunchAgent)

1. Copy the plist file:
   cp ${label}.plist ~/Library/LaunchAgents/

2. Load the service:
   launchctl load ~/Library/LaunchAgents/${label}.plist
`;
  console.log(instructions);
  await Deno.writeTextFile(`${label}.plist`, plistContent);
  console.log(`\nGenerated local file '${label}.plist' for your convenience.`);
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
  install();
}
