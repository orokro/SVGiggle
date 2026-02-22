import { describe, it, expect, beforeAll } from 'vitest';
import { SVGiggle } from '../src/SVGiggle.js';
import fs from 'fs';
import path from 'path';
import DOMMatrix from 'dommatrix';

// Polyfill DOMMatrix
if (typeof global.DOMMatrix === 'undefined') {
    global.DOMMatrix = DOMMatrix;
}

// Helper to wait for loading
const waitForLoad = async (s) => {
    if (s.ready) await s.ready;
};

describe('SVGiggle Naming Normalization', () => {
    it('should normalize IDs correctly in Cat_Demo.svg', async () => {
        const filePath = 'svgs/Cat_Demo.svg';
        const s = new SVGiggle(filePath);
        await waitForLoad(s);
        
        const svg = s.svg;
        expect(svg).toBeDefined();

        // Check Base IDs (still present in DOM)
        const checkId = (originalId, expectedNormalizedId) => {
            const el = svg.querySelector(`[id="${originalId}"]`);
            expect(el).not.toBeNull();
            expect(el.getAttribute('data-normalized-id')).toBe(expectedNormalizedId);
        };

        checkId('Face-Shape', 'face-shape');
        checkId('Mouth', 'mouth');
        checkId('Eye_1_', 'eye');
        checkId('Eye-Clppng_8_', 'eye-clppng');

        // Verify Shape Keys extracted
        expect(s.shapeKeys['left-eye-closed']).toBeDefined();
        // Inside left-eye-closed: Mouth_copy_3 -> mouth.
        // Inside Mouth_copy_3: Bottom_11_ -> bottom.
        // Base Mouth: Bottom -> bottom.
        // So delta for 'bottom' should be in left-eye-closed.
        expect(s.shapeKeys['left-eye-closed']['bottom']).toBeDefined();
        
        // Also check right-eye-closed
        expect(s.shapeKeys['right-eye-closed']).toBeDefined();
        
        // Also check mouth-closed
        expect(s.shapeKeys['mouth-closed']).toBeDefined();
    });

    it('should cleanId correctly (unit test)', () => {
        // Create valid dummy structure
        const dummySvg = document.createElement('svg');
        const base = document.createElement('g');
        base.setAttribute('id', 'base');
        base.setAttribute('data-normalized-id', 'base'); // Needs this for extractBlendShapes logic
        dummySvg.appendChild(base);
        
        const s = new SVGiggle(dummySvg); 
        
        expect(s.cleanId('Test')).toBe('test');
        expect(s.cleanId('Test_1_')).toBe('test');
        expect(s.cleanId('Layer_copy')).toBe('layer');
        expect(s.cleanId('Layer_copy_2')).toBe('layer');
        expect(s.cleanId('Object_x002D_Name')).toBe('object-name');
        expect(s.cleanId('Complex_Name_1__copy_5')).toBe('complex_name');
    });
});
