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

        // Helper to check normalized ID
        const checkId = (originalId, expectedNormalizedId) => {
            const el = svg.querySelector(`[id="${originalId}"]`);
            expect(el).not.toBeNull();
            expect(el.getAttribute('data-normalized-id')).toBe(expectedNormalizedId);
        };

        // Test cases from the file
        checkId('Face-Shape', 'face-shape');
        checkId('Mouth_copy_3', 'mouth');
        checkId('Eye_1_', 'eye');
        checkId('Eye-Clppng_8_', 'eye-clppng');
        checkId('Whiskers-L_copy_3', 'whiskers-l');
        checkId('Nose_3_', 'nose');
        checkId('Pupil_7_', 'pupil');
    });

    it('should cleanId correctly (unit test)', () => {
        // We can access prototype or instantiate dummy with an element
        const s = new SVGiggle(document.createElement('svg')); 
        // We can access cleanId method?
        // It's on the class prototype/instance.
        
        expect(s.cleanId('Test')).toBe('test');
        expect(s.cleanId('Test_1_')).toBe('test');
        expect(s.cleanId('Layer_copy')).toBe('layer');
        expect(s.cleanId('Layer_copy_2')).toBe('layer');
        expect(s.cleanId('Object_x002D_Name')).toBe('object-name');
        expect(s.cleanId('Complex_Name_1__copy_5')).toBe('complex_name'); // _1_ is not at end after copy removed?
        // Logic: remove copy suffix FIRST.
        // `clean = clean.replace(/_copy(_\d+)?$/i, '');` -> removes `_copy_5`.
        // Result: `Complex_Name_1_`.
        // Then `clean = clean.replace(/_\d+_$/, '');` -> removes `_1_`.
        // Result: `Complex_Name`.
        // Lowercase: `complex_name`.
        
        expect(s.cleanId('Complex_Name_1__copy_5')).toBe('complex_name');
    });
});
