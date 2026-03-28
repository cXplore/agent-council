#!/usr/bin/env node

const { execSync, spawn } = require('child_process');
const http = require('http');
const path = require('path');

const appDir = path.join(__dirname, '..');

// Parse CLI args
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Agent Council — meeting companion for Claude Code agents

  Usage: agent-council [options]

  Options:
    --port, -p <port>  Server port (default: 3003, env: PORT)
    --no-open          Don't open browser automatically
    --help, -h         Show this help message
    --version, -v      Show version
`);
  process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = require(path.join(appDir, 'package.json'));
  console.log(`agent-council v${pkg.version}`);
  process.exit(0);
}

const portIdx = args.findIndex(a => a === '--port' || a === '-p');
const PORT = portIdx !== -1 && args[portIdx + 1] ? args[portIdx + 1] : process.env.PORT || 3003;
const noOpen = args.includes('--no-open');

// Colors
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const purple = (s) => `\x1b[35m${s}\x1b[0m`;

console.log('');
console.log(`  ${purple('●')} ${bold('Agent Council')}`);
console.log(`  ${dim('Starting server on port ' + PORT + '...')}`);
console.log('');

// Check if node_modules exists
try {
  require.resolve(path.join(appDir, 'node_modules', 'next'));
} catch {
  console.log(`  ${dim('Installing dependencies...')}`);
  execSync('npm install --production', { cwd: appDir, stdio: 'inherit' });
  console.log('');
}

// Build if needed
const fs = require('fs');
if (!fs.existsSync(path.join(appDir, '.next'))) {
  console.log(`  ${dim('Building...')}`);
  execSync('npx next build', { cwd: appDir, stdio: 'inherit' });
  console.log('');
}

// Start production server using standalone build
const serverJs = path.join(appDir, '.next', 'standalone', 'server.js');
const server = spawn('node', [serverJs], {
  cwd: path.join(appDir, '.next', 'standalone'),
  env: { ...process.env, PORT: String(PORT), HOSTNAME: 'localhost', NODE_ENV: 'production' },
  stdio: 'pipe',
});

server.stdout.on('data', (data) => {
  const line = data.toString().trim();
  if (line.includes('Ready')) {
    console.log(`  ${purple('●')} ${bold('Ready')} at http://localhost:${PORT}`);
    console.log(`  ${dim('Press Ctrl+C to stop')}`);
    console.log('');

    // Open browser (unless --no-open)
    if (!noOpen) {
      const open = process.platform === 'win32' ? 'start'
        : process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(open, [`http://localhost:${PORT}`], { shell: true, stdio: 'ignore' });
    }
  }
});

server.stderr.on('data', (data) => {
  const line = data.toString().trim();
  if (line && !line.includes('ExperimentalWarning')) {
    process.stderr.write(`  ${dim(line)}\n`);
  }
});

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});

process.on('SIGTERM', () => {
  server.kill();
  process.exit(0);
});
