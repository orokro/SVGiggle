#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const DOMMatrix = require('dommatrix'); 
const { JSDOM } = require('jsdom');

// Polyfill DOMMatrix for Node environment
global.DOMMatrix = DOMMatrix;

// Polyfill DOMParser via jsdom
const dom = new JSDOM('');
global.DOMParser = dom.window.DOMParser;
global.window = dom.window;
global.document = dom.window.document;

// Load SVGiggle from dist (UMD)
// We need to resolve relative to this file
const lib = require('../dist/svgiggle.umd.js');
const SVGiggle = lib.SVGiggle;

// Parse args
const args = process.argv.slice(2);
let maxDepth = Infinity;

// Filter flags and parse options
const positionals = args.filter(arg => {
    if (arg.startsWith('-d=')) {
        const val = parseInt(arg.split('=')[1], 10);
        if (!isNaN(val)) maxDepth = val;
        return false;
    }
    return true;
});

if (positionals.length < 1) {
    console.log('Usage: node svgtree.js <filename> [clean] [showOriginal] [-d=N]');
    process.exit(1);
}

const filename = positionals[0];
const clean = positionals[1] === 'true';
const showOriginal = positionals[2] === 'true';

const possiblePaths = [
    filename,
    path.join(__dirname, '../svgs', filename),
    path.join(process.cwd(), filename)
];

let filePath = possiblePaths.find(p => fs.existsSync(p));

if (!filePath) {
    console.error('File not found:', filename);
    console.error('Searched in:');
    possiblePaths.forEach(p => console.error('- ' + p));
    process.exit(1);
}

// Run
(async () => {
    try {
        const s = new SVGiggle(filePath);
        await s.ready;
        console.log(s.tree(clean, showOriginal, maxDepth));
    } catch (e) {
        console.error('Error:', e);
    }
})();
