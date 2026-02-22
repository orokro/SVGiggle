import svgpath from 'svgpath';

export class SVGiggle {
    constructor(input) {
        this.filePath = null;
        this.inputElement = null;

        if (typeof input === 'string') {
            this.filePath = input;
        } else if (typeof input === 'object' && input !== null && (input.nodeType === 1 || typeof input.tagName === 'string')) {
            this.inputElement = input;
        } else {
             throw new Error('Invalid input: Must be a file path string or a DOM Element.');
        }
        
        this._svg = null;
        this.ready = this.init();
    }

    async init() {
        // Handle direct DOM element input
        if (this.inputElement) {
            const tag = this.inputElement.tagName.toLowerCase();
            if (tag === 'svg') {
                this._svg = this.inputElement.cloneNode(true);
            } else if (tag === 'object' || tag === 'iframe') {
                try {
                    const doc = this.inputElement.contentDocument;
                    if (!doc) throw new Error('No contentDocument accessible');
                    this._svg = doc.documentElement.cloneNode(true);
                } catch (e) {
                     throw new Error(`Failed to extract SVG from <${tag}>: ` + e.message);
                }
            } else {
                 throw new Error('Unsupported element type. Expected <svg>, <object>, or <iframe>.');
            }
            
            this.normalize(this._svg);
            return this;
        }

        let content;
        // Check environment - prioritize Node check even if window exists (e.g. jsdom)
        const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

        if (isNode) {
            // Node.js environment
            try {
                const fs = await import('node:fs');
                // Resolve path relative to CWD if simpler
                content = fs.readFileSync(this.filePath, 'utf-8');
            } catch (e) {
                console.error('Failed to load file in Node environment:', e);
                throw e;
            }
        } else {
            // Browser environment
            try {
                const res = await fetch(this.filePath);
                // status 0 can occur with file:// protocol in some environments where it's allowed but doesn't return 200
                if (!res.ok && res.status !== 0) throw new Error(`Failed to fetch ${this.filePath} (Status: ${res.status})`);
                content = await res.text();
                // Verify content is not empty
                if (!content) throw new Error('Fetched content is empty');
            } catch (e) {
                // Fallback to <object> tag hack for file:// protocol or CORS issues
                console.warn('Fetch failed, attempting <object> tag fallback for local file access...', e);
                try {
                    content = await new Promise((resolve, reject) => {
                        const obj = document.createElement('object');
                        obj.data = this.filePath;
                        obj.type = 'image/svg+xml';
                        obj.style.position = 'absolute';
                        obj.style.left = '-9999px';
                        obj.onload = () => {
                            try {
                                const doc = obj.contentDocument;
                                if (!doc) {
                                    reject(new Error('No contentDocument accessible (CORS blocking local file?)'));
                                    return;
                                }
                                const svg = doc.documentElement;
                                if (!svg || svg.tagName.toLowerCase() !== 'svg') {
                                    reject(new Error('Loaded content is not an SVG'));
                                    return;
                                }
                                resolve(svg.outerHTML);
                            } catch (err) {
                                reject(err);
                            } finally {
                                if (obj.parentNode) document.body.removeChild(obj);
                            }
                        };
                        obj.onerror = () => {
                            if (obj.parentNode) document.body.removeChild(obj);
                            reject(new Error(`Failed to load ${this.filePath} via <object>`));
                        };
                        document.body.appendChild(obj);
                    });
                } catch (fallbackError) {
                    console.error('All loading methods failed.');
                    throw new Error(`Could not load SVG via fetch or object tag. If using file://, browsers block this. Error: ${fallbackError.message}`);
                }
            }
        }

        // Parse SVG
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'image/svg+xml');
        // Check for parsing errors
        const parserError = doc.querySelector('parsererror');
        if (parserError) {
            throw new Error('XML Parsing Error: ' + parserError.textContent);
        }

