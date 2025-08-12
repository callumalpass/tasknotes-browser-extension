#!/usr/bin/env node

/**
 * Simple icon generator for TaskNotes browser extension
 * Creates PNG icons in required sizes using Node.js
 */

const fs = require('fs');
const path = require('path');

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// SVG icon template - simple clipboard/task icon
const createSVGIcon = (size) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#2563eb;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1d4ed8;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="url(#bg)"/>
  
  <!-- Clipboard body -->
  <rect x="${size * 0.2}" y="${size * 0.15}" width="${size * 0.6}" height="${size * 0.7}" rx="${size * 0.05}" fill="#ffffff" stroke="#e5e7eb" stroke-width="${size * 0.01}"/>
  
  <!-- Clipboard clip -->
  <rect x="${size * 0.35}" y="${size * 0.1}" width="${size * 0.3}" height="${size * 0.1}" rx="${size * 0.02}" fill="#9ca3af"/>
  
  <!-- Checkmark lines -->
  <rect x="${size * 0.3}" y="${size * 0.35}" width="${size * 0.4}" height="${size * 0.02}" fill="#2563eb"/>
  <rect x="${size * 0.3}" y="${size * 0.45}" width="${size * 0.3}" height="${size * 0.02}" fill="#2563eb"/>
  <rect x="${size * 0.3}" y="${size * 0.55}" width="${size * 0.35}" height="${size * 0.02}" fill="#2563eb"/>
  
  <!-- Check mark -->
  <path d="M ${size * 0.27} ${size * 0.65} L ${size * 0.32} ${size * 0.7} L ${size * 0.42} ${size * 0.6}" 
        stroke="#10b981" stroke-width="${size * 0.015}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

// Convert SVG to base64 PNG data URL (simplified approach)
const createIconDataURL = (size) => {
    const svg = createSVGIcon(size);
    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
};

// For this simple approach, we'll create SVG files that browsers can use
const sizes = [16, 32, 48, 128];

sizes.forEach(size => {
    const svg = createSVGIcon(size);
    const filename = path.join(iconsDir, `icon-${size}.svg`);
    fs.writeFileSync(filename, svg);
    console.log(`Created ${filename}`);
});

console.log('\nSVG icons created successfully!');
console.log('Note: Chrome prefers PNG files. You can:');
console.log('1. Use an online SVG-to-PNG converter');
console.log('2. Or temporarily use SVG files by updating manifest.json');
console.log('3. The extension should load with SVG files as a temporary solution');