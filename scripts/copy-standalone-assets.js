#!/usr/bin/env node
/**
 * Copy static assets into the standalone build.
 * Next.js standalone output needs .next/static and public/
 * copied alongside server.js for CSS/JS/images to work.
 */
const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir('.next/static', '.next/standalone/.next/static');
copyDir('public', '.next/standalone/public');
// Also copy templates for the standalone server
copyDir('templates', '.next/standalone/templates');

console.log('Standalone assets copied.');
