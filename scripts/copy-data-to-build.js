#!/usr/bin/env node

/**
 * Post-build step: Copy generated-data.json to .next/server/
 * This ensures the API route can access the data on Netlify
 */

const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '../data/generated-data.json');
const destination = path.join(__dirname, '../.next/server/generated-data.json');

console.log(`[copy-data] ========== POST-BUILD DATA COPY START ==========`);
console.log(`[copy-data] Source:      ${source}`);
console.log(`[copy-data] Destination: ${destination}`);

try {
  if (!fs.existsSync(source)) {
    console.warn(`[copy-data] ⚠ Source file not found: ${source}`);
    console.warn(`[copy-data] This might happen if generate-live-data.js didn't run or failed.`);
    console.warn(`[copy-data] The API will fall back to placeholder data.`);
    process.exit(0);
  }

  const sourceStats = fs.statSync(source);
  console.log(`[copy-data] ✓ Source file found (${sourceStats.size} bytes)`);

  // Ensure destination directory exists
  const dir = path.dirname(destination);
  if (!fs.existsSync(dir)) {
    console.log(`[copy-data] Creating destination directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }

  // Copy file
  fs.copyFileSync(source, destination);
  const destStats = fs.statSync(destination);
  console.log(`[copy-data] ✓ File copied successfully`);
  console.log(`[copy-data]   Source size:      ${sourceStats.size} bytes`);
  console.log(`[copy-data]   Destination size: ${destStats.size} bytes`);
  console.log(`[copy-data] `);
  console.log(`[copy-data] This data will now be available to the API route at runtime.`);
  console.log(`[copy-data] ========== POST-BUILD DATA COPY COMPLETE ==========`);
} catch (error) {
  console.error(`[copy-data] ✗ Failed to copy data file:`, error instanceof Error ? error.message : error);
  console.error(`[copy-data] The API will fall back to placeholder data.`);
  process.exit(1);
}
