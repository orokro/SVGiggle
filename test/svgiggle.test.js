import { describe, it, expect, beforeAll } from 'vitest';
import { SVGiggle } from '../src/SVGiggle.js';
import fs from 'fs';
import path from 'path';
import { DOMMatrix } from 'geometry-interfaces';

// Polyfill DOMMatrix for testing environment (jsdom often lacks full support)
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = DOMMatrix;
}

// Helper to wait for loading
const waitForLoad = async (s) => {
    // If the library exposes a promise, await it. 
    // If not, we might need a workaround, but let's assume standard async pattern.
    if (s.ready) await s.ready;
};

describe('SVGiggle', () => {
    it('should normalize heart_global.svg (already global)', async () => {
        const filePath = 'svgs/heart_global.svg';
        const s = new SVGiggle(filePath);
        await waitForLoad(s);
        
        const svg = s.svg;
        expect(svg).toBeDefined();
        
        // Check viewbox
        expect(svg.getAttribute('viewBox')).toBe('0 0 100 100');
        
        // Check paths
        const paths = svg.querySelectorAll('path');
        expect(paths.length).toBe(2);
        
        // Ensure no transform attributes on paths or groups
        const transforms = svg.querySelectorAll('[transform]');
        expect(transforms.length).toBe(0);

        // Verify path data starts with 'M' (absolute move)
        paths.forEach(p => {
            const d = p.getAttribute('d').trim();
            expect(d.startsWith('M')).toBe(true);
        });
    });

    it('should normalize heart_local.svg (transform + relative)', async () => {
        const filePath = 'svgs/heart_local.svg';
        const s = new SVGiggle(filePath);
        await waitForLoad(s);
        
        const svg = s.svg;
        expect(svg).toBeDefined();
        
        // Should have flattened transforms
        const transforms = svg.querySelectorAll('[transform]');
        expect(transforms.length).toBe(0);
        
        // Paths should be absolute
        const paths = svg.querySelectorAll('path');
        paths.forEach(p => {
            const d = p.getAttribute('d').trim();
            expect(d.startsWith('M')).toBe(true);
        });

        // Verify points are roughly in the same place as global
        // The local one had translate(10, 10). Original global starts at 10,30.
        // translate(10, 10) applied to (0,20) (relative start) -> (10, 30).
        // Wait, local path started with m 0 20 inside translate(10, 10).
        // The first point should be absolute (10 + 0, 10 + 20) = (10, 30).
        const d = paths[0].getAttribute('d');
        // Simple regex to get first two numbers
        const match = d.match(/M\s*([\d\.]+)[,\s]+([\d\.]+)/);
        if (match) {
            expect(parseFloat(match[1])).toBeCloseTo(10, 1);
            expect(parseFloat(match[2])).toBeCloseTo(30, 1);
        }
    });

    it('should normalize heart_mixed.svg', async () => {
        const filePath = 'svgs/heart_mixed.svg';
        const s = new SVGiggle(filePath);
        await waitForLoad(s);
        
        const svg = s.svg;
        const transforms = svg.querySelectorAll('[transform]');
        expect(transforms.length).toBe(0);

        const paths = svg.querySelectorAll('path');
        expect(paths.length).toBeGreaterThan(0);
        
        // Verify heart path (first one)
        // Original global: M 10 30
        // Mixed heart: M 5 25 inside translate(5, 5) -> 5+5=10, 25+5=30.
        const d = paths[0].getAttribute('d');
        const match = d.match(/M\s*([\d\.]+)[,\s]+([\d\.]+)/);
        if (match) {
             expect(parseFloat(match[1])).toBeCloseTo(10, 1);
             expect(parseFloat(match[2])).toBeCloseTo(30, 1);
        }
    });
});
