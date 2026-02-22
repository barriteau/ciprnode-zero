/**
 * @file scripts/build.js
 * @description Build script to compile and bundle Ciprnode-zero for multiple platforms.
 */

import { copy } from '@std/fs';
import { join } from '@std/path';
import { crypto } from '@std/crypto';

/**
 * Define targets.
 */
const TARGETS = [
  { name: 'ciprnode-zero-win-x64', target: 'x86_64-pc-windows-msvc', ext: '.exe' },
  { name: 'ciprnode-zero-linux-x64', target: 'x86_64-unknown-linux-gnu', ext: '' },
  { name: 'ciprnode-zero-mac-arm64', target: 'aarch64-apple-darwin', ext: '' },
];

const generateChecksum = async (filePath) => {
  const data = await Deno.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

const build = async () => {
  console.log('Starting Multi-Target Build (ciprnode-zero)...');

  const distDir = join(Deno.cwd(), 'dist');

  // 1. Clean dist
  try {
    await Deno.remove(distDir, { recursive: true });
  } catch (_e) {
    // Ignore
  }
  await Deno.mkdir(distDir, { recursive: true });

  for (const t of TARGETS) {
    console.log(`\n--- Building for ${t.name} (${t.target}) ---`);

    const _bundleStart = performance.now();
    // Use a fixed directory name "ciprnode-zero" inside the archive
    const internalDirName = 'ciprnode-zero';
    const bundleDir = join(distDir, internalDirName);

    // Ensure clean state for this iteration
    try {
      await Deno.remove(bundleDir, { recursive: true });
    } catch { /* ignore */ }
    await Deno.mkdir(bundleDir, { recursive: true });

    // A. Compile
    // Binary name remains 'ciprnode' inside the bundle for consistency
    const binName = `ciprnode${t.ext}`;
    const args = [
      'compile',
      '--allow-net',
      '--allow-read',
      '--allow-write',
      '--allow-env',
      '--allow-ffi',
      '--target',
      t.target,
      '--output',
      join(bundleDir, binName),
      'main.js',
    ];

    console.log(`Compiling...`);
    const cmd = new Deno.Command(Deno.execPath(), {
      args: args,
      stdout: 'inherit',
      stderr: 'inherit',
    });

    const output = await cmd.output();
    if (!output.success) {
      console.error(`Failed to build for ${t.target}`);
      continue;
    }

    // A.1 Code Signing (TODO)
    // Placeholder: Integration with signtool (Windows) or codesign (Mac) should happen here.
    // e.g. if (t.target.includes('windows')) await signBinary(join(bundleDir, binName));

    // B. Copy Assets
    console.log('Copying assets...');
    try {
      await copy(join(Deno.cwd(), 'public'), join(bundleDir, 'public'));
    } catch { /* ignore */ }
    try {
      await Deno.copyFile(
        join(Deno.cwd(), 'ciprnode.toml'),
        join(bundleDir, 'ciprnode.example.toml'),
      );
    } catch { /* ignore */ }
    try {
      await Deno.mkdir(join(bundleDir, 'data'), { recursive: true });
    } catch { /* ignore */ }
    try {
      await Deno.copyFile(join(Deno.cwd(), 'start.bat'), join(bundleDir, 'start.bat'));
    } catch { /* ignore */ }
    try {
      await Deno.copyFile(join(Deno.cwd(), 'start.sh'), join(bundleDir, 'start.sh'));
    } catch { /* ignore */ }
    try {
      await Deno.copyFile(
        join(Deno.cwd(), 'scripts', 'core', 'service.js'),
        join(bundleDir, 'service.js'),
      );
    } catch { /* ignore */ }

    // Copy Templates & Locales for SSR
    try {
      // Ensure src dir exists
      await Deno.mkdir(join(bundleDir, 'src'), { recursive: true });

      console.log('  Copying templates...');
      await copy(join(Deno.cwd(), 'src', 'templates'), join(bundleDir, 'src', 'templates'), {
        overwrite: true,
      });

      console.log('  Copying locales...');
      await copy(join(Deno.cwd(), 'src', 'locales'), join(bundleDir, 'src', 'locales'), {
        overwrite: true,
      });
    } catch (e) {
      console.warn('  [WARN] Failed to copy SSR assets:', e.message);
    }
    // Copy README if exists
    try {
      await Deno.copyFile(join(Deno.cwd(), 'README.md'), join(bundleDir, 'README.md'));
    } catch { /* ignore */ }
    // Copy Specification
    try {
      await Deno.copyFile(
        join(Deno.cwd(), 'Cipr Specification.md'),
        join(bundleDir, 'Cipr Specification.md'),
      );
    } catch (_e) { /* ignore */ }

    // C. Create Archives
    const archives = [];

    // 1. ZIP
    try {
      const zipName = `${t.name}.zip`;
      console.log(`Creating ${zipName}...`);
      const zipCmd = new Deno.Command('tar', {
        // Archive the fixed directory 'ciprnode-zero'
        args: ['-a', '-cf', zipName, internalDirName],
        cwd: distDir,
        stdout: 'inherit', // tar might be noisy
        stderr: 'inherit',
      });
      if ((await zipCmd.output()).success) archives.push(zipName);
    } catch (_err) {
      console.warn('ZIP creation failed');
    }

    // 2. TAR.GZ
    try {
      const tarName = `${t.name}.tar.gz`;
      console.log(`Creating ${tarName}...`);
      // tar -czf on Linux/Mac. On Windows tar usually supports -z if it's the BSD tar packaged with Win 10.
      const tarCmd = new Deno.Command('tar', {
        args: ['-czf', tarName, internalDirName],
        cwd: distDir,
        stderr: 'piped', // Suppress errors if -z not supported
      });
      if ((await tarCmd.output()).success) {
        archives.push(tarName);
      } else {
        // Fallback: simple .tar if gzip not supported? Or warn.
        console.warn('TAR.GZ creation failed (flags might vary by OS)');
      }
    } catch (_err) {
      console.warn('TAR.GZ creation skipped');
    }

    // 3. 7Z
    try {
      const sevenZName = `${t.name}.7z`;
      console.log(`Creating ${sevenZName}...`);
      const sevenZCmd = new Deno.Command('7z', {
        args: ['a', sevenZName, internalDirName],
        cwd: distDir,
        stdout: 'null', // 7z is very verbose
        stderr: 'inherit',
      });
      if ((await sevenZCmd.output()).success) archives.push(sevenZName);
      else console.warn('7z command failed (is it in PATH?)');
    } catch (_err) {
      console.warn('7z not found in PATH, skipping .7z');
    }

    // D. Generate Checksums
    console.log('Generating Checksums...');
    for (const archive of archives) {
      const archivePath = join(distDir, archive);
      const sum = await generateChecksum(archivePath);
      const sumFileName = `${archive}.sha256`;
      await Deno.writeTextFile(join(distDir, sumFileName), `${sum}  ${archive}\n`);
      console.log(`Generated ${sumFileName}`);
    }

    // E. Cleanup
    console.log(`Cleaning up ${internalDirName}...`);
    await Deno.remove(bundleDir, { recursive: true });
  }

  console.log('\nBuild Process Complete.');
};

if (import.meta.main) {
  build();
}
