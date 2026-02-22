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
        this._computedSvg = null;
        this.unsupportedElements = [];
        
        this.baseState = {}; // Map<id, pathCommands[]>
        this.shapeKeys = {}; // Map<shapeKeyName, Map<id, deltaCommands[]>>
        this.currentBlends = {}; // Map<shapeKeyName, weight>
        this.listeners = { change: [] };
        
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
            this.extractBlendShapes();
            return this;
        }

        let content;
        const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

        if (isNode) {
            try {
                const fs = await import('node:fs');
                content = fs.readFileSync(this.filePath, 'utf-8');
            } catch (e) {
                console.error('Failed to load file in Node environment:', e);
                throw e;
            }
        } else {
            try {
                const res = await fetch(this.filePath);
                if (!res.ok && res.status !== 0) throw new Error(`Failed to fetch ${this.filePath} (Status: ${res.status})`);
                content = await res.text();
                if (!content) throw new Error('Fetched content is empty');
            } catch (e) {
                console.warn('Fetch failed, attempting <object> tag fallback...', e);
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
                                if (!doc) { reject(new Error('No contentDocument accessible')); return; }
                                const svg = doc.documentElement;
                                if (!svg || svg.tagName.toLowerCase() !== 'svg') { reject(new Error('Not an SVG')); return; }
                                resolve(svg.outerHTML);
                            } catch (err) { reject(err); } finally { if (obj.parentNode) document.body.removeChild(obj); }
                        };
                        obj.onerror = () => { if (obj.parentNode) document.body.removeChild(obj); reject(new Error('Failed via <object>')); };
                        document.body.appendChild(obj);
                    });
                } catch (fallbackError) {
                    throw new Error(`Could not load SVG. Error: ${fallbackError.message}`);
                }
            }
        }

        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'image/svg+xml');
        const parserError = doc.querySelector('parsererror');
        if (parserError) throw new Error('XML Parsing Error: ' + parserError.textContent);

        this._svg = doc.documentElement;
        this.normalize(this._svg);
        this.extractBlendShapes();
        return this;
    }

    // Returns the computed SVG
    get svg() {
        if (!this._computedSvg) {
            this.compute();
        }
        return this._computedSvg;
    }

    normalize(svg) {
        const Matrix = (typeof DOMMatrix !== 'undefined') ? DOMMatrix : (typeof WebKitCSSMatrix !== 'undefined' ? WebKitCSSMatrix : null);
        if (!Matrix) throw new Error('DOMMatrix is not supported in this environment.');

        const allowedTags = ['g', 'svg', 'defs', 'symbol', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'clippath', 'use'];

        const traverse = (element, parentMatrix) => {
            const tagName = element.tagName.toLowerCase();
            if (!allowedTags.includes(tagName)) {
                this.unsupportedElements.push(tagName);
                if (element.parentNode) element.parentNode.removeChild(element);
                return;
            }

            const id = element.getAttribute('id');
            if (id) {
                const clean = this.cleanId(id);
                element.setAttribute('data-normalized-id', clean);
            }

            let currentMatrix = parentMatrix;
            const transformAttr = element.getAttribute('transform');
            if (transformAttr) {
                const commands = transformAttr.matchAll(/(\w+)\s*\(([^)]*)\)/g);
                for (const match of commands) {
                    const type = match[1];
                    const args = match[2].trim().split(/[\s,]+/).map(parseFloat);
                    try {
                        switch (type) {
                            case 'translate': currentMatrix = currentMatrix.translate(args[0], args[1] || 0); break;
                            case 'scale': currentMatrix = currentMatrix.scale(args[0], args[1] === undefined ? args[0] : args[1]); break;
                            case 'rotate': args.length === 1 ? currentMatrix = currentMatrix.rotate(args[0]) : currentMatrix = currentMatrix.translate(args[1], args[2]).rotate(args[0]).translate(-args[1], -args[2]); break;
                            case 'skewX': currentMatrix = currentMatrix.skewX(args[0]); break;
                            case 'skewY': currentMatrix = currentMatrix.skewY(args[0]); break;
                            case 'matrix': if (args.length === 6) { const m = new Matrix(); m.a=args[0]; m.b=args[1]; m.c=args[2]; m.d=args[3]; m.e=args[4]; m.f=args[5]; currentMatrix = currentMatrix.multiply(m); } break;
                        }
                    } catch (e) { console.warn(`Failed transform "${match[0]}"`, e); }
                }
                element.removeAttribute('transform');
            }

            if (tagName === 'g' || tagName === 'svg' || tagName === 'defs' || tagName === 'symbol' || tagName === 'clippath' || tagName === 'use') {
                if ((tagName === 'svg' || tagName === 'use') && element !== this._svg) {
                    const x = parseFloat(element.getAttribute('x') || 0);
                    const y = parseFloat(element.getAttribute('y') || 0);
                    if (x !== 0 || y !== 0) {
                         currentMatrix = currentMatrix.translate(x, y);
                         element.removeAttribute('x');
                         element.removeAttribute('y');
                    }
                }
                Array.from(element.children).forEach(child => traverse(child, currentMatrix));
            } else if (tagName === 'path') {
                const d = element.getAttribute('d');
                if (d) {
                    const m = currentMatrix;
                    let newD = svgpath(d).abs().matrix([m.a, m.b, m.c, m.d, m.e, m.f]).toString();
                    newD = this.toCubic(newD);
                    element.setAttribute('d', newD);
                }
            } else if (['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'].includes(tagName)) {
                const pathData = this.shapeToPath(element);
                if (pathData) {
                    const m = currentMatrix;
                    let newD = svgpath(pathData).abs().matrix([m.a, m.b, m.c, m.d, m.e, m.f]).toString();
                    newD = this.toCubic(newD);
                    const newPath = this._svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'path');
                    newPath.setAttribute('d', newD);
                    for (const attr of element.attributes) {
                        if (!['x', 'y', 'width', 'height', 'cx', 'cy', 'r', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'd', 'transform'].includes(attr.name)) {
                            newPath.setAttribute(attr.name, attr.value);
                        }
                    }
                    element.parentNode.replaceChild(newPath, element);
                }
            }
        };

        traverse(svg, new Matrix());
        if (this.unsupportedElements.length > 0) console.warn('Dropped unsupported:', [...new Set(this.unsupportedElements)]);
    }

    extractBlendShapes() {
        // Find base group
        const base = this._svg.querySelector('[data-normalized-id="base"]');
        if (!base) throw new Error('Base layer not found (id="base").');

        // Parse Base State
        const basePaths = base.querySelectorAll('path');
        basePaths.forEach(p => {
            const id = p.getAttribute('data-normalized-id');
            if (id) {
                this.baseState[id] = this.parsePathData(p.getAttribute('d'));
            }
        });

        // Find Shape Keys (sibling groups of base)
        // We look at direct children of SVG that are groups and not base
        const shapeGroups = Array.from(this._svg.children).filter(el => 
            el.tagName.toLowerCase() === 'g' && 
            el.getAttribute('data-normalized-id') !== 'base'
        );

        if (shapeGroups.length === 0) console.warn('No blend shape layers found.');

        shapeGroups.forEach(group => {
            const keyName = group.getAttribute('data-normalized-id');
            if (!keyName) return;

            this.shapeKeys[keyName] = {};
            
            const paths = group.querySelectorAll('path');
            paths.forEach(p => {
                const id = p.getAttribute('data-normalized-id');
                if (id && this.baseState[id]) {
                    const shapePath = this.parsePathData(p.getAttribute('d'));
                    const basePath = this.baseState[id];
                    
                    // Compute Delta
                    // Check compatibility
                    if (shapePath.length !== basePath.length) {
                        console.warn(`Path length mismatch for ${id} in ${keyName}. Skipping.`);
                        return;
                    }

                    const deltaPath = shapePath.map((cmd, i) => {
                        const baseCmd = basePath[i];
                        if (cmd[0] !== baseCmd[0]) {
                            console.warn(`Command mismatch at ${i} for ${id}.`);
                            return baseCmd.map((v, k) => k===0?v:0); // Zero delta fallback
                        }
                        // [Cmd, arg1, arg2...]
                        // Delta = Shape - Base
                        const delta = [cmd[0]];
                        for (let k=1; k<cmd.length; k++) {
                            delta.push(cmd[k] - baseCmd[k]);
                        }
                        return delta;
                    });
                    
                    this.shapeKeys[keyName][id] = deltaPath;
                }
            });

            // Remove shape key group from DOM
            group.parentNode.removeChild(group);
        });
        
        // Initialize computedSVG as a clone of what remains (contains base)
        this._computedSvg = this._svg.cloneNode(true);
    }

    blend(nameOrObj, val) {
        if (typeof nameOrObj === 'object') {
            for (const [name, value] of Object.entries(nameOrObj)) {
                this.currentBlends[name] = value;
            }
        } else {
            this.currentBlends[nameOrObj] = val;
        }
        
        this.compute();
        
        // Emit change
        this.listeners['change'].forEach(cb => cb(this._computedSvg));
    }

    compute() {
        // Start with base state
        // Iterate over base paths in _computedSvg
        // Apply deltas
        
        const paths = this._computedSvg.querySelectorAll('path');
        paths.forEach(p => {
            const id = p.getAttribute('data-normalized-id');
            if (!id || !this.baseState[id]) return;

            const baseCommands = this.baseState[id];
            
            // Reconstruct path
            let finalD = '';
            
            baseCommands.forEach((cmd, cmdIdx) => {
                const type = cmd[0];
                const args = [...cmd.slice(1)]; // copy base args
                
                // Apply deltas
                for (const [key, weight] of Object.entries(this.currentBlends)) {
                    if (weight === 0) continue;
                    const deltaMap = this.shapeKeys[key];
                    if (deltaMap && deltaMap[id]) {
                        const deltaCmd = deltaMap[id][cmdIdx];
                        if (deltaCmd) {
                            for (let k=0; k<args.length; k++) {
                                args[k] += deltaCmd[k+1] * weight;
                            }
                        }
                    }
                }
                
                finalD += `${type} ${args.join(' ')} `;
            });
            
            p.setAttribute('d', finalD.trim());
        });
    }

    on(event, callback) {
        if (this.listeners[event]) this.listeners[event].push(callback);
    }

    off(event, callback) {
        if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    parsePathData(d) {
        const commands = [];
        svgpath(d).iterate((segment, index, x, y) => {
            commands.push(segment.slice()); 
        });
        return commands;
    }

    toCubic(d) {
        let newPath = '';
        let startX = 0, startY = 0;
        let x = 0, y = 0;

        svgpath(d)
            .abs()
            .unshort()
            .unarc()
            .iterate((segment, index, curX, curY) => {
                const cmd = segment[0];
                const args = segment.slice(1);
                x = curX; y = curY; 
                
                if (cmd === 'M') {
                    startX = args[0]; startY = args[1];
                    newPath += `M ${args[0]} ${args[1]} `;
                    return;
                }
                if (cmd === 'L') {
                    const x1 = args[0], y1 = args[1];
                    newPath += `C ${x} ${y} ${x1} ${y1} ${x1} ${y1} `;
                    return;
                }
                if (cmd === 'H') {
                    const x1 = args[0];
                    newPath += `C ${x} ${y} ${x1} ${y} ${x1} ${y} `;
                    return;
                }
                if (cmd === 'V') {
                    const y1 = args[0];
                    newPath += `C ${x} ${y} ${x} ${y1} ${x} ${y1} `;
                    return;
                }
                if (cmd === 'C') {
                    newPath += `C ${args.join(' ')} `;
                    return;
                }
                if (cmd === 'Q') {
                    const qx = args[0], qy = args[1], endX = args[2], endY = args[3];
                    const cp1x = x + (2/3) * (qx - x), cp1y = y + (2/3) * (qy - y);
                    const cp2x = endX + (2/3) * (qx - endX), cp2y = endY + (2/3) * (qy - endY);
                    newPath += `C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${endX} ${endY} `;
                    return;
                }
                if (cmd === 'Z') {
                    newPath += `C ${x} ${y} ${startX} ${startY} ${startX} ${startY} Z `;
                    return;
                }
            });
        
        return newPath.trim();
    }

    shapeToPath(element) {
        const tag = element.tagName.toLowerCase();
        const get = (attr, def = 0) => parseFloat(element.getAttribute(attr) || def);
        
        if (tag === 'rect') {
            const x = get('x'), y = get('y'), w = get('width'), h = get('height');
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

    cleanId(id) {
        if (!id) return null;
        let clean = id;
        clean = clean.replace(/_x([0-9A-Fa-f]{4})_/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
        clean = clean.replace(/_copy(_\d+)?$/i, '');
        clean = clean.replace(/_\d+_$/, '');
        clean = clean.toLowerCase();
        return clean;
    }

    tree(clean = false, showOriginal = false, maxDepth = Infinity) {
        if (!this._svg) return '';
        
        const buildTree = (el, depth = 0) => {
            const indent = '  '.repeat(depth);
            const tagName = el.tagName;
            const id = el.getAttribute('id');
            const cleanId = el.getAttribute('data-normalized-id');
            
            let name = '';
            if (clean && cleanId) {
                name = cleanId;
                if (showOriginal && id) { 
                     if (id !== cleanId) name += ` (${id})`;
                }
            } else if (id) {
                name = id;
            }

            let line = `${indent}- ${tagName}`;
            if (name) line += ` ${name}`;
            
            let output = line + '\n';
            
            if (depth < maxDepth) {
                for (const child of el.children) {
                    output += buildTree(child, depth + 1);
                }
            }
            return output;
        };
        
        return buildTree(this._svg);
    }
}
