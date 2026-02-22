import { describe, it, expect, beforeAll } from 'vitest';
import { SVGiggle } from '../src/SVGiggle.js';
import fs from 'fs';
import path from 'path';
import DOMMatrix from 'dommatrix';

// Polyfill DOMMatrix for testing environment
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = DOMMatrix;
}

// Helper to wait for loading
const waitForLoad = async (s) => {
    if (s.ready) await s.ready;
};

describe('SVGiggle Shapes', () => {
    it('should normalize shapes_mixed.svg (convert shapes to paths)', async () => {
        const filePath = 'svgs/shapes_mixed.svg';
        const s = new SVGiggle(filePath);
        await waitForLoad(s);
        
        const svg = s.svg;
        expect(svg).toBeDefined();

        // 1. Check that all transforms are removed
        const transforms = svg.querySelectorAll('[transform]');
        expect(transforms.length).toBe(0, 'All transforms should be removed/flattened');

        // 2. Check that shapes are converted to paths
        const rects = svg.querySelectorAll('rect');
        expect(rects.length).toBe(0, 'Rects should be converted to paths');
        
        const circles = svg.querySelectorAll('circle');
        expect(circles.length).toBe(0, 'Circles should be converted to paths');
        
        const ellipses = svg.querySelectorAll('ellipse');
        expect(ellipses.length).toBe(0, 'Ellipses should be converted to paths');
        
        const lines = svg.querySelectorAll('line');
        expect(lines.length).toBe(0, 'Lines should be converted to paths');

        const polylines = svg.querySelectorAll('polyline');
        expect(polylines.length).toBe(0, 'Polylines should be converted to paths');

        const polygons = svg.querySelectorAll('polygon');
        expect(polygons.length).toBe(0, 'Polygons should be converted to paths');

        // 3. Verify we have paths instead
        const paths = svg.querySelectorAll('path');
        // We have 6 shapes in the SVG file, so we expect at least 6 paths
        expect(paths.length).toBeGreaterThanOrEqual(6);

        // 4. Verify path data exists and is absolute
        paths.forEach(p => {
            const d = p.getAttribute('d');
            expect(d).toBeTruthy();
            expect(d.trim().toUpperCase().startsWith('M')).toBe(true, 'Path should start with Move command');
            
            // Check that only M, C, Z commands are present (and numbers/spaces)
            // Remove numbers and spaces
            const commands = d.replace(/[\d\.\-\s,]/g, '');
            // Expect commands to only contain M, C, Z
            expect(commands).toMatch(/^[MCZ]+$/);
        });
    });
});
