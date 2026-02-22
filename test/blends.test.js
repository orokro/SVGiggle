import { describe, it, expect } from 'vitest';
import { SVGiggle } from '../src/SVGiggle.js';
import DOMMatrix from 'dommatrix';

if (typeof global.DOMMatrix === 'undefined') global.DOMMatrix = DOMMatrix;

const waitForLoad = async (s) => { if (s.ready) await s.ready; };

describe('SVGiggle Blends', () => {
    it('should blend rectangle coordinates', async () => {
        const s = new SVGiggle('svgs/rect_blends.svg');
        await waitForLoad(s);
        
        // 1. Initial State (Base)
        // Rect at 10,10
        let svg = s.svg;
        let path = svg.querySelector('path').getAttribute('d');
        // Check start point M 10 10
        expect(path).toMatch(/M 10 10/);

        // 2. Blend Move-Up 100%
        s.blend('move-up', 1.0);
        svg = s.svg;
        path = svg.querySelector('path').getAttribute('d');
        // Expect M 10 0
        expect(path).toMatch(/M 10 0/);

        // 3. Blend Move-Right 100% (resetting move-up implicitly? No, blend updates specific key)
        // blend(name, val) updates ONE key.
        // So move-up is still 1.0.
        s.blend('move-right', 1.0);
        svg = s.svg;
        path = svg.querySelector('path').getAttribute('d');
        // Expect M 20 0 (Up + Right)
        expect(path).toMatch(/M 20 0/);

        // 4. Reset Move-Up to 0
        s.blend('move-up', 0.0);
        svg = s.svg;
        path = svg.querySelector('path').getAttribute('d');
        // Expect M 20 10 (Just Right)
        expect(path).toMatch(/M 20 10/);

        // 5. 50% Blend both
        s.blend({
            'move-up': 0.5,
            'move-right': 0.5
        });
        svg = s.svg;
        path = svg.querySelector('path').getAttribute('d');
        // Base 10,10. Up -10. Right +10.
        // 10 + (0.5 * 10) = 15.
        // 10 + (0.5 * -10) = 5.
        // Expect M 15 5
        expect(path).toMatch(/M 15 5/);
    });
});