        this._svg = doc.documentElement;
        this.normalize(this._svg);
        return this;
    }

    get svg() {
        return this._svg;
    }

    normalize(svg) {
        // We need to traverse the DOM and flatten transforms
        // We'll use a recursive function that passes down the accumulated matrix
        
        // Ensure DOMMatrix is available
        const Matrix = (typeof DOMMatrix !== 'undefined') ? DOMMatrix : (typeof WebKitCSSMatrix !== 'undefined' ? WebKitCSSMatrix : null);
        if (!Matrix) {
            throw new Error('DOMMatrix is not supported in this environment.');
        }

        const traverse = (element, parentMatrix) => {
            let currentMatrix = parentMatrix;

            // 1. Get element transform
            const transformAttr = element.getAttribute('transform');
            if (transformAttr) {
                // Parse transform attribute into matrix
                // Note: DOMMatrix constructor with string might fail in some envs if not fully supported.
                // We'll try/catch or assume it works for standard transforms.
                // Parse transform attribute into matrix manually to support environments without CSS parsing
                const commands = transformAttr.matchAll(/(\w+)\s*\(([^)]*)\)/g);
                for (const match of commands) {
                    const type = match[1];
                    const args = match[2].trim().split(/[\s,]+/).map(parseFloat);
                    
                    try {
                        switch (type) {
                            case 'translate':
                                currentMatrix = currentMatrix.translate(args[0], args[1] || 0);
                                break;
                            case 'scale':
                                currentMatrix = currentMatrix.scale(args[0], args[1] === undefined ? args[0] : args[1]);
                                break;
                            case 'rotate':
                                if (args.length === 1) {
                                    currentMatrix = currentMatrix.rotate(args[0]);
                                } else if (args.length === 3) {
                                    // rotate(a, cx, cy) -> translate(cx, cy) rotate(a) translate(-cx, -cy)
                                    currentMatrix = currentMatrix.translate(args[1], args[2])
                                                                 .rotate(args[0])
                                                                 .translate(-args[1], -args[2]);
                                }
                                break;
                            case 'skewX':
                                currentMatrix = currentMatrix.skewX(args[0]);
                                break;
                            case 'skewY':
                                currentMatrix = currentMatrix.skewY(args[0]);
                                break;
                            case 'matrix':
                                if (args.length === 6) {
                                    const m = new Matrix();
                                    m.a = args[0]; m.b = args[1];
                                    m.c = args[2]; m.d = args[3];
                                    m.e = args[4]; m.f = args[5];
                                    currentMatrix = currentMatrix.multiply(m);
                                }
                                break;
                            default:
                                console.warn(`Unsupported transform function: ${type}`);
                        }
                    } catch (e) {
                         console.warn(`Failed to apply transform "${match[0]}"`, e);
                    }
                }
                
                // Remove the transform attribute since we're baking it in
                element.removeAttribute('transform');
            }

            // 2. Handle element types
            const tagName = element.tagName.toLowerCase();

            if (tagName === 'g' || tagName === 'svg' || tagName === 'defs' || tagName === 'symbol') {
                // For containers, just recurse
                // Note: <svg> (nested) might have x, y, viewBox. 
                // Normalizing nested SVGs is complex (viewport changes). 
                // We'll assume simple groups for now or apply x/y if present?
                // Nested <svg> x/y acts like a translation.
                if (tagName === 'svg' && element !== this._svg) {
                    const x = parseFloat(element.getAttribute('x') || 0);
                    const y = parseFloat(element.getAttribute('y') || 0);
                    if (x !== 0 || y !== 0) {
                         currentMatrix = currentMatrix.translate(x, y);
                         element.removeAttribute('x');
                         element.removeAttribute('y');
                    }
                }

                // Copy children to array to avoid live collection issues if we modify DOM structure
                const children = Array.from(element.children);
                for (const child of children) {
                    traverse(child, currentMatrix);
                }
            } else if (tagName === 'path') {
                // Normalize path data
                const d = element.getAttribute('d');
                if (d) {
                    const m = currentMatrix;
                    const matrixArray = [m.a, m.b, m.c, m.d, m.e, m.f];

                    // Convert to absolute and transform using svgpath
                    const newD = svgpath(d)
                        .abs()
                        .matrix(matrixArray)
                        .toString();
                    
                    element.setAttribute('d', newD);
                }
            } else if (['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tagName)) {
                // Convert shape to path then transform
                const pathData = this.shapeToPath(element);
                if (pathData) {
                    const m = currentMatrix;
                    const matrixArray = [m.a, m.b, m.c, m.d, m.e, m.f];
                    
                    const newD = svgpath(pathData)
                        .abs()
                        .matrix(matrixArray)
                        .toString();
                    
                    // Replace element with <path>
                    const newPath = this._svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
                    newPath.setAttribute('d', newD);
                    
                    // Copy attributes (fill, stroke, class, id, etc.)
                    for (const attr of element.attributes) {
                        if (!['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'd', 'transform'].includes(attr.name)) {
                            newPath.setAttribute(attr.name, attr.value);
                        }
                    }
                    
                    element.parentNode.replaceChild(newPath, element);
                }
            }
        };

        // Start traversal with identity matrix
        traverse(svg, new Matrix());
    }

    shapeToPath(element) {
        const tag = element.tagName.toLowerCase();
        const get = (attr, def = 0) => parseFloat(element.getAttribute(attr) || def);
        
        if (tag === 'rect') {
            const x = get('x'), y = get('y'), w = get('width'), h = get('height');
            const rx = get('rx'), ry = get('ry');
            // Simplified rect (no rounding for now, or handle rounding?)
            // If rx/ry present, it's complex. 
            // I'll implement basic rect.
            // Support for rounded rects if needed? Prompt implies "all SVG elements".
            // I'll stick to simple rect for "light-weight" unless requested.
            // SVGPathCommander might have shape conversion utils? No.
            return `M ${x} ${y} h ${w} v ${h} h ${-w} z`;
        }
        if (tag === 'circle') {
            const cx = get('cx'), cy = get('cy'), r = get('r');
            return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
        }
        if (tag === 'ellipse') {
            const cx = get('cx'), cy = get('cy'), rx = get('rx'), ry = get('ry');
            return `M ${cx - rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`;
        }
        if (tag === 'line') {
            const x1 = get('x1'), y1 = get('y1'), x2 = get('x2'), y2 = get('y2');
            return `M ${x1} ${y1} L ${x2} ${y2}`;
        }
        if (tag === 'polyline' || tag === 'polygon') {
            const points = element.getAttribute('points');
            if (!points) return '';
            // "10,10 20,20" -> "M 10 10 L 20 20"
            // Split by comma or space
            const coords = points.trim().split(/[\s,]+/);
            if (coords.length < 2) return '';
            let d = `M ${coords[0]} ${coords[1]}`;
            for (let i = 2; i < coords.length; i += 2) {
                d += ` L ${coords[i]} ${coords[i+1]}`;
            }
            if (tag === 'polygon') d += ' Z';
            return d;
        }
        return null;
    }
}
