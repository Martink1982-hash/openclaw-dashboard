#!/usr/bin/env node

/**
 * Post-build step: Copy generated-data.json to .next/server/
 * This ensures the API route can access the data on Netlify
 */

const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '../data/generated-data.json');
const destination = path.join(__dirname, '../.next/server/generated-data.json');

try {
  if (!fs.existsSync(source)) {
    console.warn(`[copy-data] ⚠ Source file not found: ${source}`);
    process.exit(0);
  }

  // Ensure destination directory exists
  const dir = path.dirname(destination);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(source, destination);
  const stat = fs.statSync(destination);
  console.log(`[copy-data] ✓ Copied ${source.split('/').pop()} (${stat.size} bytes) to ${destination}`);
} catch (error) {
  console.error(`[copy-data] ✗ Failed to copy data file:`, error instanceof Error ? error.message : error);
  process.exit(1);
}
