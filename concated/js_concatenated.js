// Source: ply-loader.js
export class PLYLoader {
    constructor() {
        // Standard property mappings
        this.propertyTypes = new Map([
            ['char', Int8Array],
            ['uchar', Uint8Array],
            ['short', Int16Array],
            ['ushort', Uint16Array],
            ['int', Int32Array],
            ['uint', Uint32Array],
            ['float', Float32Array],
            ['double', Float64Array],
        ]);

        this.propertySizes = new Map([
            ['char', 1], ['uchar', 1],
            ['short', 2], ['ushort', 2],
            ['int', 4], ['uint', 4],
            ['float', 4], ['double', 8]
        ]);

        // Constants for parsing INRIA formats
        this.SH_C0 = 0.28209479177387814;
        this.sphericalHarmonicsSupported = true;

        // Field mappings for different formats
        this.inriaV1Fields = {
            base: ['scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
                'x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'],
            sh: Array.from({ length: 45 }, (_, i) => `f_rest_${i}`)
        };

        this.inriaV2Fields = {
            codebook: ['features_dc', 'features_rest_0', 'features_rest_1', 'features_rest_2',
                'opacity', 'scaling', 'rotation_re', 'rotation_im'],
            vertex: ['scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3',
                'x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity']
        };
    }

    async loadPLY(fileData) {
        try {
            console.log('Starting PLY load process');
            console.log('File data type:', typeof fileData);
            if (fileData instanceof ArrayBuffer) {
                console.log('File is ArrayBuffer, size:', fileData.byteLength);
            } else {
                console.log('First 100 chars of file:', fileData.substring(0, 100));
            }

            const header = await this.parsePLYHeader(fileData);
            console.log('Parsed PLY header:', header);

            const result = {
                vertices: [],
                normals: [],
                colors: [], // rgba
                faces: [],
                vertexCount: 0,
                scales: [], // xyz
                rotations: [], // quaternion
            };

            if (header.format.includes('ascii')) {
                console.log('Parsing ASCII PLY data');
                await this.parseASCIIData(header, fileData, result);
            } else {
                console.log('Parsing binary PLY data');
                const dataView = fileData instanceof ArrayBuffer ?
                    new DataView(fileData) :
                    new DataView(new TextEncoder().encode(fileData).buffer);
                await this.parseBinaryData(header, dataView, result);
            }

            console.log('Parsed PLY data:', {
                vertexCount: result.vertices.length / 3,
                normalCount: result.normals.length / 3,
                colorCount: result.colors.length / 4,
                faceCount: result.faces.length / 3
            });
            console.log('Result: ', result);

            if (result.vertices.length === 0) {
                throw new Error('No vertices found in PLY file');
            }

            return {
                vertices: new Float32Array(result.vertices),
                normals: result.normals.length > 0 ? new Float32Array(result.normals) : null,
                colors: result.colors.length > 0 ? new Float32Array(result.colors) : null,
                faces: result.faces.length > 0 ? new Uint32Array(result.faces) : null,
                vertexCount: result.vertices.length / 3,
                scales: result.scales.length > 0 ? new Float32Array(result.scales) : null,
                rotations: result.rotations.length > 0 ? new Float32Array(result.rotations) : null
            };
        } catch (error) {
            console.error('Error in PLY loading:', error);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    async parseInriaV1(fileData) {
        const header = await this.parsePLYHeader(fileData);
        const result = {
            vertices: [],
            normals: [],
            colors: [],
            sphericalHarmonics: [],
            vertexCount: 0
        };

        // INRIA V1 specific parsing
        const vertexData = this.getVertexData(fileData, header);

        for (let i = 0; i < header.numVertices; i++) {
            const vertex = this.readInriaV1Vertex(vertexData, i, header);

            // Add position
            result.vertices.push(vertex.x, vertex.y, vertex.z);

            // Add colors
            result.colors.push(
                this.normalizeColor(vertex.f_dc_0),
                this.normalizeColor(vertex.f_dc_1),
                this.normalizeColor(vertex.f_dc_2)
            );

            // Add spherical harmonics if present
            if (vertex.sh) {
                result.sphericalHarmonics.push(...vertex.sh);
            }
        }

        result.vertexCount = header.numVertices;
        return this.convertToStandardFormat(result);
    }

    async parseInriaV2(fileData) {
        const header = await this.parsePLYHeader(fileData);
        const result = {
            vertices: [],
            colors: [],
            sphericalHarmonics: [],
            codebook: this.parseInriaV2Codebook(fileData, header),
            vertexCount: 0
        };

        const vertexData = this.getVertexData(fileData, header);

        for (let i = 0; i < header.numVertices; i++) {
            const vertex = this.readInriaV2Vertex(vertexData, i, header, result.codebook);

            // Add decoded data
            result.vertices.push(vertex.x, vertex.y, vertex.z);
            result.colors.push(...vertex.colors);
            if (vertex.sh) {
                result.sphericalHarmonics.push(...vertex.sh);
            }
        }

        result.vertexCount = header.numVertices;
        return this.convertToStandardFormat(result);
    }

    async parsePlayCanvas(fileData) {
        const header = await this.parsePLYHeader(fileData);
        const result = {
            vertices: [],
            colors: [],
            vertexCount: 0
        };

        // PlayCanvas specific decompression
        const chunks = this.parsePlayCanvasChunks(fileData, header);

        for (let i = 0; i < header.numVertices; i++) {
            const vertex = this.decompressPlayCanvasVertex(chunks, i);
            result.vertices.push(vertex.x, vertex.y, vertex.z);
            result.colors.push(...vertex.colors);
        }

        result.vertexCount = header.numVertices;
        return this.convertToStandardFormat(result);
    }

    // Helper methods for vertex reading and data conversion
    readInriaV1Vertex(data, index, header) {
        // Read vertex data based on header format
        const vertex = {};
        let offset = index * header.vertexSize;

        for (const field of this.inriaV1Fields.base) {
            vertex[field] = this.readProperty(data, offset, header.properties[field]);
            offset += this.propertySizes.get(header.properties[field].type);
        }

        // Process spherical harmonics if present
        if (header.hasSphericalHarmonics) {
            vertex.sh = [];
            for (const field of this.inriaV1Fields.sh) {
                if (header.properties[field]) {
                    vertex.sh.push(this.readProperty(data, offset, header.properties[field]));
                    offset += this.propertySizes.get(header.properties[field].type);
                }
            }
        }

        return vertex;
    }

    normalizeColor(color) {
        return color > 1.0 ? color / 255.0 : color;
    }

    convertToStandardFormat(specializedData) {
        return {
            vertices: new Float32Array(specializedData.vertices),
            normals: specializedData.normals?.length ? new Float32Array(specializedData.normals) : null,
            colors: specializedData.colors?.length ? new Float32Array(specializedData.colors) : null,
            vertexCount: specializedData.vertexCount,
            additionalData: {
                sphericalHarmonics: specializedData.sphericalHarmonics?.length ?
                    new Float32Array(specializedData.sphericalHarmonics) : null
            }
        };
    }

    async parseStandardPLY(fileData) {
        const header = await this.parsePLYHeader(fileData);
        const result = {
            vertices: [],
            normals: [],
            colors: [],
            faces: [],
            vertexCount: 0
        };

        if (header.format.includes('ascii')) {
            await this.parseASCIIData(header, fileData, result);
        } else {
            // For binary data, create a DataView if we don't already have one
            const dataView = fileData instanceof ArrayBuffer ?
                new DataView(fileData) :
                new DataView(new TextEncoder().encode(fileData).buffer);
            await this.parseBinaryData(header, dataView, result);
        }

        return {
            vertices: new Float32Array(result.vertices),
            normals: result.normals.length > 0 ? new Float32Array(result.normals) : null,
            colors: result.colors.length > 0 ? new Float32Array(result.colors) : null,
            faces: result.faces.length > 0 ? new Uint32Array(result.faces) : null,
            vertexCount: result.vertices.length / 3
        };
    }

    async parseASCIIData(header, data, result) {
        const lines = data.split('\n');
        let currentLine = 0;

        // Skip header
        while (currentLine < lines.length && !lines[currentLine].includes('end_header')) {
            currentLine++;
        }
        currentLine++; // Skip 'end_header' line

        // Read vertices
        for (let i = 0; i < header.numVertices; i++) {
            const values = lines[currentLine++].trim().split(/\s+/).map(Number);
            let valueIndex = 0;

            // Process each property
            for (const [propName, prop] of Object.entries(header.properties)) {
                if (propName === 'x') result.vertices.push(values[valueIndex]);
                if (propName === 'y') result.vertices.push(values[valueIndex]);
                if (propName === 'z') result.vertices.push(values[valueIndex]);

                if (propName === 'nx') result.normals.push(values[valueIndex]);
                if (propName === 'ny') result.normals.push(values[valueIndex]);
                if (propName === 'nz') result.normals.push(values[valueIndex]);

                if (propName === 'red') result.colors.push(values[valueIndex] / 255);
                if (propName === 'green') result.colors.push(values[valueIndex] / 255);
                if (propName === 'blue') result.colors.push(values[valueIndex] / 255);

                valueIndex++;
            }
        }

        // Read faces
        for (let i = 0; i < header.numFaces; i++) {
            const values = lines[currentLine++].trim().split(/\s+/).map(Number);
            const vertexCount = values[0];

            // Triangulate faces if necessary
            if (vertexCount === 3) {
                result.faces.push(values[1], values[2], values[3]);
            } else {
                // Fan triangulation for convex polygons
                for (let j = 2; j < vertexCount; j++) {
                    result.faces.push(values[1], values[j], values[j + 1]);
                }
            }
        }
    }

    isValidResult(result) {
        return result &&
            result.vertices &&
            result.vertices.length > 0 &&
            result.vertexCount > 0;
    }

    async detectPLYFormat(fileData) {
        let headerText;
        if (fileData instanceof ArrayBuffer) {
            const decoder = new TextDecoder();
            headerText = decoder.decode(new Uint8Array(fileData, 0, 1024));
        } else if (typeof fileData === 'string') {
            headerText = fileData.substring(0, 1024);
        }

        // Format detection logic
        if (headerText.includes('element codebook_centers')) {
            return 'inriav2';
        } else if (headerText.includes('element chunk') ||
            headerText.match(/[A-Za-z]*packed_[A-Za-z]*/)) {
            return 'playcanvas';
        } else if (headerText.includes('f_dc_') ||
            headerText.includes('f_rest_') ||
            headerText.includes('scale_0')) {
            return 'inriav1';
        }

        return 'standard';
    }

    getVertexData(fileData, header) {
        if (fileData instanceof ArrayBuffer) {
            return new DataView(fileData, header.headerLength);
        } else {
            const encoder = new TextEncoder();
            const buffer = encoder.encode(fileData.slice(header.headerLength)).buffer;
            return new DataView(buffer);
        }
    }

    async parsePLYHeader(fileData) {
        try {
            let headerText;
            const header = {
                format: '',
                version: '',
                numVertices: 0,
                numFaces: 0,
                properties: {},
                vertexSize: 0,
                headerLength: 0,
                isBinary: false
            };

            if (fileData instanceof ArrayBuffer) {
                let offset = 0;
                let headerString = '';
                const dataView = new DataView(fileData);

                while (offset < fileData.byteLength) {
                    const byte = dataView.getUint8(offset++);
                    headerString += String.fromCharCode(byte);
                    if (headerString.includes('end_header\n')) {
                        header.headerLength = offset;
                        headerText = headerString;
                        break;
                    }
                }
            } else {
                const endHeaderIndex = fileData.indexOf('end_header\n');
                headerText = fileData.substring(0, endHeaderIndex + 11);
                header.headerLength = headerText.length;
            }

            const lines = headerText.split('\n');
            let currentElement = null;

            for (const line of lines) {
                const tokens = line.trim().split(/\s+/);
                if (!tokens[0]) continue;

                switch (tokens[0]) {
                    case 'format':
                        header.format = tokens[1];
                        header.version = tokens[2];
                        header.isBinary = tokens[1].includes('binary');
                        break;

                    case 'element':
                        currentElement = tokens[1];
                        if (currentElement === 'vertex') {
                            header.numVertices = parseInt(tokens[2]);
                        } else if (currentElement === 'face') {
                            header.numFaces = parseInt(tokens[2]);
                        }
                        break;

                    case 'property':
                        if (!currentElement) continue;

                        if (tokens[1] === 'list') {
                            header.properties[tokens[4]] = {
                                type: tokens[3],
                                countType: tokens[2],
                                isList: true
                            };
                        } else {
                            const propName = tokens[2];
                            const propType = tokens[1];
                            const propSize = this.propertySizes.get(propType) || 0;

                            header.properties[propName] = { type: propType, offset: header.vertexSize };
                            header.vertexSize += propSize;
                        }
                        break;
                }
            }

            // Single log for header info
            console.log('PLY Header:', {
                format: header.format,
                vertices: header.numVertices,
                faces: header.numFaces,
                properties: Object.keys(header.properties)
            });

            return header;
        } catch (error) {
            console.error('Error parsing PLY header:', error);
            throw error;
        }
    }

    async parseBinaryData(header, dataView, result) {
        try {
            let offset = header.headerLength;
            const littleEndian = header.format.includes('little_endian');
            console.log('Starting binary parse at offset:', offset);
            console.log('Total data length:', dataView.byteLength);

            // Read vertices
            for (let i = 0; i < header.numVertices; i++) {
                const rgba = []; // Color properties (red, green, blue, alpha)
                const SH_C0 = 0.28209479177387814;
                const scale = []; // scale in x, y, z
                const rotation = []; // rotation quaternion
                const normal = []; // normal vector
                // Read vertex properties
                for (const [propName, prop] of Object.entries(header.properties)) {
                    if (prop.isList) continue;  // Skip list properties when reading vertices

                    const propSize = this.propertySizes.get(prop.type);

                    // Ensure the current property can be read within the data bounds
                    if (offset + propSize > dataView.byteLength) {
                        throw new Error(`Buffer overflow at vertex ${i}, property ${propName}`);
                    }

                    const value = this.readProperty(dataView, offset, prop.type, littleEndian);

                    // Store vertex coordinates
                    if (propName === 'x' || propName === 'y' || propName === 'z') {
                        result.vertices.push(value);
                    }

                    // Store color properties (red, green, blue, alpha)
                    if (propName === 'f_dc_0') {
                        rgba[0] = (0.5 + SH_C0 * value) * 255; // Red channel
                    } else if (propName === 'f_dc_1') {
                        rgba[1] = (0.5 + SH_C0 * value) * 255; // Green channel
                    } else if (propName === 'f_dc_2') {
                        rgba[2] = (0.5 + SH_C0 * value) * 255; // Blue channel
                    } else if (propName === 'opacity') {
                        rgba[3] = (1 / (1 + Math.exp(-value))) * 255; // Alpha channel
                    }

                    // Store scale properties
                    if (propName === 'scale_0' || propName === 'scale_1' || propName === 'scale_2') {
                        scale.push(Math.exp(value));
                    }

                    // Store rotation properties
                    if (propName === 'rot_0' || propName === 'rot_1' || propName === 'rot_2' || propName === 'rot_3') {
                        rotation.push(value);
                    }

                    // Store normal properties
                    if (propName === 'nx' || propName === 'ny' || propName === 'nz') {
                        normal.push(value);
                    }
                    offset += propSize;
                }
                result.colors.push(...rgba);
                result.scales.push(...scale);
                result.rotations.push(...rotation);
                result.normals.push(...normal);
            }

            // Read faces
            if (header.numFaces > 0) {
                console.log('Starting face parsing at offset:', offset);

                for (let i = 0; i < header.numFaces; i++) {
                    const faceProp = Object.values(header.properties).find(p => p.isList);
                    if (!faceProp) continue;

                    // Read number of vertices in this face
                    const vertexCount = this.readProperty(dataView, offset, faceProp.countType, littleEndian);
                    offset += this.propertySizes.get(faceProp.countType);

                    if (vertexCount < 3 || offset + vertexCount * this.propertySizes.get(faceProp.type) > dataView.byteLength) {
                        console.warn(`Invalid face at index ${i}, vertex count: ${vertexCount}`);
                        break;
                    }

                    // Read vertex indices
                    const indices = [];
                    for (let j = 0; j < vertexCount; j++) {
                        indices.push(this.readProperty(dataView, offset, faceProp.type, littleEndian));
                        offset += this.propertySizes.get(faceProp.type);
                    }

                    // Triangulate if necessary
                    if (vertexCount === 3) {
                        result.faces.push(...indices);
                    } else if (vertexCount > 3) {
                        // Fan triangulation for polygons
                        for (let j = 1; j < vertexCount - 1; j++) {
                            result.faces.push(indices[0], indices[j], indices[j + 1]);
                        }
                    }
                }
            }

            console.log('Binary parse complete:', {
                vertices: result.vertices.length / 3,
                faces: result.faces.length / 3
            });

        } catch (error) {
            console.error('Error parsing binary data:', error);
            throw error;
        }
    }

    readProperty(dataView, offset, type, littleEndian) {
        try {
            switch (type) {
                case 'float':
                    return dataView.getFloat32(offset, littleEndian);
                case 'double':
                    return dataView.getFloat64(offset, littleEndian);
                case 'int':
                    return dataView.getInt32(offset, littleEndian);
                case 'uint':
                    return dataView.getUint32(offset, littleEndian);
                case 'short':
                    return dataView.getInt16(offset, littleEndian);
                case 'ushort':
                    return dataView.getUint16(offset, littleEndian);
                case 'uchar':
                    return dataView.getUint8(offset);
                case 'char':
                    return dataView.getInt8(offset);
                default:
                    console.warn(`Unsupported property type: ${type}`);
                    return 0;
            }
        } catch (error) {
            console.error(`Error reading property at offset ${offset}:`, error);
            return 0;
        }
    }

    parseInriaV2Codebook(fileData, header) {
        const codebook = {
            scales: [],
            rotations: {
                real: [],
                imaginary: []
            },
            colors: [],
            opacity: []
        };

        const data = this.getVertexData(fileData, header);
        let offset = 0;

        // Read codebook entries
        for (let i = 0; i < header.codebookSize; i++) {
            for (const field of this.inriaV2Fields.codebook) {
                const value = this.readProperty(data, offset, header.properties[field]);

                if (field.startsWith('features_dc')) {
                    codebook.colors.push(this.normalizeColor(value));
                } else if (field === 'scaling') {
                    codebook.scales.push(Math.exp(value));
                } else if (field === 'rotation_re') {
                    codebook.rotations.real.push(value);
                } else if (field === 'rotation_im') {
                    codebook.rotations.imaginary.push(value);
                } else if (field === 'opacity') {
                    codebook.opacity.push((1 / (1 + Math.exp(-value))) * 255);
                }

                offset += this.propertySizes.get(header.properties[field].type);
            }
        }

        return codebook;
    }

    decompressPlayCanvasVertex(chunks, index) {
        const chunkIndex = Math.floor(index / 256);
        const chunk = chunks[chunkIndex];
        const localIndex = index % 256;

        return {
            x: chunk.positions[localIndex * 3],
            y: chunk.positions[localIndex * 3 + 1],
            z: chunk.positions[localIndex * 3 + 2],
            colors: [
                chunk.colors[localIndex * 3],
                chunk.colors[localIndex * 3 + 1],
                chunk.colors[localIndex * 3 + 2]
            ]
        };
    }

    parsePlayCanvasChunks(fileData, header) {
        const chunks = [];
        const data = this.getVertexData(fileData, header);
        let offset = 0;

        for (let i = 0; i < header.numChunks; i++) {
            chunks.push({
                positions: this.readChunkPositions(data, offset, header),
                colors: this.readChunkColors(data, offset + header.positionSize, header)
            });
            offset += header.chunkSize;
        }

        return chunks;
    }
}


// Source: gaussianSplatApp.js
import { createWorker } from "./splat/worker.js";
import { vertexShaderSource, fragmentShaderSource } from "./splat/shaderSource.js";
import { getProjectionMatrix } from "./splat/utils.js";
import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';
import { Camera } from './camera.js';
import { Controls } from './controls.js';
import { Grid } from './grid.js';

export class GaussianSplatApp {
    ROW_LENGTH = 3 * 4 + 3 * 4 + 4 + 4;

    constructor() {
        console.log('GaussianSplatApp constructor');
        this.initializeWebGL();
        this.initComponents();
        this.initShader();
        this.setupWorker();
        this.setupWindowEventListeners();

        const frame = (now) => {
            now *= 0.001;
            const deltaTime = now - this.lastFrame;
            this.lastFrame = now;

            this.controls.update(deltaTime);
            let actualViewMatrix = this.camera.getViewMatrix();
            const viewProj = mat4.create();
            mat4.multiply(viewProj, this.projectionMatrix, actualViewMatrix);
            this.worker.postMessage({ view: viewProj });

            this.grid.draw(this.projectionMatrix, actualViewMatrix);

            if (this.vertexCount > 0) {
                this.draw();
            }
            requestAnimationFrame(frame);
        };

        frame();

        const isPly = (splatData) =>
            splatData[0] == 112 &&
            splatData[1] == 108 &&
            splatData[2] == 121 &&
            splatData[3] == 10;

        const selectFile = (file) => {
            const fr = new FileReader();
            fr.onload = () => {
                const splatData = new Uint8Array(fr.result);
                console.log("Loaded", Math.floor(splatData.length / this.ROW_LENGTH));

                if (isPly(splatData)) {
                    this.worker.postMessage({ ply: splatData.buffer });
                } else {
                    this.worker.postMessage({
                        buffer: splatData.buffer,
                        vertexCount: Math.floor(splatData.length / this.ROW_LENGTH),
                    });
                }
            };
            fr.readAsArrayBuffer(file);
        };

        const preventDefault = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener("dragenter", preventDefault);
        document.addEventListener("dragover", preventDefault);
        document.addEventListener("dragleave", preventDefault);
        document.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectFile(e.dataTransfer.files[0]);
        });
    }

    initializeWebGL() {
        this.canvas = document.getElementById('glCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        this.gl = this.canvas.getContext("webgl2", {
            antialias: false,
        });

        const gl = this.gl;
        gl.disable(gl.DEPTH_TEST); // Disable depth testing

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(
            gl.ONE_MINUS_DST_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_DST_ALPHA,
            gl.ONE,
        );
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    }

    initComponents() {
        this.camera = new Camera();
        this.camera.position = [
            -3.0089893469241797, -0.11086489695181866, -3.7527640949141428,
        ];
        this.camera.front = [0.876134201218856, 0.06925962026449776, 0.47706599800804744];
        this.camera.up = [-0.04747421839895102, 0.9972110940209488, -0.057586739349882114];
        this.camera.right = [-0.4797239414934443, 0.027805376500959853, 0.8769787916452908];

        this.controls = new Controls(this.camera, this.canvas);

        this.grid = new Grid(this.gl);
    }

    initShader() {
        const gl = this.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
            console.error(gl.getShaderInfoLog(vertexShader));

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
            console.error(gl.getShaderInfoLog(fragmentShader));

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            console.error(gl.getProgramInfoLog(program));

        this.u_projection = gl.getUniformLocation(program, "projection");
        this.u_viewport = gl.getUniformLocation(program, "viewport");
        this.u_focal = gl.getUniformLocation(program, "focal");
        this.u_view = gl.getUniformLocation(program, "view");

        // positions
        const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
        this.a_position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(this.a_position);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.vertexAttribPointer(this.a_position, 2, gl.FLOAT, false, 0, 0);

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        var u_textureLocation = gl.getUniformLocation(program, "u_texture");
        gl.uniform1i(u_textureLocation, 0);

        this.indexBuffer = gl.createBuffer();
        this.a_index = gl.getAttribLocation(program, "index");
        gl.enableVertexAttribArray(this.a_index);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
        gl.vertexAttribIPointer(this.a_index, 1, gl.INT, false, 0, 0);
        gl.vertexAttribDivisor(this.a_index, 1);

        this.program = program;
    }

    setupWorker() {
        //console.log(createWorker.toString());
        this.worker = new Worker(
            URL.createObjectURL(
                new Blob(["(", createWorker.toString(), ")(self)"], {
                    type: "application/javascript",
                }),
            ),
        );

        const gl = this.gl;

        this.worker.onmessage = (e) => {
            if (e.data.buffer) {
                this.splatData = new Uint8Array(e.data.buffer);
            } else if (e.data.texdata) {
                const { texdata, texwidth, texheight } = e.data;
                // console.log("Texture data changed", e.data);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_S,
                    gl.CLAMP_TO_EDGE,
                );
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_T,
                    gl.CLAMP_TO_EDGE,
                );
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA32UI,
                    texwidth,
                    texheight,
                    0,
                    gl.RGBA_INTEGER,
                    gl.UNSIGNED_INT,
                    texdata,
                );
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
            } else if (e.data.depthIndex) {
                const { depthIndex, viewProj } = e.data;
                //console.log("Depth index changed", e.data);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
                this.vertexCount = e.data.vertexCount;
            }
        };
    }

    draw() {
        this.gl.useProgram(this.program);

        // Set uniforms
        this.gl.uniformMatrix4fv(this.u_projection, false, this.projectionMatrix);
        this.gl.uniform2fv(this.u_viewport, new Float32Array([innerWidth, innerHeight]));
        this.gl.uniform2fv(this.u_focal, new Float32Array([this.camera.fx, this.camera.fy]));
        this.gl.uniformMatrix4fv(this.u_view, false, this.camera.getViewMatrix());

        // Set vertices
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(this.a_position, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.a_position);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuffer);
        this.gl.vertexAttribIPointer(this.a_index, 1, this.gl.INT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.a_index);

        // Draw
        this.gl.drawArraysInstanced(this.gl.TRIANGLE_FAN, 0, 4, this.vertexCount);

        // Clean up
        this.gl.disableVertexAttribArray(this.a_position);
        this.gl.disableVertexAttribArray(this.a_index);
    }

    setupWindowEventListeners() {
        const gl = this.gl;

        const resize = () => {
            gl.uniform2fv(this.u_focal, new Float32Array([this.camera.fx, this.camera.fy])); // update the focal length in the shader

            this.projectionMatrix = getProjectionMatrix( // update the projection matrix
                this.camera.fx,
                this.camera.fy,
                innerWidth,
                innerHeight,
            );

            gl.uniform2fv(this.u_viewport, new Float32Array([innerWidth, innerHeight])); // update the viewport size in the shader

            gl.canvas.width = Math.round(innerWidth);
            gl.canvas.height = Math.round(innerHeight);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); // update the viewport size in the WebGL context

            gl.uniformMatrix4fv(this.u_projection, false, this.projectionMatrix); // update the projection matrix in the shader
        };

        window.addEventListener("resize", resize);
        resize();
    }
}


// Source: renderer.js
class Renderer {
    constructor() {
        this.initializeWebGL();
        if (!this.gl) return;

        this.initializeComponents();
        this.setupEventListeners();
        this.startRenderLoop();
        this.showOctree = true;
    }

    initializeWebGL() {
        this.canvas = document.querySelector('#glCanvas');
        this.gl = this.canvas.getContext("webgl2", {
            antialias: false,
        });

        if (!this.gl) {
            alert('Unable to initialize WebGL. Your browser may not support it.');
            return;
        }

        this.setupWebGLContext();
        this.resizeCanvas();
    }

    setupWebGLContext() {
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    initializeComponents() {
        this.camera = new Camera(this.gl);
        this.controls = new Controls(this.camera, this.canvas);
        this.pointCloudRenderer = new PointCloudRenderer(this.gl);
        this.grid = new Grid(this.gl);

        this.lastFrame = 0;
        this.isLoading = false;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const { innerWidth, innerHeight } = window;
        this.canvas.width = innerWidth;
        this.canvas.height = innerHeight;
        this.gl.viewport(0, 0, innerWidth, innerHeight);
    }

    async loadPointCloud(filePath) {
        if (this.isLoading) return;

        this.isLoading = true;
        try {
            await this.pointCloudRenderer.loadPLY(filePath);
            this.centerCameraOnPointCloud();
        } catch (error) {
            console.error('Error loading point cloud:', error);
        } finally {
            this.isLoading = false;
        }
    }

    centerCameraOnPointCloud() {
        const { bounds } = this.pointCloudRenderer;
        const center = this.calculateCenter(bounds);
        const size = this.calculateBoundsSize(bounds);

        this.positionCamera(center, size);
    }

    calculateCenter(bounds) {
        return {
            x: (bounds.max.x + bounds.min.x) / 2,
            y: (bounds.max.y + bounds.min.y) / 2,
            z: (bounds.max.z + bounds.min.z) / 2
        };
    }

    calculateBoundsSize(bounds) {
        return Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y,
            bounds.max.z - bounds.min.z
        );
    }

    positionCamera(center, size) {
        this.camera.position = [
            center.x,
            center.y + size * 0.5,
            center.z + size * 1.5
        ];
        this.camera.lookAt([center.x, center.y, center.z]);
    }

    setupMatrices() {
        const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, 45 * Math.PI / 180, aspect, 0.1, 1000.0);

        const viewMatrix = this.camera.getViewMatrix();
        const modelMatrix = mat4.create();
        const modelViewMatrix = mat4.create();
        mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

        return { projectionMatrix, modelViewMatrix };
    }

    render(now) {
        now *= 0.001;
        const deltaTime = now - this.lastFrame;
        this.lastFrame = now;

        this.controls.update(deltaTime);
        this.clearCanvas();

        const matrices = this.setupMatrices();
        this.renderScene(matrices);

        requestAnimationFrame((now) => this.render(now));
    }

    clearCanvas() {
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    renderScene(matrices) {
        this.grid.draw(matrices.projectionMatrix, matrices.modelViewMatrix);
        this.pointCloudRenderer.draw(matrices.projectionMatrix, matrices.modelViewMatrix);
    }

    startRenderLoop() {
        this.render(0);
        //this.loadPointCloud('models/monkey.obj');
    }
}


// Source: test.js
// model-loader.js - Extend the existing PLYLoader class

class PLYLoader {
    constructor() {
        // Keep existing property types and sizes
        this.propertyTypes = new Map([
            ['char', Int8Array],
            ['uchar', Uint8Array],
            ['short', Int16Array],
            ['ushort', Uint16Array],
            ['int', Int32Array],
            ['uint', Uint32Array],
            ['float', Float32Array],
            ['double', Float64Array],
        ]);

        this.propertySizes = new Map([
            ['char', 1], ['uchar', 1],
            ['short', 2], ['ushort', 2],
            ['int', 4], ['uint', 4],
            ['float', 4], ['double', 8]
        ]);

        // Add new format handlers
        this.formatHandlers = {
            standard: this.parseStandardPLY.bind(this),
            inriav1: this.parseINRIAV1.bind(this),
            inriav2: this.parseINRIAV2.bind(this),
            playcanvas: this.parsePlayCanvas.bind(this)
        };
    }

    async loadPLY(fileData) {
        try {
            // First try existing parser
            const standardResult = await this.parseStandardPLY(fileData);
            if (this.isValidResult(standardResult)) {
                return standardResult;
            }
        } catch (error) {
            console.log('Standard parser failed, trying specialized formats...');
        }

        // If standard parser fails, detect format and try specialized parsers
        const format = await this.detectPLYFormat(fileData);
        const parser = this.getParserForFormat(format);
        const result = await parser.parseToUncompressedSplatArray(fileData);
        
        // Convert specialized format to standard format
        return this.convertToStandardFormat(result);
    }

    async detectPLYFormat(fileData) {
        let headerText;
        if (fileData instanceof ArrayBuffer) {
            const decoder = new TextDecoder();
            headerText = decoder.decode(new Uint8Array(fileData, 0, 1024));
        } else if (typeof fileData === 'string') {
            headerText = fileData.substring(0, 1024);
        }

        // Format detection logic
        if (headerText.includes('element codebook_centers')) {
            return 'inriav2';
        } else if (headerText.includes('element chunk') || 
                   headerText.match(/[A-Za-z]*packed_[A-Za-z]*/)) {
            return 'playcanvas';
        } else if (headerText.includes('f_dc_') || headerText.includes('f_rest_')) {
            return 'inriav1';
        }
        
        return 'standard';
    }

    getParserForFormat(format) {
        switch (format) {
            case 'inriav1':
                return new INRIAV1PlyParser();
            case 'inriav2':
                return new INRIAV2PlyParser();
            case 'playcanvas':
                return new PlayCanvasCompressedPlyParser();
            default:
                return this;
        }
    }

    // Keep existing parsing methods
    parseStandardPLY(fileData) {
        // Existing parsing logic remains unchanged
        return this.parsePLYHeader(fileData)
            .then(header => {
                // Existing header parsing code...
            });
    }

    convertToStandardFormat(specializedResult) {
        const result = {
            vertices: [],
            normals: [],
            colors: [],
            faces: [],
            vertexCount: 0
        };

        // Convert vertices
        const positions = specializedResult.getPositions();
        result.vertices = new Float32Array(positions);
        result.vertexCount = positions.length / 3;

        // Convert colors if available
        const colors = specializedResult.getColors();
        if (colors && colors.length > 0) {
            result.colors = new Float32Array(colors);
        }

        // Convert normals if available
        const normals = specializedResult.getNormals();
        if (normals && normals.length > 0) {
            result.normals = new Float32Array(normals);
        }

        // Store specialized data for advanced features
        result.additionalData = {
            scales: specializedResult.getScales(),
            rotations: specializedResult.getRotations(),
            sphericalHarmonics: specializedResult.getSphericalHarmonics()
        };

        return result;
    }

    // Validation helper
    isValidResult(result) {
        return result && 
               result.vertices && 
               result.vertices.length > 0 && 
               result.vertexCount > 0;
    }
}

// Add these extension methods to your existing ModelLoader class
class ModelLoader {
    constructor() {
        // Existing initialization
        this.supportedFormats = ['ply', 'obj', 'fbx'];
        this.plyLoader = new PLYLoader();
    }

    // Existing methods remain unchanged
    async loadFile(fileData, fileType) {
        // Existing loadFile implementation remains the same
    }

    // Add method to handle specialized PLY data
    getSpecializedPLYData(result) {
        if (result && result.additionalData) {
            return {
                hasSphericalHarmonics: !!result.additionalData.sphericalHarmonics,
                hasScales: !!result.additionalData.scales,
                hasRotations: !!result.additionalData.rotations
            };
        }
        return {
            hasSphericalHarmonics: false,
            hasScales: false,
            hasRotations: false
        };
    }
}

// Source: XRControls.js
// XRControls.js
export class XRControls {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.xrSession = null;
        this.referenceSpace = null;
        this.controllers = [];
        this.device = null; // 'quest' or 'visionpro'
        this.handTracking = {
            enabled: false,
            joints: new Map(),
            gestures: new Map()
        };
        
        this.setupXRButton();
        // Only setup XR if supported
        if ('xr' in navigator) {
            this.setupXREvents();
        }
    }

    setupXRButton() {
        let xrButton = document.getElementById('xr-button');
        if (!xrButton) {
            xrButton = document.createElement('button');
            xrButton.id = 'xr-button';
            xrButton.className = 'xr-button';
            xrButton.textContent = 'Enter VR';
            xrButton.style.display = 'none';
            document.body.appendChild(xrButton);
        }
        this.xrButton = xrButton;

        if ('xr' in navigator) {
            navigator.xr.isSessionSupported('immersive-vr')
                .then((supported) => {
                    if (supported) { 
                        this.xrButton.style.display = 'block';
                        this.xrButton.addEventListener('click', () => this.startXRSession());
                    }
                });
        }
    }

    setupXREvents() {
        if ('xr' in navigator) {
            window.addEventListener('vrdisplayconnect', () => {
                console.log('VR display connected');
            });

            window.addEventListener('vrdisplaydisconnect', () => {
                console.log('VR display disconnected');
            });
        }
    }

    async startXRSession() {
        if (!this.xrSession) {
            try {
                // Request session with enhanced features for Vision Pro
                const sessionInit = {
                    requiredFeatures: ['local-floor'],
                    optionalFeatures: [
                        'hand-tracking',
                        'eye-tracking',
                        'spatial-anchors',
                        'plane-detection',
                        'mesh-detection'
                    ]
                };

                const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
                this.xrSession = session;
                this.xrButton.textContent = 'Exit VR';

                // Setup session
                await this.setupXRSession(session);

                // Detect device type
                this.detectDevice(session);

                // Setup device-specific controls
                if (this.device === 'quest') {
                    this.setupQuestControls(session);
                } else if (this.device === 'visionpro') {
                    await this.setupVisionProControls(session);
                }

                session.addEventListener('end', () => {
                    this.xrSession = null;
                    this.xrButton.textContent = 'Enter VR';
                    this.cleanupVisionProTracking();
                });

            } catch (error) {
                console.error('Error starting XR session:', error);
            }
        } else {
            try {
                await this.xrSession.end();
            } catch (error) {
                console.error('Error ending XR session:', error);
            }
        }
    }

    detectDevice(session) {
        // Enhanced device detection for Vision Pro
        if (session.inputSources?.[0]?.profiles?.includes('oculus-touch')) {
            this.device = 'quest';
        } else if (
            'ongesturechange' in window || 
            navigator.userAgent.includes('AppleWebKit') && 
            session.environmentBlendMode === 'mixed'
        ) {
            this.device = 'visionpro';
        }
        console.log('Detected XR device:', this.device);
    }

    async setupXRSession(session) {
        try {
            const gl = this.renderer.gl;
            const xrGLLayer = new XRWebGLLayer(session, gl);
            session.updateRenderState({ baseLayer: xrGLLayer });

            // Get reference space with enhanced stability
            this.referenceSpace = await session.requestReferenceSpace('local-floor');

            // Start render loop
            session.requestAnimationFrame((time, frame) => this.onXRFrame(time, frame));
        } catch (error) {
            console.error('Error setting up XR session:', error);
            throw error;
        }
    }

    async setupVisionProControls(session) {
        // Setup Vision Pro specific features
        try {
            // Initialize hand tracking if available
            if (session.supportedFeatures?.has('hand-tracking')) {
                this.handTracking.enabled = true;
                await this.setupHandTracking(session);
            }

            // Setup pinch gesture recognition
            this.setupPinchGestureRecognition();

            // Setup spatial event handlers
            this.setupSpatialEventHandlers(session);

            // Setup eye tracking if available
            if (session.supportedFeatures?.has('eye-tracking')) {
                await this.setupEyeTracking(session);
            }

        } catch (error) {
            console.error('Error setting up Vision Pro controls:', error);
        }
    }

    async setupHandTracking(session) {
        session.addEventListener('inputsourceschange', (event) => {
            event.added.forEach(inputSource => {
                if (inputSource.hand) {
                    this.handTracking.joints.set(inputSource.handedness, new Map());
                }
            });

            event.removed.forEach(inputSource => {
                if (inputSource.hand) {
                    this.handTracking.joints.delete(inputSource.handedness);
                }
            });
        });
    }

    setupPinchGestureRecognition() {
        this.handTracking.gestures.set('pinch', {
            active: false,
            startPosition: null,
            threshold: 0.02 // meters
        });
    }

    setupSpatialEventHandlers(session) {
        if (session.supportedFeatures?.has('spatial-anchors')) {
            session.addEventListener('spatial-anchor-create', this.handleSpatialAnchor.bind(this));
        }

        if (session.supportedFeatures?.has('plane-detection')) {
            session.addEventListener('plane-detected', this.handlePlaneDetection.bind(this));
        }
    }

    async setupEyeTracking(session) {
        try {
            const eyeTracker = await session.requestEyeTracker();
            eyeTracker.addEventListener('eyetrack', this.handleEyeTracking.bind(this));
        } catch (error) {
            console.warn('Eye tracking not available:', error);
        }
    }

    handleSpatialAnchor(event) {
        const anchor = event.anchor;
        // Handle spatial anchor creation
        console.log('Spatial anchor created:', anchor);
    }

    handlePlaneDetection(event) {
        const plane = event.plane;
        // Handle detected plane
        console.log('Plane detected:', plane);
    }

    handleEyeTracking(event) {
        const gazePoint = event.gazePoint;
        if (gazePoint) {
            // Handle gaze point data
            console.log('Gaze point:', gazePoint);
        }
    }

    onXRFrame(time, frame) {
        const session = frame.session;
        if (!session) return;

        // Request next frame
        session.requestAnimationFrame((t, f) => this.onXRFrame(t, f));

        const pose = frame.getViewerPose(this.referenceSpace);
        if (!pose) return;

        // Handle device-specific input
        if (this.device === 'quest') {
            this.handleQuestFrame(frame);
        } else if (this.device === 'visionpro') {
            this.handleVisionProFrame(frame);
        }

        // Update camera from pose
        const view = pose.views[0];
        if (view) {
            this.updateCameraFromXRPose(view);
        }
    }

    handleVisionProFrame(frame) {
        if (!this.handTracking.enabled) return;

        for (const inputSource of frame.session.inputSources) {
            if (inputSource.hand) {
                this.updateHandJoints(frame, inputSource);
                this.detectPinchGesture(inputSource.handedness);
            }
        }
    }

    updateHandJoints(frame, inputSource) {
        const hand = inputSource.hand;
        const handJoints = this.handTracking.joints.get(inputSource.handedness);

        for (const joint of hand.values()) {
            const pose = frame.getJointPose(joint, this.referenceSpace);
            if (pose) {
                handJoints.set(joint.jointName, pose);
            }
        }
    }

    detectPinchGesture(handedness) {
        const joints = this.handTracking.joints.get(handedness);
        if (!joints) return;

        const thumb = joints.get('thumb-tip');
        const index = joints.get('index-finger-tip');

        if (thumb && index) {
            const distance = this.calculateJointDistance(thumb, index);
            const pinchData = this.handTracking.gestures.get('pinch');

            if (distance < pinchData.threshold && !pinchData.active) {
                this.startPinchGesture(thumb.transform.position);
            } else if (distance >= pinchData.threshold && pinchData.active) {
                this.endPinchGesture();
            }
        }
    }

    calculateJointDistance(joint1, joint2) {
        const pos1 = joint1.transform.position;
        const pos2 = joint2.transform.position;
        return Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) +
            Math.pow(pos2.y - pos1.y, 2) +
            Math.pow(pos2.z - pos1.z, 2)
        );
    }

    startPinchGesture(position) {
        const pinchData = this.handTracking.gestures.get('pinch');
        pinchData.active = true;
        pinchData.startPosition = position;
        this.handlePinchStart(position);
    }

    endPinchGesture() {
        const pinchData = this.handTracking.gestures.get('pinch');
        pinchData.active = false;
        pinchData.startPosition = null;
        this.handlePinchEnd();
    }

    handlePinchStart(position) {
        // Handle pinch gesture start
        console.log('Pinch gesture started at:', position);
    }

    handlePinchEnd() {
        // Handle pinch gesture end
        console.log('Pinch gesture ended');
    }

    cleanupVisionProTracking() {
        this.handTracking.joints.clear();
        this.handTracking.gestures.clear();
        this.handTracking.enabled = false;
    }

    // Existing methods remain unchanged...
    updateCameraFromXRPose(view) {
        const matrix = view.transform.matrix;
        
        // Update camera position
        this.camera.position = [
            matrix[12],
            matrix[13],
            matrix[14]
        ];

        // Update camera rotation based on view matrix
        this.camera.rotation = {
            y: Math.atan2(matrix[8], matrix[10]),
            x: Math.atan2(-matrix[9], Math.sqrt(matrix[8] * matrix[8] + matrix[10] * matrix[10]))
        };
    }

    resetView() {
        this.camera.position = [0, 1.6, 3];
        this.camera.rotation = { x: 0, y: 0, z: 0 };
    }
}

// Source: controls.js
export class Controls {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        this.keys = {};
        this.mouseDown = false;
        this.lastX = this.canvas.width / 2;
        this.lastY = this.canvas.height / 2;
        this.rotationSpeed = 10.0;
        this.rollSpeed = 2.0; // Speed for screen space rotation
        this.initialPosition = [...camera.position];
        this.initialFront = [...camera.front];
        this.initialUp = [...camera.up];
        this.initialYaw = camera.yaw;
        this.initialPitch = camera.pitch;
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            if (e.key.toLowerCase() === 'f') {
                this.resetCamera();
            }
        });

        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
            this.canvas.style.cursor = 'pointer';
        });

        document.addEventListener('mouseup', () => {
            this.mouseDown = false;
            this.canvas.style.cursor = 'default';
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    resetCamera() {
        // Reset position
        this.camera.position = [...this.initialPosition];
        this.camera.front = [...this.initialFront];
        this.camera.up = [...this.initialUp];
        // Reset orientation
        this.camera.yaw = this.initialYaw;
        this.camera.pitch = this.initialPitch;
        // Update camera vectors to apply changes
        this.camera.updateCameraVectors();
    }

    update(deltaTime) {
        // Movement controls (WASD + QE)
        if (this.keys['s']) this.camera.processKeyboard('FORWARD', deltaTime);
        if (this.keys['w']) this.camera.processKeyboard('BACKWARD', deltaTime);
        if (this.keys['a']) this.camera.processKeyboard('LEFT', deltaTime);
        if (this.keys['d']) this.camera.processKeyboard('RIGHT', deltaTime);
        if (this.keys['q']) this.camera.processKeyboard('DOWN', deltaTime);
        if (this.keys['e']) this.camera.processKeyboard('UP', deltaTime);

        // Camera rotation controls (IJKL)
        if (this.keys['i']) this.camera.processMouseMovement(0, this.rotationSpeed);
        if (this.keys['k']) this.camera.processMouseMovement(0, -this.rotationSpeed);
        if (this.keys['l']) this.camera.processMouseMovement(-this.rotationSpeed, 0);
        if (this.keys['j']) this.camera.processMouseMovement(this.rotationSpeed, 0);

        // Screen space rotation controls (O/U)
        if (this.keys['u']) this.camera.processScreenSpaceRotation(this.rollSpeed * deltaTime);
        if (this.keys['o']) this.camera.processScreenSpaceRotation(-this.rollSpeed * deltaTime);
    }
}


// Source: grid.js
// grid.js
import { SHADERS } from './shaders.js';

export class Grid {
    constructor(gl) {
        this.gl = gl;
        this.initializeShaders();
        this.initializeBuffers();
    }

    initializeShaders() {
        // Create vertex shader
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, SHADERS.grid.vertex);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, SHADERS.grid.fragment);

        // Create program
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Failed to link program:', this.gl.getProgramInfoLog(this.program));
            return;
        }

        // Get attribute and uniform locations
        this.positionAttribute = this.gl.getAttribLocation(this.program, 'aVertexPosition');
        this.colorAttribute = this.gl.getAttribLocation(this.program, 'aVertexColor');
        this.modelViewUniform = this.gl.getUniformLocation(this.program, 'uModelViewMatrix');
        this.projectionUniform = this.gl.getUniformLocation(this.program, 'uProjectionMatrix');
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    initializeBuffers() {
        // Create grid vertices
        const size = 100;
        const divisions = 20;
        const step = size / divisions;
        const vertices = [];
        const colors = [];
        const gridColor = [0, 1, 0];

        // Create grid lines
        for (let i = -size/2; i <= size/2; i += step) {
            // X axis lines
            vertices.push(i, 0, -size/2);
            vertices.push(i, 0, size/2);
            colors.push(...gridColor, ...gridColor);
            
            // Z axis lines
            vertices.push(-size/2, 0, i);
            vertices.push(size/2, 0, i);
            colors.push(...gridColor, ...gridColor);
        }

        // Create and bind vertex buffer
        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);

        // Create and bind color buffer
        this.colorBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);

        this.vertexCount = vertices.length / 3;
    }

    draw(projectionMatrix, modelViewMatrix) {
        this.gl.useProgram(this.program);

        // Set uniforms
        this.gl.uniformMatrix4fv(this.projectionUniform, false, projectionMatrix);
        this.gl.uniformMatrix4fv(this.modelViewUniform, false, modelViewMatrix);

        // Set vertices
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(this.positionAttribute, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.positionAttribute);

        // Set colors
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
        this.gl.vertexAttribPointer(this.colorAttribute, 3, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.colorAttribute);

        // Draw lines
        this.gl.drawArrays(this.gl.LINES, 0, this.vertexCount);

        // Cleanup
        this.gl.disableVertexAttribArray(this.positionAttribute);
        this.gl.disableVertexAttribArray(this.colorAttribute);
    }
}

// Source: main.js
import { mat4, vec3 } from 'https://cdn.skypack.dev/gl-matrix';
import { Camera } from './camera.js';
import { Controls } from './controls.js';
import { ViewerControls } from './viewer-controls.js';
import { PointCloudRenderer } from './pointcloud-renderer.js';
import { Grid } from './grid.js';
import { XRControls } from './XRControls.js';
import { GaussianSplatApp } from './gaussianSplatApp.js';

class App {
    constructor() {
        console.log('Initializing App...');
        window.glMatrix = { mat4, vec3 };
        this.mat4 = mat4;
        this.vec3 = vec3;

        this.initializeWebGL();
        if (this.gl) {
            this.initializeComponents();
            this.setupEventListeners();
            this.startRenderLoop();
        }
    }

    initializeWebGL() {
        console.log('Initializing WebGL...');
        this.canvas = document.querySelector('#glCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        // Initialize WebGL 1 context
        this.gl = this.canvas.getContext('webgl', {
            xrCompatible: true,
            antialias: true,
            alpha: false,
            depth: true,
            stencil: false
        });

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        console.log('Using WebGL 1.0');
        this.setupWebGLContext();
        this.resizeCanvas();
    }

    setupWebGLContext() {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_ALPHA);

        // Enable extensions needed for WebGL 1
        this.uint32Indices = gl.getExtension('OES_element_index_uint');
        gl.getExtension('OES_vertex_array_object');
        gl.getExtension('OES_standard_derivatives');
        gl.getExtension('WEBGL_depth_texture');
    }

    initializeComponents() {
        console.log('Initializing components...');
        try {
            this.camera = new Camera();
            console.log('Camera initialized');

            this.controls = new Controls(this.camera, this.canvas);
            console.log('Controls initialized');

            this.pointCloudRenderer = new PointCloudRenderer(this.gl);
            console.log('Point cloud renderer initialized');

            // Initialize XR controls first
            this.xrControls = new XRControls(this.pointCloudRenderer, this.camera);
            console.log('XR controls initialized');

            // Initialize viewer controls and pass XR controls reference
            this.viewerControls = new ViewerControls(this.pointCloudRenderer);
            this.viewerControls.setXRControls(this.xrControls);
            console.log('Viewer controls initialized');

            this.grid = new Grid(this.gl);
            console.log('Grid initialized');

            this.lastFrame = 0;
            this.isLoading = false;

            // Add event listener for model loading
            window.addEventListener('modelLoaded', (event) => {
                const cameraSetup = this.pointCloudRenderer.getCameraPositionFromBounds();
                this.camera.position = cameraSetup.position;
                this.camera.lookAt(cameraSetup.target);
                this.camera.up = cameraSetup.up;
            });

            // Setup XR session end handler
            window.addEventListener('xrsessionend', () => {
                const vrButton = document.querySelector('.vr-button');
                const statusIndicator = document.querySelector('.vr-status');
                if (vrButton && statusIndicator) {
                    vrButton.innerHTML = `
                        <svg class="vr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20.5 7H3.5C2.67157 7 2 7.67157 2 8.5V15.5C2 16.3284 2.67157 17 3.5 17H20.5C21.3284 17 22 16.3284 22 15.5V8.5C22 7.67157 21.3284 7 20.5 7Z" stroke="currentColor" stroke-width="2"/>
                            <circle cx="8" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
                            <circle cx="16" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        Enter VR Mode
                    `;
                    statusIndicator.textContent = 'VR Ready';
                    statusIndicator.classList.remove('active');
                }
                document.body.classList.remove('vr-mode');
            });

        } catch (error) {
            console.error('Error initializing components:', error);
            throw error;
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        console.log('Resizing canvas...');
        const { innerWidth, innerHeight } = window;
        this.canvas.width = innerWidth;
        this.canvas.height = innerHeight;
        this.gl.viewport(0, 0, innerWidth, innerHeight);
        console.log(`Canvas resized to ${innerWidth}x${innerHeight}`);
    }

    async loadPointCloud(filePath) {
        if (this.isLoading) return;

        console.log('Loading point cloud from:', filePath);
        this.isLoading = true;

        try {
            await this.pointCloudRenderer.loadPLY(filePath);
            this.centerCameraOnPointCloud();
        } catch (error) {
            console.error('Error loading point cloud:', error);
        } finally {
            this.isLoading = false;
        }
    }

    centerCameraOnPointCloud() {
        const { bounds } = this.pointCloudRenderer;
        const center = {
            x: (bounds.max.x + bounds.min.x) / 2,
            y: (bounds.max.y + bounds.min.y) / 2,
            z: (bounds.max.z + bounds.min.z) / 2
        };

        const size = Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y,
            bounds.max.z - bounds.min.z
        );

        this.camera.position = [
            center.x,
            center.y + size * 0.5,
            center.z + size * 1.5
        ];
        this.camera.lookAt([center.x, center.y, center.z]);
    }

    render(now) {
        try {
            now *= 0.001;
            const deltaTime = now - this.lastFrame;
            this.lastFrame = now;

            // XR VS Normal Controls
            if (!this.xrControls.xrSession) {
                this.controls.update(deltaTime);
            }

            this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            // SMatrix
            const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
            const projectionMatrix = this.mat4.create();
            this.mat4.perspective(projectionMatrix, 45 * Math.PI / 180, aspect, 0.1, 1000.0);

            const viewMatrix = this.camera.getViewMatrix();
            const modelMatrix = this.mat4.create();
            const modelViewMatrix = this.mat4.create();
            this.mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

            // Render scene
            this.grid.draw(projectionMatrix, modelViewMatrix);
            this.pointCloudRenderer.draw(projectionMatrix, modelViewMatrix);

            requestAnimationFrame((now) => this.render(now));
        } catch (error) {
            console.error('Error in render loop:', error);
        }
    }

    startRenderLoop() {
        console.log('Starting render loop...');
        this.render(0);
    }
}

const USE_GAUSSIAN_SPLATS = true;
if (USE_GAUSSIAN_SPLATS) {
    new GaussianSplatApp();
} else {
    new App();
}

window.addEventListener('modelLoaded', (event) => {
    const { bounds, vertexCount } = event.detail;
    console.log(`Model loaded with ${vertexCount} vertices`);
});


// Source: shaders.js
// shaders.js
console.log('Loading shaders module...');

export const SHADERS = {
    grid: {
        vertex: `
            attribute vec3 aVertexPosition;
            attribute vec3 aVertexColor;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            varying vec3 vColor;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
                vColor = aVertexColor;
            }
        `,
        fragment: `
            precision mediump float;
            varying vec3 vColor;
            
            void main() {
                gl_FragColor = vec4(vColor, 1.0);
            }
        `
    },

    point: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute vec3 aColor;
            attribute float aCurvature;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform float uPointSize;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            
            void main() {
                vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
                gl_Position = uProjectionMatrix * mvPosition;
                gl_PointSize = uPointSize;
                
                vNormal = normalize((uModelViewMatrix * vec4(aNormal, 0.0)).xyz);
                vDepth = -mvPosition.z;
                vCurvature = aCurvature;
                vColor = aColor;
            }
        `,
        fragment: `
            #ifdef GL_OES_standard_derivatives
            #extension GL_OES_standard_derivatives : enable
            #endif
            
            precision highp float;
            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            
            uniform float uNearPlane;
            uniform float uFarPlane;
            uniform int uViewMode;
            uniform int uColorProfile;
            
            // Turbo colormap function
            vec3 turbo(float t) {
                const vec3 h = vec3(0.7858, 0.8320, 0.8828);
                const vec3 a = vec3(1.9743, 2.0574, 1.8304);
                const vec3 b = vec3(-1.2661, -1.7715, -1.5430);
                const vec3 c = vec3(0.2039, 0.0883, 0.1934);
                return clamp(h + a * cos(6.28318 * (b * t + c)), 0.0, 1.0);
            }
            
            // Viridis colormap approximation
            vec3 viridis(float t) {
                const vec3 c0 = vec3(0.2777, 0.0048, 0.2899);
                const vec3 c1 = vec3(0.1056, 0.5767, 0.4016);
                const vec3 c2 = vec3(0.8352, 0.2302, 0.1935);
                return c0 + c1 * cos(6.28318 * (c2 * t + vec3(0.0, 0.1, 0.2)));
            }
            
            // Inferno colormap approximation
            vec3 inferno(float t) {
                const vec3 c0 = vec3(0.0002, 0.0016, 0.0139);
                const vec3 c1 = vec3(0.7873, 0.3372, 0.2361);
                const vec3 c2 = vec3(0.2354, 0.4869, 0.9918);
                return c0 + c1 * cos(6.28318 * (c2 * t + vec3(0.0, 0.1, 0.2)));
            }
            
            // Jet colormap approximation
            vec3 jet(float t) {
                return vec3(
                    1.5 - abs(4.0 * t - 3.0),
                    1.5 - abs(4.0 * t - 2.0),
                    1.5 - abs(4.0 * t - 1.0)
                );
            }
    
            vec3 depthToColor(float depth) {
                // Normalize depth to 10 meters max
                float normalizedDepth = clamp(depth / 10.0, 0.0, 1.0);
                
                // Invert so closer is brighter
                normalizedDepth = 1.0 - normalizedDepth;
                
                // Select color profile based on uniform
                if (uColorProfile == 0) return turbo(normalizedDepth);
                if (uColorProfile == 1) return jet(normalizedDepth);
                if (uColorProfile == 2) return viridis(normalizedDepth);
                return inferno(normalizedDepth); // Profile 3
            }
            
            void main() {
                // Discard pixels outside point circle
                vec2 coord = gl_PointCoord - vec2(0.5);
                if(length(coord) > 0.5) {
                    discard;
                }
                
                vec4 finalColor;
                
                if (uViewMode == 0) {
                    finalColor = vec4(vColor, 1.0); // RGB mode
                } 
                else if (uViewMode == 1) {
                    finalColor = vec4(depthToColor(vDepth), 1.0); // Enhanced depth mode
                } 
                else if (uViewMode == 2) {
                    finalColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); // Normal mode
                } 
                else if (uViewMode == 3) {
                    finalColor = vec4(vec3(vCurvature), 1.0); // Curvature mode
                } 
                else if (uViewMode == 4) {
                    #ifdef GL_OES_standard_derivatives
                        float dx = dFdx(vDepth);
                        float dy = dFdy(vDepth);
                        float edgeStrength = length(vec2(dx, dy));
                        finalColor = vec4(vec3(1.0 - edgeStrength * 10.0), 1.0);
                    #else
                        finalColor = vec4(vColor, 1.0);
                    #endif
                }
                else {
                    finalColor = vec4(vColor, 1.0); // Default to RGB
                }
                
                gl_FragColor = finalColor;
            }
        `
    },

    mesh: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute vec3 aColor;
            attribute vec2 aTexCoord;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uNormalMatrix;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec2 vTexCoord;
            varying float vDepth;
            
            void main() {
                vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
                gl_Position = uProjectionMatrix * mvPosition;
                
                vNormal = normalize((uNormalMatrix * vec4(aNormal, 0.0)).xyz);
                vColor = aColor;
                vTexCoord = aTexCoord;
                vDepth = -mvPosition.z;
            }
        `,
        fragment: `
            precision highp float;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec2 vTexCoord;
            varying float vDepth;
            
            uniform int uViewMode;
            uniform float uNearPlane;
            uniform float uFarPlane;
            uniform bool uWireframe;
            
            void main() {
                vec4 finalColor;
                
                if (uViewMode == 0) {
                    // RGB mode with basic lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = vColor * 0.3;
                    vec3 diffuse = vColor * diff * 0.7;
                    finalColor = vec4(ambient + diffuse, 1.0);
                } 
                else if (uViewMode == 1) {
                    // Depth mode
                    float depth = (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vec3(1.0 - depth), 1.0);
                } 
                else if (uViewMode == 2) {
                    // Normal mode
                    finalColor = vec4(vNormal * 0.5 + 0.5, 1.0);
                }
                else {
                    finalColor = vec4(vColor, 1.0);
                }
                
                if (uWireframe) {
                    vec3 wireColor = vec3(0.0, 1.0, 0.0);
                    finalColor = vec4(wireColor, 1.0);
                }
                
                gl_FragColor = finalColor;
            }
    `},

    splat: {
        vertex: `
            attribute vec3 aPosition;      // Vertex position
            attribute vec4 aColor;         // Vertex color
            attribute vec4 aRotation;      // Quaternion (x, y, z, w)
            attribute vec3 aScale;         // Ellipsoid scaling factors

            uniform mat4 uModelViewMatrix; // Model-view transformation matrix
            uniform mat4 uProjectionMatrix; // Projection matrix
            uniform float uPointSize;      // Point size

            varying vec4 vColor;

            vec3 applyQuaternion(vec3 pos, vec4 q) {
                // Apply quaternion rotation
                vec3 u = vec3(q.x, q.y, q.z);
                float s = q.w;

                // Rodrigues' rotation formula
                return 2.0 * dot(u, pos) * u
                     + (s * s - dot(u, u)) * pos
                     + 2.0 * s * cross(u, pos);
            }

            void main() {
                // Apply ellipsoid scaling
                vec3 scaledPosition = aPosition * aScale;

                // Apply quaternion rotation
                vec3 rotatedPosition = applyQuaternion(scaledPosition, aRotation);

                // Transform to model-view space
                vec4 mvPosition = uModelViewMatrix * vec4(rotatedPosition, 1.0);

                // Pass color to fragment shader
                vColor = aColor;

                // Final position in clip space
                gl_Position = uProjectionMatrix * mvPosition;

                // Set point size
                gl_PointSize = uPointSize;
            }
        `,
        fragment: `
            precision highp float;

            uniform int uViewMode; // For potential visualization modes

            varying vec4 vColor;

            void main() {
                // Compute normalized distance from the center of the splat
                vec2 uv = gl_PointCoord.xy * 2.0 - 1.0; // Map [0, 1] to [-1, 1]
                float radius = dot(uv, uv);             // Squared distance from the center

                // Gaussian falloff
                float alpha = exp(-radius * 5.0); // Adjust falloff scale (5.0 is arbitrary)

                // Final color with alpha
                gl_FragColor = vec4(vColor.rgb, vColor.a * alpha);

                // Discard fragments with negligible alpha
                if (alpha < 0.01) discard;
            }
        `
    }
};

export const DEBUG_SHADERS = {
    vertex: `
        attribute vec3 aPosition;
        uniform mat4 uProjectionMatrix;
        uniform mat4 uModelViewMatrix;
        
        void main() {
            gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
        }
    `,
    fragment: `
        precision mediump float;
        
        void main() {
            gl_FragColor = vec4(0.0, 1.0, 0.0, 0.3); // Semi-transparent green
        }
    `
};

console.log('Shaders module loaded successfully');


// Source: frustum.js
import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export class Frustum {
    constructor() {
        this.planes = new Array(6);  // Near, Far, Left, Right, Top, Bottom
    }

    // Update frustum planes from projection and view matrices
    update(projectionMatrix, viewMatrix) {
        // Combine projection and view matrices
        const clip = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix);
        
        // Extract frustum planes
        // Left plane
        this.planes[0] = {
            x: clip[3] + clip[0],
            y: clip[7] + clip[4],
            z: clip[11] + clip[8],
            w: clip[15] + clip[12]
        };
        
        // Right plane
        this.planes[1] = {
            x: clip[3] - clip[0],
            y: clip[7] - clip[4],
            z: clip[11] - clip[8],
            w: clip[15] - clip[12]
        };
        
        // Bottom plane
        this.planes[2] = {
            x: clip[3] + clip[1],
            y: clip[7] + clip[5],
            z: clip[11] + clip[9],
            w: clip[15] + clip[13]
        };
        
        // Top plane
        this.planes[3] = {
            x: clip[3] - clip[1],
            y: clip[7] - clip[5],
            z: clip[11] - clip[9],
            w: clip[15] - clip[13]
        };
        
        // Near plane
        this.planes[4] = {
            x: clip[3] + clip[2],
            y: clip[7] + clip[6],
            z: clip[11] + clip[10],
            w: clip[15] + clip[14]
        };
        
        // Far plane
        this.planes[5] = {
            x: clip[3] - clip[2],
            y: clip[7] - clip[6],
            z: clip[11] - clip[10],
            w: clip[15] - clip[14]
        };

        // Normalize planes
        for (const plane of this.planes) {
            const len = Math.sqrt(plane.x * plane.x + plane.y * plane.y + plane.z * plane.z);
            plane.x /= len;
            plane.y /= len;
            plane.z /= len;
            plane.w /= len;
        }
    }

    // Test if a point is inside the frustum
    containsPoint(point) {
        for (const plane of this.planes) {
            if (plane.x * point.x + plane.y * point.y + plane.z * point.z + plane.w <= 0) {
                return false;
            }
        }
        return true;
    }

    // Test if a box intersects or is inside the frustum
    intersectsBox(bounds) {
        for (const plane of this.planes) {
            let px = bounds.min.x, py = bounds.min.y, pz = bounds.min.z;
            if (plane.x >= 0) px = bounds.max.x;
            if (plane.y >= 0) py = bounds.max.y;
            if (plane.z >= 0) pz = bounds.max.z;
            
            if (plane.x * px + plane.y * py + plane.z * pz + plane.w < 0) {
                return false;
            }
        }
        return true;
    }
}

// Source: model-loader.js
import { PLYLoader } from './ply-loader.js';

const createTypedArrayFromArray = (arr, Type) => {
    if (arr instanceof Type) return arr;
    return new Type(arr);
};


export class ModelLoader {
    constructor() {
        this.supportedFormats = ['ply', 'obj', 'fbx'];
        this.plyLoader = new PLYLoader();
    }
    

    async loadFile(fileData, fileType) {
        console.log(`Loading ${fileType?.toUpperCase()} file...`);
        
        try {
            let processedData = fileData;
            if (typeof fileData === 'string' && (fileData.startsWith('http') || fileData.startsWith('/'))) {
                const response = await fetch(fileData);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                if (fileType?.toLowerCase() === 'ply') {
                    const headerText = await response.clone().text();
                    const isBinary = this.isPlyBinary(headerText);
                    processedData = isBinary ? await response.arrayBuffer() : await response.text();
                } else {
                    processedData = await response.text();
                }
            }
    
            // Parse based on file type
            switch (fileType?.toLowerCase()) {
                case 'ply': {
                    if (!this.plyLoader) this.plyLoader = new PLYLoader();
                    return await this.plyLoader.loadPLY(processedData);
                }
                case 'obj': {
                    const parsed = await this.parseOBJ(processedData);
                    return {
                        vertices: createTypedArrayFromArray(parsed.vertices, Float32Array),
                        normals: createTypedArrayFromArray(parsed.normals, Float32Array),
                        textureCoords: createTypedArrayFromArray(parsed.textureCoords, Float32Array),
                        faces: createTypedArrayFromArray(parsed.faces, Uint32Array),
                        colors: createTypedArrayFromArray(parsed.colors, Float32Array),
                        vertexCount: parsed.vertices.length / 3
                    };
                }
                default:
                    throw new Error(`Unsupported file format: ${fileType}`);
            }
        } catch (error) {
            console.error('Error loading file:', error);
            throw error;
        }
    }

    isPlyBinary(data) {
        // If it's already a buffer, assume binary
        if (data instanceof ArrayBuffer) {
            return true;
        }
        
        // Check first few bytes for PLY signature and format
        const firstLines = data.slice(0, 1000).split('\n');
        return firstLines.some(line => line.includes('format binary'));
    }

    async parseOBJ(data) {
        const lines = data.split(/\r\n|\r|\n/);
        const result = {
            vertices: [],
            normals: [],
            textureCoords: [],
            faces: [],
            colors: []
        };
        
        const temp = {
            vertices: [],
            normals: [],
            textureCoords: []
        };

        try {
            // First pass: collect vertex data
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                const command = parts[0].toLowerCase();

                switch (command) {
                    case 'v': // Vertex
                        temp.vertices.push(
                            parseFloat(parts[1]) || 0,
                            parseFloat(parts[2]) || 0,
                            parseFloat(parts[3]) || 0
                        );
                        // Add default color (white) for each vertex
                        result.colors.push(1.0, 1.0, 1.0);
                        break;

                    case 'vn': // Normal
                        temp.normals.push(
                            parseFloat(parts[1]) || 0,
                            parseFloat(parts[2]) || 0,
                            parseFloat(parts[3]) || 0
                        );
                        break;

                    case 'vt': // Texture coordinate
                        temp.textureCoords.push(
                            parseFloat(parts[1]) || 0,
                            parseFloat(parts[2]) || 0
                        );
                        break;

                    case 'f': // Face
                        const vertices = [];
                        const normals = [];
                        const texCoords = [];

                        // Process each vertex of the face
                        for (let i = 1; i < parts.length; i++) {
                            const indices = parts[i].split('/').map(idx => {
                                const parsed = parseInt(idx);
                                return parsed < 0 ? temp.vertices.length / 3 + parsed : parsed - 1;
                            });
                            
                            const vertexIndex = indices[0] * 3;
                            if (vertexIndex >= 0 && vertexIndex < temp.vertices.length) {
                                vertices.push(
                                    temp.vertices[vertexIndex],
                                    temp.vertices[vertexIndex + 1],
                                    temp.vertices[vertexIndex + 2]
                                );
                            }

                            if (indices[1] !== undefined && indices[1] >= 0) {
                                const texIndex = indices[1] * 2;
                                if (texIndex >= 0 && texIndex < temp.textureCoords.length) {
                                    texCoords.push(
                                        temp.textureCoords[texIndex],
                                        temp.textureCoords[texIndex + 1]
                                    );
                                }
                            }

                            if (indices[2] !== undefined && indices[2] >= 0) {
                                const normalIndex = indices[2] * 3;
                                if (normalIndex >= 0 && normalIndex < temp.normals.length) {
                                    normals.push(
                                        temp.normals[normalIndex],
                                        temp.normals[normalIndex + 1],
                                        temp.normals[normalIndex + 2]
                                    );
                                }
                            }
                        }

                        // Triangulate the face (assuming convex polygon)
                        for (let i = 1; i < vertices.length / 3 - 1; i++) {
                            // Add vertex positions
                            result.vertices.push(
                                vertices[0], vertices[1], vertices[2],              // First vertex
                                vertices[i * 3], vertices[i * 3 + 1], vertices[i * 3 + 2],    // Second vertex
                                vertices[(i + 1) * 3], vertices[(i + 1) * 3 + 1], vertices[(i + 1) * 3 + 2]  // Third vertex
                            );

                            // Add face indices
                            const baseIndex = (result.vertices.length / 3) - 3;
                            result.faces.push(baseIndex, baseIndex + 1, baseIndex + 2);

                            // Add texture coordinates if present
                            if (texCoords.length > 0) {
                                result.textureCoords.push(
                                    texCoords[0], texCoords[1],              // First vertex
                                    texCoords[i * 2], texCoords[i * 2 + 1],    // Second vertex
                                    texCoords[(i + 1) * 2], texCoords[(i + 1) * 2 + 1]  // Third vertex
                                );
                            }

                            // Add normals if present
                            if (normals.length > 0) {
                                result.normals.push(
                                    normals[0], normals[1], normals[2],              // First vertex
                                    normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2],    // Second vertex
                                    normals[(i + 1) * 3], normals[(i + 1) * 3 + 1], normals[(i + 1) * 3 + 2]  // Third vertex
                                );
                            }
                        }
                        break;
                }
            }

            // If no normals were provided, calculate them
            if (result.normals.length === 0) {
                this.calculateNormals(result);
            }

            // Convert arrays to typed arrays
            return {
                vertices: new Float32Array(result.vertices),
                normals: new Float32Array(result.normals),
                textureCoords: new Float32Array(result.textureCoords),
                faces: new Uint32Array(result.faces),
                colors: new Float32Array(result.colors),
                vertexCount: result.vertices.length / 3
            };

        } catch (error) {
            console.error('Error parsing OBJ file:', error);
            throw new Error(`Failed to parse OBJ file: ${error.message}`);
        }
    }

    calculateNormals(model) {
        const vertices = model.vertices;
        const faces = model.faces;
        const normals = new Array(vertices.length).fill(0);

        // Calculate normals for each face
        for (let i = 0; i < faces.length; i += 3) {
            const i1 = faces[i] * 3;
            const i2 = faces[i + 1] * 3;
            const i3 = faces[i + 2] * 3;

            // Get vertices of the triangle
            const v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
            const v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
            const v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];

            // Calculate vectors for cross product
            const vec1 = [
                v2[0] - v1[0],
                v2[1] - v1[1],
                v2[2] - v1[2]
            ];
            const vec2 = [
                v3[0] - v1[0],
                v3[1] - v1[1],
                v3[2] - v1[2]
            ];

            // Calculate cross product
            const normal = [
                vec1[1] * vec2[2] - vec1[2] * vec2[1],
                vec1[2] * vec2[0] - vec1[0] * vec2[2],
                vec1[0] * vec2[1] - vec1[1] * vec2[0]
            ];

            // Add to existing normals (for averaging)
            for (let j = 0; j < 3; j++) {
                normals[i1 + j] += normal[j];
                normals[i2 + j] += normal[j];
                normals[i3 + j] += normal[j];
            }
        }

        // Normalize all normals
        for (let i = 0; i < normals.length; i += 3) {
            const length = Math.sqrt(
                normals[i] * normals[i] +
                normals[i + 1] * normals[i + 1] +
                normals[i + 2] * normals[i + 2]
            );

            if (length > 0) {
                normals[i] /= length;
                normals[i + 1] /= length;
                normals[i + 2] /= length;
            }
        }

        model.normals = normals;
    }
}

// Source: camera.js
import { vec3, mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export class Camera {
    constructor() {
        // Initialize vectors using gl-matrix
        this.position = vec3.fromValues(0, 5, 10);
        this.front = vec3.fromValues(0, 0, -1);
        this.up = vec3.fromValues(0, 1, 0);
        this.right = vec3.create();
        this.worldUp = vec3.fromValues(0, 1, 0);

        // Euler angles
        this.yaw = -90;
        this.pitch = 0;

        // Camera options
        this.movementSpeed = 10.0;
        this.mouseSensitivity = 0.1;

        this.updateCameraVectors();
        this.fy = 1164.6601287484507;
        this.fx = 1159.5880733038064;
    }

    updateCameraVectors() {
        // Calculate new front vector
        const front = vec3.create();
        front[0] = Math.cos(this.yaw * Math.PI / 180) * Math.cos(this.pitch * Math.PI / 180);
        front[1] = Math.sin(this.pitch * Math.PI / 180);
        front[2] = Math.sin(this.yaw * Math.PI / 180) * Math.cos(this.pitch * Math.PI / 180);
        vec3.normalize(this.front, front);

        // Recalculate right and up vectors
        vec3.cross(this.right, this.front, this.worldUp);
        vec3.normalize(this.right, this.right);
        vec3.cross(this.up, this.right, this.front);
        vec3.normalize(this.up, this.up);
    }

    processScreenSpaceRotation(angle) {
        // Rotate the up vector around the front vector
        const rotationMatrix = mat4.create();
        mat4.rotate(rotationMatrix, rotationMatrix, angle, this.front);
        
        // Apply rotation to up vector
        vec3.transformMat4(this.up, this.up, rotationMatrix);
        
        // Ensure up vector stays normalized
        vec3.normalize(this.up, this.up);
        
        // Update right vector
        vec3.cross(this.right, this.front, this.up);
        vec3.normalize(this.right, this.right);
    }

    lookAt(target) {
        if (Array.isArray(target)) {
            const targetVec = vec3.fromValues(target[0], target[1], target[2]);
            vec3.subtract(this.front, targetVec, this.position);
            vec3.normalize(this.front, this.front);
        } else {
            vec3.subtract(this.front, target, this.position);
            vec3.normalize(this.front, this.front);
        }
        this.updateCameraVectors();
    }

    processKeyboard(direction, deltaTime) {
        const velocity = this.movementSpeed * deltaTime;
        const moveVector = vec3.create();

        switch (direction) {
            case 'FORWARD':
                vec3.scaleAndAdd(this.position, this.position, this.front, velocity);
                break;
            case 'BACKWARD':
                vec3.scaleAndAdd(this.position, this.position, this.front, -velocity);
                break;
            case 'LEFT':
                vec3.scaleAndAdd(this.position, this.position, this.right, -velocity);
                break;
            case 'RIGHT':
                vec3.scaleAndAdd(this.position, this.position, this.right, velocity);
                break;
            case 'UP':
                // Use the camera's up vector instead of world up
                vec3.scaleAndAdd(this.position, this.position, this.up, velocity);
                break;
            case 'DOWN':
                vec3.scaleAndAdd(this.position, this.position, this.up, -velocity);
                break;
        }
    }

    processMouseMovement(xoffset, yoffset, constrainPitch = true) {
        xoffset *= this.mouseSensitivity;
        yoffset *= this.mouseSensitivity;

        this.yaw += xoffset;
        this.pitch += yoffset;

        // Constrain pitch
        if (constrainPitch) {
            this.pitch = Math.max(-89.0, Math.min(89.0, this.pitch));
        }

        this.updateCameraVectors();
    }

    getViewMatrix() {
        const viewMatrix = mat4.create();
        const target = vec3.create();
        vec3.add(target, this.position, this.front);
        mat4.lookAt(viewMatrix, this.position, target, this.up);
        return viewMatrix;
    }
}

// Source: octree.js

export class Octree {
    constructor(center, size) {
        this.center = center;  // {x, y, z}
        this.size = size;      // Half-length of the cube
        this.points = [];      // Points stored in this node
        this.children = null;  // Octants when subdivided
        this.maxPoints = 100;  // Maximum points before subdivision
    }

    // Calculate boundaries of the octree node
    getBounds() {
        return {
            min: {
                x: this.center.x - this.size,
                y: this.center.y - this.size,
                z: this.center.z - this.size
            },
            max: {
                x: this.center.x + this.size,
                y: this.center.y + this.size,
                z: this.center.z + this.size
            }
        };
    }

    // Check if a point is within this octree node's bounds
    containsPoint(point) {
        const bounds = this.getBounds();
        return (
            point.x >= bounds.min.x && point.x <= bounds.max.x &&
            point.y >= bounds.min.y && point.y <= bounds.max.y &&
            point.z >= bounds.min.z && point.z <= bounds.max.z
        );
    }

    // Subdivide node into 8 children
    subdivide() {
        const halfSize = this.size / 2;
        const children = [];

        // Create 8 octants
        for (let x = -1; x <= 1; x += 2) {
            for (let y = -1; y <= 1; y += 2) {
                for (let z = -1; z <= 1; z += 2) {
                    children.push(new Octree(
                        {
                            x: this.center.x + x * halfSize/2,
                            y: this.center.y + y * halfSize/2,
                            z: this.center.z + z * halfSize/2
                        },
                        halfSize/2
                    ));
                }
            }
        }

        this.children = children;

        // Redistribute existing points to children
        for (const point of this.points) {
            this.addToChildren(point);
        }
        this.points = []; // Clear points from parent
    }

    // Add point to appropriate child node
    addToChildren(point) {
        for (const child of this.children) {
            if (child.containsPoint(point)) {
                child.insert(point);
                break;
            }
        }
    }

    // Insert a point into the octree
    insert(point) {
        if (!this.containsPoint(point)) {
            return false;
        }

        if (this.children === null) {
            this.points.push(point);
            
            // Subdivide if we exceed maximum points
            if (this.points.length > this.maxPoints) {
                this.subdivide();
            }
        } else {
            this.addToChildren(point);
        }
        return true;
    }

    // Query points within a given radius of a position
    queryRadius(position, radius) {
        const points = [];
        this.queryRadiusRecursive(position, radius, points);
        return points;
    }

    // Recursive helper for radius query
    queryRadiusRecursive(position, radius, result) {
        // Early exit if this node is too far from the query sphere
        if (!this.intersectsSphere(position, radius)) {
            return;
        }

        // Check points in this node
        for (const point of this.points) {
            if (this.distanceSquared(position, point) <= radius * radius) {
                result.push(point);
            }
        }

        // Recurse into children if they exist
        if (this.children) {
            for (const child of this.children) {
                child.queryRadiusRecursive(position, radius, result);
            }
        }
    }

    // Check if node intersects with a sphere
    intersectsSphere(position, radius) {
        const bounds = this.getBounds();
        let closestPoint = {
            x: Math.max(bounds.min.x, Math.min(position.x, bounds.max.x)),
            y: Math.max(bounds.min.y, Math.min(position.y, bounds.max.y)),
            z: Math.max(bounds.min.z, Math.min(position.z, bounds.max.z))
        };
        
        return this.distanceSquared(position, closestPoint) <= radius * radius;
    }

    // Calculate squared distance between two points
    distanceSquared(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return dx * dx + dy * dy + dz * dz;
    }

    // In Octree class, add distance check
    queryFrustum(frustum, cameraPosition) {
        const points = [];
        this.queryFrustumRecursive(frustum, points, cameraPosition);
        return points;
    }

    queryFrustumRecursive(frustum, result, cameraPosition) {
        // Early exit if node is outside frustum
        if (!frustum.intersectsBox(this.getBounds())) {
            return;
        }

        // Calculate distance to camera
        const dx = this.center.x - cameraPosition[0];
        const dy = this.center.y - cameraPosition[1];
        const dz = this.center.z - cameraPosition[2];
        const distanceToCamera = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // LOD threshold based on distance and node size
        const lodThreshold = this.size * 1000; // Adjust this multiplier to tune LOD
        
        // If node is far away and has children, only add some points
        if (distanceToCamera > lodThreshold && this.children) {
            // Add a subset of points from this node
            const stride = Math.max(1, Math.floor(distanceToCamera / lodThreshold));
            for (let i = 0; i < this.points.length; i += stride) {
                result.push(this.points[i]);
            }
        } else {
            // Add all points from this node
            result.push(...this.points);
            
            // Recurse into children if they exist
            if (this.children) {
                for (const child of this.children) {
                    child.queryFrustumRecursive(frustum, result, cameraPosition);
                }
            }
        }
    }
}

// Source: viewer-controls.js
export class ViewerControls {
    constructor(renderer) {
        if (!renderer) {
            throw new Error('ViewerControls requires a renderer instance');
        }

        this.renderer = renderer;
        this.xrControls = null;

        this.viewModes = [
            { name: 'RGB', value: 0 },
            { name: 'Depth', value: 1 },
            { name: 'Normal', value: 2 },
            { name: 'Curvature', value: 3 },
            { name: 'Edge', value: 4 }
        ];

        this.colorProfiles = [
            { name: 'Turbo', value: 0 },
            { name: 'Jet', value: 1 },
            { name: 'Viridis', value: 2 },
            { name: 'Inferno', value: 3 }
        ];

        try {
            this.addStyles();
            this.setupUI();
            this.setupXRInteractions();
            this.setupResponsiveScaling();

            console.log('ViewerControls initialized successfully');
        } catch (error) {
            console.error('Error setting up viewer controls:', error);
            throw error;
        }
    }

    setupUI() {
        // Remove any existing controls
        const existingControls = document.querySelector('.viewer-controls');
        if (existingControls) {
            existingControls.remove();
        }

        const container = document.createElement('div');
        container.className = 'viewer-controls';

        // Create a scrollable wrapper
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'viewer-controls-scroll';

        // File loader
        scrollWrapper.appendChild(this.createFileLoader());
        // Octree Controls
        scrollWrapper.appendChild(this.createOctreeControls());
        // Camera controls info
        scrollWrapper.appendChild(this.createCameraInfo());

        // View mode selector
        scrollWrapper.appendChild(this.createViewModeControl());

        // Point size control
        scrollWrapper.appendChild(this.createPointSizeControl());

        container.appendChild(scrollWrapper);
        document.body.appendChild(container);
    }

    setupResponsiveScaling() {
        // Initial scaling
        this.updateUIScale();

        // Update scaling on window resize
        window.addEventListener('resize', () => {
            this.updateUIScale();
        });
    }

    updateUIScale() {
        const controls = document.querySelector('.viewer-controls');
        if (!controls) return;

        // Get viewport dimensions
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

        // Calculate maximum height for the scrollable area
        const maxHeight = Math.max(vh * 0.8, 400); // At least 400px or 80% of viewport height
        controls.style.maxHeight = `${maxHeight}px`;
    }


    // Add this to your ViewerControls class
    createFileLoader() {
        const group = document.createElement('div');
        group.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = 'Load PLY File';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.ply';  // Only accept PLY files for now
        fileInput.style.display = 'none';

        const button = document.createElement('button');
        button.textContent = 'Choose PLY File';
        button.className = 'file-button';

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.textContent = 'Select a PLY file to load';

        button.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.name.toLowerCase().endsWith('.ply')) {
                fileInfo.textContent = 'Please select a PLY file';
                return;
            }

            fileInfo.textContent = `Loading: ${file.name}`;
            button.disabled = true;

            try {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        // Create a URL for the file
                        const url = URL.createObjectURL(new Blob([event.target.result]));

                        // Load the PLY file
                        await this.renderer.loadPLY(url);

                        fileInfo.textContent = `Loaded: ${file.name}`;

                        // Clean up the URL
                        URL.revokeObjectURL(url);
                    } catch (error) {
                        console.error('Error loading PLY:', error);
                        fileInfo.textContent = `Error: ${error.message}`;
                    } finally {
                        button.disabled = false;
                    }
                };

                reader.onerror = () => {
                    fileInfo.textContent = 'Error reading file';
                    button.disabled = false;
                };

                // Read as ArrayBuffer
                reader.readAsArrayBuffer(file);

            } catch (error) {
                console.error('Error processing file:', error);
                fileInfo.textContent = `Error: ${error.message}`;
                button.disabled = false;
            }
        });

        group.appendChild(label);
        group.appendChild(button);
        group.appendChild(fileInfo);
        group.appendChild(fileInput);

        return group;
    }

    createCameraInfo() {
        const group = document.createElement('div');
        group.className = 'control-group camera-info';

        const label = document.createElement('label');
        label.textContent = 'Camera Controls';

        const controls = document.createElement('div');
        controls.className = 'camera-controls-info';
        controls.innerHTML = `
            <div class="control-info">
                <strong>Movement:</strong> WASD Keys
            </div>
            <div class="control-info">
                <strong>Up/Down:</strong> Q/E Keys
            </div>
            <div class="control-info">
                <strong>Look Around:</strong> IJKL Keys
                <div class="sub-info">
                    I: Look Up | K: Look Down
                    J: Look Left | L: Look Right
                </div>
            </div>
            <div class="control-info">
                <strong>Point Select:</strong> Left Mouse Click
            </div>
            <div class="control-info">
                <strong>Reset Camera:</strong> F Key or Double Click
            </div>
        `;

        // Add additional styles for the sub-info
        const style = document.createElement('style');
        style.textContent = `
            .sub-info {
                margin-left: 15px;
                font-size: 0.9em;
                color: #aaa;
            }
            
            .control-info {
                margin-bottom: 8px;
            }
            
            .control-info:last-child {
                margin-bottom: 0;
            }
            
            .control-info strong {
                color: #4CAF50;
            }
            
            .camera-controls-info {
                line-height: 1.6;
                padding: 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
            }
        `;
        document.head.appendChild(style);

        group.appendChild(label);
        group.appendChild(controls);
        return group;
    }

    createOctreeControls() {
        const group = document.createElement('div');
        group.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = 'Octree Visualization';

        // Single toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'toggle-container';

        const toggleLabel = document.createElement('span');
        toggleLabel.textContent = 'Show Octree';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = 'octreeToggle';
        toggle.checked = this.renderer.useOctree && this.renderer.showOctreeDebug;

        // Single event listener to control both features
        toggle.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            this.renderer.useOctree = isEnabled;
            this.renderer.showOctreeDebug = isEnabled;
        });

        // Assemble the container
        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggle);

        group.appendChild(label);
        group.appendChild(toggleContainer);

        return group;
    }

    createViewModeControl() {
        const group = document.createElement('div');
        group.className = 'control-group';

        // Create view mode section
        const viewModeSection = document.createElement('div');
        viewModeSection.className = 'control-section';

        const viewModeLabel = document.createElement('label');
        viewModeLabel.textContent = 'View Mode';

        const viewModeSelect = document.createElement('select');
        viewModeSelect.className = 'control-select';
        this.viewModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.value;
            option.textContent = mode.name;
            viewModeSelect.appendChild(option);
        });

        viewModeSection.appendChild(viewModeLabel);
        viewModeSection.appendChild(viewModeSelect);

        // Create color profile section
        const colorProfileSection = document.createElement('div');
        colorProfileSection.className = 'control-section color-profile-section';
        // Initially hidden
        colorProfileSection.style.display = 'none';

        const colorProfileLabel = document.createElement('label');
        colorProfileLabel.textContent = 'Depth Color Profile';

        const colorProfileSelect = document.createElement('select');
        colorProfileSelect.className = 'control-select';
        [
            { name: 'Turbo', value: 0 },
            { name: 'Jet', value: 1 },
            { name: 'Viridis', value: 2 },
            { name: 'Inferno', value: 3 }
        ].forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.value;
            option.textContent = profile.name;
            colorProfileSelect.appendChild(option);
        });

        colorProfileSection.appendChild(colorProfileLabel);
        colorProfileSection.appendChild(colorProfileSelect);

        // Create render mode section
        const renderModeSection = document.createElement('div');
        renderModeSection.className = 'control-section';

        const renderModeLabel = document.createElement('label');
        renderModeLabel.textContent = 'Render Mode';

        const renderModeSelect = document.createElement('select');
        renderModeSelect.className = 'control-select';
        ['Points', 'Mesh', 'Wireframe', 'Splat'].forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.toLowerCase();
            option.textContent = mode;
            renderModeSelect.appendChild(option);
        });

        renderModeSection.appendChild(renderModeLabel);
        renderModeSection.appendChild(renderModeSelect);

        // Add event listeners
        viewModeSelect.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            this.renderer.setViewMode(value);
            // Show color profile selector only in depth view mode (mode 1)
            colorProfileSection.style.display = value === 1 ? 'block' : 'none';
        });

        colorProfileSelect.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            this.renderer.setColorProfile?.(value); // Optional chaining in case method isn't implemented
        });

        renderModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            if (mode === 'wireframe') {
                this.renderer.setWireframe(true);
                this.renderer.setRenderMode('mesh');
            } else {
                this.renderer.setWireframe(false);
                this.renderer.setRenderMode(mode);
            }
        });

        // Add sections to group
        group.appendChild(viewModeSection);
        group.appendChild(colorProfileSection);
        group.appendChild(renderModeSection);

        // Add styles
        const styles = `
            .control-section {
                margin-bottom: 15px;
            }
            
            .control-section:last-child {
                margin-bottom: 0;
            }
            
            .color-profile-section {
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                margin: 10px 0;
            }
            
            .control-select {
                width: 100%;
                padding: 8px;
                background: #444;
                border: 1px solid #666;
                border-radius: 4px;
                color: white;
                margin-top: 5px;
            }
            
            .control-select:focus {
                outline: none;
                border-color: #888;
            }
        `;

        // Add styles if they don't exist
        if (!document.getElementById('view-mode-control-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'view-mode-control-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }

        return group;
    }
    createPointSizeControl() {
        const group = document.createElement('div');
        group.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = 'Point Size';

        const pointSizeContainer = document.createElement('div');
        pointSizeContainer.className = 'point-size-container';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'pointSizeSlider';
        slider.min = '1';
        slider.max = '10';
        slider.step = '0.1';
        slider.value = '1';

        const value = document.createElement('span');
        value.textContent = '1.0';

        slider.addEventListener('input', (e) => {
            try {
                const size = parseFloat(e.target.value);
                if (!isNaN(size)) {
                    this.renderer.setPointSize(size);
                    value.textContent = size.toFixed(1);
                }
            } catch (error) {
                console.error('Error updating point size:', error);
            }
        });

        pointSizeContainer.appendChild(slider);
        pointSizeContainer.appendChild(value);

        group.appendChild(label);
        group.appendChild(pointSizeContainer);
        return group;
    }

    setupResponsiveScaling() {
        // Initial scaling
        this.updateUIScale();

        // Update scaling on window resize
        window.addEventListener('resize', () => {
            this.updateUIScale();
        });
    }

    updateUIScale() {
        const controls = document.querySelector('.viewer-controls');
        if (!controls) return;

        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

        const maxHeight = Math.max(vh * 0.8, 400);
        controls.style.maxHeight = `${maxHeight}px`;
    }

    addStyles() {
        const styleId = 'viewer-controls-styles';

        // Remove existing styles if they exist
        const existingStyles = document.getElementById(styleId);
        if (existingStyles) {
            existingStyles.remove();
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Base UI Styles */
            .viewer-controls {
                position: fixed;
                top: 20px;
                left: 20px;
                background: rgba(0, 0, 0, 0.8);
                padding: 15px;
                border-radius: 15px;
                color: white;
                font-family: Arial, sans-serif;
                width: clamp(300px, 25vw, 400px);
                max-height: 80vh;
                z-index: 1000;
                pointer-events: auto;
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                display: flex;
                flex-direction: column;
            }

            .viewer-controls-scroll {
                overflow-y: auto;
                overflow-x: hidden;
                flex-grow: 1;
                padding-right: 10px; /* Space for scrollbar */
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
            }

            /* Custom scrollbar styles */
            .viewer-controls-scroll::-webkit-scrollbar {
                width: 6px;
            }

            .viewer-controls-scroll::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 3px;
            }

            .viewer-controls-scroll::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 3px;
            }

            .viewer-controls-scroll::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.4);
            }
            
            /* Control Groups */
            .control-group {
                margin-bottom: 20px;
                padding: clamp(12px, 2vw, 20px);
                background: rgba(0, 0, 0, 0.8);
                border-radius: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                transition: transform 0.2s ease;
            }
            
            /* Labels */
            .control-group label {
                display: block;
                margin-bottom: 8px;
                font-size: clamp(14px, 1.2vw, 18px);
                font-weight: bold;
                color: #ddd;
            }
            
            /* Input Elements */
            .control-group select,
            .control-group input[type="range"] {
                width: 100%;
                padding: clamp(8px, 1vw, 12px);
                background: #444;
                border: 1px solid #666;
                border-radius: 8px;
                color: white;
                outline: none;
                height: clamp(36px, 4vh, 44px);
                margin: 10px 0;
                font-size: clamp(12px, 1vw, 16px);
            }
            
            /* File Button */
            .file-button {
                display: block;
                width: 100%;
                padding: clamp(10px, 1.5vw, 20px);
                background: #4CAF50;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: clamp(14px, 1.2vw, 16px);
                height: clamp(40px, 5vh, 50px);
                transition: all 0.3s ease;
            }
            
            /* Point Size Container */
            .point-size-container {
                display: flex;
                align-items: center;
                gap: clamp(8px, 1vw, 12px);
            }
            
            .point-size-container input {
                flex: 1;
            }
            
            .point-size-container span {
                min-width: 30px;
                text-align: right;
                font-size: clamp(12px, 1vw, 16px);
            }
            
            /* Toggle Container */
            .toggle-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: clamp(8px, 1vw, 12px);
                height: clamp(40px, 5vh, 50px);
            }
            
            .toggle-container input[type="checkbox"] {
                width: clamp(40px, 4vw, 50px);
                height: clamp(20px, 2.5vh, 26px);
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .viewer-controls {
                    width: clamp(250px, 80vw, 350px);
                }
            }

            @media (max-height: 600px) {
                .viewer-controls {
                    max-height: 90vh;
                    top: 10px;
                }
            }

            /* Keep all your existing styles below this line */
            ${this.getExistingStyles()}
        `;

        document.head.appendChild(style);
    }

    getExistingStyles() {
        // Return all your existing styles here
        return `
            /* Control Groups */
            .control-group {
                margin-bottom: 20px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                transition: transform 0.2s ease;
            }
            
            /* ... (rest of your existing styles) ... */
        `;
    }
    setupSpatialEvents() {
        // Handle spatial selection events
        document.addEventListener('select', (e) => {
            if (e.target.closest('.viewer-controls')) {
                // Handle UI interaction in spatial context
                e.target.click();
            }
        });

        // Handle hover states
        document.addEventListener('beforexrselect', (e) => {
            const control = e.target.closest('.control-group');
            if (control) {
                control.style.transform = 'scale(1.1)';
            }
        });
    }

    setupXRInteractions() {
        // For Vision Pro gestures
        window.addEventListener('gesturestart', (e) => this.handleGestureStart(e));
        window.addEventListener('gesturechange', (e) => this.handleGestureChange(e));
        window.addEventListener('gestureend', (e) => this.handleGestureEnd(e));

        // For Quest controller interaction
        this.activeControl = null;
        this.isDragging = false;
        this.lastPointerPosition = { x: 0, y: 0 };

        // Add ray intersection detection for Quest controllers
        document.addEventListener('controller-ray-intersect', (e) => {
            const { element, controller } = e.detail;
            if (element.closest('.viewer-controls')) {
                this.handleControllerIntersection(element, controller);
            }
        });
    }

    handleGestureStart(e) {
        // Find the control element under the gesture
        const control = document.elementFromPoint(e.clientX, e.clientY);
        if (control) {
            if (control.type === 'range') {
                // Handle slider interaction
                this.activeControl = control;
                this.initialValue = parseFloat(control.value);
                this.lastX = e.clientX;
            } else if (control.tagName === 'SELECT') {
                // Handle view mode selection
                this.activeControl = control;
            }
        }
    }

    handleGestureChange(e) {
        if (!this.activeControl) return;

        if (this.activeControl.type === 'range') {
            // Handle slider movement
            let delta;
            if (e.scale) {
                // Pinch gesture
                delta = (e.scale - 1.0) * 5.0; // Increased sensitivity
            } else if (e.clientX) {
                // Drag gesture
                delta = (e.clientX - this.lastX) / 100;
                this.lastX = e.clientX;
            }

            if (delta) {
                const range = this.activeControl.max - this.activeControl.min;
                const newValue = parseFloat(this.activeControl.value) + (delta * range);

                // Update slider value
                this.activeControl.value = Math.min(Math.max(newValue, this.activeControl.min), this.activeControl.max);

                // Update point size
                if (this.activeControl.id === 'pointSizeSlider') {
                    this.renderer.setPointSize(parseFloat(this.activeControl.value));
                    // Update display value
                    const valueDisplay = this.activeControl.parentNode.querySelector('span');
                    if (valueDisplay) {
                        valueDisplay.textContent = parseFloat(this.activeControl.value).toFixed(1);
                    }
                }
            }
        } else if (this.activeControl.tagName === 'SELECT') {
            // Handle view mode selection with rotation gesture
            const rotationDelta = e.rotation;
            if (Math.abs(rotationDelta) > 45) { // Threshold for view mode change
                const currentIndex = this.activeControl.selectedIndex;
                const newIndex = rotationDelta > 0 ?
                    (currentIndex + 1) % this.activeControl.options.length :
                    (currentIndex - 1 + this.activeControl.options.length) % this.activeControl.options.length;

                this.activeControl.selectedIndex = newIndex;
                this.renderer.setViewMode(parseInt(this.activeControl.value));
            }
        }
    }

    handleGestureEnd(e) {
        this.activeControl = null;
        this.initialValue = null;
    }

    // For Quest controller interaction
    handleControllerIntersection(element, controller) {
        const prevHover = document.querySelector('.xr-hover');
        if (prevHover) prevHover.classList.remove('xr-hover');

        const controlGroup = element.closest('.control-group');
        if (controlGroup) {
            controlGroup.classList.add('xr-hover');
        }

        if (controller.buttons[0].pressed) { // Trigger button
            if (element.type === 'range') {
                // Handle slider
                const rect = element.getBoundingClientRect();
                const percentage = (controller.position.x - rect.left) / rect.width;
                const newValue = element.min + (percentage * (element.max - element.min));
                element.value = Math.min(Math.max(newValue, element.min), element.max);

                if (element.id === 'pointSizeSlider') {
                    this.renderer.setPointSize(parseFloat(element.value));
                }
            } else if (element.tagName === 'SELECT') {
                // Handle view mode selection
                element.selectedIndex = (element.selectedIndex + 1) % element.options.length;
                this.renderer.setViewMode(parseInt(element.value));
            }
        }
    }
    setXRControls(xrControls) {
        this.xrControls = xrControls;
        this.checkVRSupport();
    }


    async checkVRSupport() {
        if (!('xr' in navigator)) {
            console.log('WebXR not supported');
            return;
        }

        try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (isSupported) {
                this.addVRButton();
            }
        } catch (error) {
            console.error('Error checking VR support:', error);
        }

        // Add VR button anyway to show unsupported state
        this.addVRButton();
    }

    addVRButton() {
        const container = document.querySelector('.viewer-controls');
        if (!container) return;

        // Create VR control group
        const group = document.createElement('div');
        group.className = 'control-group vr-control';

        const label = document.createElement('label');
        label.textContent = 'Virtual Reality';

        const vrButton = document.createElement('button');
        vrButton.className = 'vr-button';
        vrButton.innerHTML = `
            <svg class="vr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.5 7H3.5C2.67157 7 2 7.67157 2 8.5V15.5C2 16.3284 2.67157 17 3.5 17H20.5C21.3284 17 22 16.3284 22 15.5V8.5C22 7.67157 21.3284 7 20.5 7Z" stroke="currentColor" stroke-width="2"/>
                <circle cx="8" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
                <circle cx="16" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
            </svg>
            Enter VR Mode
        `;

        // Add status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'vr-status';
        statusIndicator.textContent = 'VR Ready';

        vrButton.addEventListener('click', () => this.handleVRButtonClick(vrButton, statusIndicator));

        group.appendChild(label);
        group.appendChild(vrButton);
        group.appendChild(statusIndicator);
        container.appendChild(group);

        // Add specific styles for the VR button
        this.addVRButtonStyles();
    }

    async handleVRButtonClick(button, statusIndicator) {
        if (!this.xrControls) return;

        try {
            if (!this.xrControls.xrSession) {
                button.disabled = true;
                statusIndicator.textContent = 'Starting VR...';

                await this.xrControls.startXRSession();

                button.innerHTML = `
                    <svg class="vr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
                    </svg>
                    Exit VR Mode
                `;
                statusIndicator.textContent = 'VR Active';
                statusIndicator.classList.add('active');
                document.body.classList.add('vr-mode');

            } else {
                await this.xrControls.xrSession.end();
            }
            button.disabled = false;
        } catch (error) {
            console.error('Error handling VR mode:', error);
            statusIndicator.textContent = 'VR Error';
            statusIndicator.classList.add('error');
            button.disabled = false;
            setTimeout(() => {
                statusIndicator.textContent = 'VR Ready';
                statusIndicator.classList.remove('error');
            }, 3000);
        }
    }

    addVRButtonStyles() {
        const styleSheet = document.querySelector('#viewer-controls-styles');
        if (!styleSheet) return;

        const vrStyles = `
            /* VR Button Styles */
            .vr-control {
                margin-top: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding-top: 20px;
            }

            .vr-button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                width: 100%;
                padding: 12px 20px;
                background: #2196F3;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s ease;
                min-height: 44px;
            }

            .vr-button:hover {
                background: #1976D2;
                transform: scale(1.02);
            }

            .vr-icon {
                width: 24px;
                height: 24px;
            }

            .vr-status {
                margin-top: 8px;
                font-size: 14px;
                color: #888;
                text-align: center;
                transition: all 0.3s ease;
            }

            .vr-status.active {
                color: #4CAF50;
            }

            .vr-status.error {
                color: #F44336;
            }

            /* VR Mode specific styles */
            .vr-mode .viewer-controls {
                opacity: 0.9;
                transform: scale(1.2);
            }

            .vr-mode .vr-button {
                background: #F44336;
            }

            .vr-mode .vr-button:hover {
                background: #D32F2F;
            }

            /* Hover effects for VR interaction */
            .vr-button.xr-hover {
                transform: scale(1.1);
                box-shadow: 0 0 20px rgba(33, 150, 243, 0.4);
            }

            @media (max-width: 768px) {
                .vr-button {
                    padding: 10px 15px;
                    font-size: 14px;
                }

                .vr-icon {
                    width: 20px;
                    height: 20px;
                }
            }
        `;

        styleSheet.textContent += vrStyles;
    }
}


// Source: pointcloud-renderer.js
import { ModelLoader } from './model-loader.js';
import { SHADERS, DEBUG_SHADERS } from './shaders.js';
import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';
import { Octree } from './octree.js';
import { Frustum } from './frustum.js';

export class PointCloudRenderer {

    constructor(gl) {
        this.gl = gl;
        this.octree = null;

        this.useOctree = true;
        this.showOctreeDebug = true;

        console.log('Initializing PointCloudRenderer with WebGL 1');

        // Initialize bounds first
        this.bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        // Initialize ModelLoader
        this.modelLoader = new ModelLoader();

        // Initialize propertySizes map
        this.propertySizes = new Map([
            ['char', 1], ['uchar', 1],
            ['short', 2], ['ushort', 2],
            ['int', 4], ['uint', 4],
            ['float', 4], ['double', 8]
        ]);

        this.initBuffers();
        const shadersInitialized = this.initShaders();
        const meshShadersInitialized = this.initMeshShaders();
        const debugShadersInitialized = this.initDebugShaders();
        const splatShadersInitialized = this.initSplatShaders();


        if (!shadersInitialized || !meshShadersInitialized || !debugShadersInitialized || !splatShadersInitialized) {
            console.error('Failed to initialize shaders');
            return;
        }


        this.viewMode = 0;
        this.pointSize = 5.0;
        this.vertexCount = 0;
        this.renderMode = 'points';
        this.wireframe = false;

        // Get WebGL 1 extension for 32-bit indices
        this.uint32Indices = gl.getExtension('OES_element_index_uint');
        console.log('32-bit indices ' + (this.uint32Indices ? 'enabled' : 'not available'));
    }

    initBuffers() {
        this.buffers = {
            position: this.gl.createBuffer(),
            normal: this.gl.createBuffer(),
            color: this.gl.createBuffer(),
            curvature: this.gl.createBuffer(),
            indices: this.gl.createBuffer(),
            texCoords: this.gl.createBuffer(),
            scale: this.gl.createBuffer(),
            rotation: this.gl.createBuffer()
        };
    }

    setColorProfile(profile) {
        const gl = this.gl;
        gl.useProgram(this.program);
        gl.uniform1i(this.uniforms.colorProfile, profile);

    }

    initShaders() {
        try {
            const gl = this.gl;

            // Create shader program for points
            const vertexShader = this.createShader(gl.VERTEX_SHADER, SHADERS.point.vertex);
            const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, SHADERS.point.fragment);

            if (!vertexShader || !fragmentShader) {
                throw new Error('Failed to create shaders');
            }

            this.program = gl.createProgram();
            gl.attachShader(this.program, vertexShader);
            gl.attachShader(this.program, fragmentShader);
            gl.linkProgram(this.program);

            if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(this.program);
                throw new Error('Could not link WebGL program. \n\n' + info);
            }

            // Get attributes - IMPORTANT: These must match the shader exactly
            this.attributes = {
                position: gl.getAttribLocation(this.program, 'aPosition'),
                normal: gl.getAttribLocation(this.program, 'aNormal'),
                color: gl.getAttribLocation(this.program, 'aColor'),
                curvature: gl.getAttribLocation(this.program, 'aCurvature')
            };

            // Validate required attributes
            if (this.attributes.position === -1) {
                throw new Error('Could not find position attribute');
            }

            // Get uniforms
            this.uniforms = {
                modelView: gl.getUniformLocation(this.program, 'uModelViewMatrix'),
                projection: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
                pointSize: gl.getUniformLocation(this.program, 'uPointSize'),
                viewMode: gl.getUniformLocation(this.program, 'uViewMode'),
                nearPlane: gl.getUniformLocation(this.program, 'uNearPlane'),
                farPlane: gl.getUniformLocation(this.program, 'uFarPlane'),
                colorProfile: gl.getUniformLocation(this.program, 'uColorProfile')
            };

            // Validate required uniforms
            if (!this.uniforms.modelView || !this.uniforms.projection || !this.uniforms.pointSize) {
                throw new Error('Could not find required uniforms');
            }

            console.log('Shader initialization successful', {
                attributes: this.attributes,
                uniforms: this.uniforms,
            });

            return true;
        } catch (error) {
            console.error('Error initializing shaders:', error);
            return false;
        }
    }

    initMeshShaders() {
        try {
            const gl = this.gl;

            // Create shader program for mesh
            const vertexShader = this.createShader(gl.VERTEX_SHADER, SHADERS.mesh.vertex);
            const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, SHADERS.mesh.fragment);

            if (!vertexShader || !fragmentShader) {
                throw new Error('Failed to create mesh shaders');
            }

            this.meshProgram = gl.createProgram();
            gl.attachShader(this.meshProgram, vertexShader);
            gl.attachShader(this.meshProgram, fragmentShader);
            gl.linkProgram(this.meshProgram);

            if (!gl.getProgramParameter(this.meshProgram, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(this.meshProgram);
                throw new Error('Could not link WebGL mesh program. \n\n' + info);
            }

            // Get mesh attributes
            this.meshAttributes = {
                position: gl.getAttribLocation(this.meshProgram, 'aPosition'),
                normal: gl.getAttribLocation(this.meshProgram, 'aNormal'),
                color: gl.getAttribLocation(this.meshProgram, 'aColor'),
                texCoord: gl.getAttribLocation(this.meshProgram, 'aTexCoord')
            };

            // Check if required attributes were found
            if (this.meshAttributes.position === -1) {
                console.error('Could not find position attribute in mesh shader');
            }

            // Get mesh uniforms
            this.meshUniforms = {
                modelView: gl.getUniformLocation(this.meshProgram, 'uModelViewMatrix'),
                projection: gl.getUniformLocation(this.meshProgram, 'uProjectionMatrix'),
                normalMatrix: gl.getUniformLocation(this.meshProgram, 'uNormalMatrix'),
                viewMode: gl.getUniformLocation(this.meshProgram, 'uViewMode'),
                wireframe: gl.getUniformLocation(this.meshProgram, 'uWireframe'),
                nearPlane: gl.getUniformLocation(this.meshProgram, 'uNearPlane'),
                farPlane: gl.getUniformLocation(this.meshProgram, 'uFarPlane')
            };

            // Check if required uniforms were found
            if (this.meshUniforms.modelView === null ||
                this.meshUniforms.projection === null ||
                this.meshUniforms.normalMatrix === null) {
                throw new Error('Could not find required uniforms in mesh shader');
            }

            return true;
        } catch (error) {
            console.error('Error initializing mesh shaders:', error);
            return false;
        }
    }

    initDebugShaders() {
        try {
            const gl = this.gl;

            // Create and compile shaders
            const vertexShader = this.createShader(gl.VERTEX_SHADER, DEBUG_SHADERS.vertex);
            const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, DEBUG_SHADERS.fragment);

            if (!vertexShader || !fragmentShader) {
                throw new Error('Failed to create debug shaders');
            }

            // Create program
            this.debugProgram = gl.createProgram();
            gl.attachShader(this.debugProgram, vertexShader);
            gl.attachShader(this.debugProgram, fragmentShader);
            gl.linkProgram(this.debugProgram);

            if (!gl.getProgramParameter(this.debugProgram, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(this.debugProgram);
                throw new Error('Could not link debug program. \n\n' + info);
            }

            // Get locations
            this.debugAttribs = {
                position: gl.getAttribLocation(this.debugProgram, 'aPosition')
            };

            this.debugUniforms = {
                projection: gl.getUniformLocation(this.debugProgram, 'uProjectionMatrix'),
                modelView: gl.getUniformLocation(this.debugProgram, 'uModelViewMatrix')
            };

            // Create buffer for debug lines
            this.debugBuffer = gl.createBuffer();

            return true;
        } catch (error) {
            console.error('Error initializing debug shaders:', error);
            return false;
        }
    }

    initSplatShaders() {
        try {
            const gl = this.gl;

            // Create and compile shaders
            const vertexShader = this.createShader(gl.VERTEX_SHADER, SHADERS.splat.vertex);
            const fragmentShader = this.createShader(gl.FRAGMENT_SHADER, SHADERS.splat.fragment);

            if (!vertexShader || !fragmentShader) {
                throw new Error('Failed to create splat shaders');
            }

            // Create program
            this.splatProgram = gl.createProgram();
            gl.attachShader(this.splatProgram, vertexShader);
            gl.attachShader(this.splatProgram, fragmentShader);
            gl.linkProgram(this.splatProgram);

            if (!gl.getProgramParameter(this.splatProgram, gl.LINK_STATUS)) {
                const info = gl.getProgramInfoLog(this.splatProgram);
                throw new Error('Could not link splat program. \n\n' + info);
            }

            // Get splat attributes
            this.splatAttributes = {
                position: gl.getAttribLocation(this.splatProgram, 'aPosition'),
                //normal: gl.getAttribLocation(this.splatProgram, 'aNormal'),
                color: gl.getAttribLocation(this.splatProgram, 'aColor'),
                scale: gl.getAttribLocation(this.splatProgram, 'aScale'),
                rotation: gl.getAttribLocation(this.splatProgram, 'aRotation')
            };

            this.splatUniforms = {
                projection: gl.getUniformLocation(this.splatProgram, 'uProjectionMatrix'),
                modelView: gl.getUniformLocation(this.splatProgram, 'uModelViewMatrix'),
                //pointSize: gl.getUniformLocation(this.splatProgram, 'uPointSize'),
                viewMode: gl.getUniformLocation(this.splatProgram, 'uViewMode'),
            };

            return true;
        } catch (error) {
            console.error('Error initializing splat shaders:', error);
            return false;
        }
    }

    createShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            console.error('Shader compilation error:', info);
            console.error('Shader source:', source);
            gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    setViewMode(mode) {
        this.viewMode = mode;
    }

    setPointSize(size) {
        this.pointSize = Math.max(0.1, Math.min(10.0, size));
    }

    updateBuffers(data) {
        const gl = this.gl;

        // Validate incoming data
        if (!data.vertices || data.vertices.length === 0) {
            throw new Error('Vertices data is missing or empty.');
        }

        // Store original data
        this.originalVertices = data.vertices instanceof Float32Array ?
            data.vertices : new Float32Array(data.vertices);
        this.originalNormals = data.normals instanceof Float32Array ?
            data.normals : data.normals ? new Float32Array(data.normals) : null;
        this.originalColors = data.colors instanceof Float32Array ?
            data.colors : data.colors ? new Float32Array(data.colors) : new Float32Array(this.originalVertices.length).fill(1.0);
        this.originalScales = data.scales instanceof Float32Array ?
            data.scales : data.scales ? new Float32Array(data.scales) : new Float32Array(this.originalVertices.length / 3).fill(1.0); // Default scale: 1.0
        this.originalRotations = data.rotations instanceof Float32Array ?
            data.rotations : data.rotations ? new Float32Array(data.rotations) : new Float32Array(this.originalVertices.length); // Default: identity rotations (empty)

        this.vertexCount = this.originalVertices.length / 3;

        // Reset previous buffers
        Object.values(this.buffers).forEach(buffer => {
            if (buffer) gl.deleteBuffer(buffer);
        });

        this.initBuffers();

        // Upload vertices
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, this.originalVertices, gl.STATIC_DRAW);

        // Upload normals (default to Y-axis if not provided)
        const normals = this.originalNormals || new Float32Array(this.originalVertices.length).map((_, i) => (i % 3 === 1 ? 1 : 0));
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);

        // Upload colors
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.bufferData(gl.ARRAY_BUFFER, this.originalColors, gl.STATIC_DRAW);

        // Upload scales
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.scale);
        gl.bufferData(gl.ARRAY_BUFFER, this.originalScales, gl.STATIC_DRAW);

        // Upload rotations
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rotation);
        gl.bufferData(gl.ARRAY_BUFFER, this.originalRotations, gl.STATIC_DRAW);

        // Upload curvature (default to zero)
        const curvature = new Float32Array(this.vertexCount).fill(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.curvature);
        gl.bufferData(gl.ARRAY_BUFFER, curvature, gl.STATIC_DRAW);

        // Calculate bounds
        const bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        for (let i = 0; i < this.originalVertices.length; i += 3) {
            bounds.min.x = Math.min(bounds.min.x, this.originalVertices[i]);
            bounds.min.y = Math.min(bounds.min.y, this.originalVertices[i + 1]);
            bounds.min.z = Math.min(bounds.min.z, this.originalVertices[i + 2]);
            bounds.max.x = Math.max(bounds.max.x, this.originalVertices[i]);
            bounds.max.y = Math.max(bounds.max.y, this.originalVertices[i + 1]);
            bounds.max.z = Math.max(bounds.max.z, this.originalVertices[i + 2]);
        }

        // Build octree
        const center = {
            x: (bounds.max.x + bounds.min.x) / 2,
            y: (bounds.max.y + bounds.min.y) / 2,
            z: (bounds.max.z + bounds.min.z) / 2
        };

        const size = Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y,
            bounds.max.z - bounds.min.z
        ) / 2;

        this.octree = new Octree(center, size);

        for (let i = 0; i < this.originalVertices.length; i += 3) {
            this.octree.insert({
                x: this.originalVertices[i],
                y: this.originalVertices[i + 1],
                z: this.originalVertices[i + 2],
                index: i / 3
            });
        }

        // Debugging information
        console.log('Buffers initialized with:', {
            vertexCount: this.vertexCount,
            hasNormals: !!this.originalNormals,
            hasColors: !!this.originalColors,
            hasScales: !!this.originalScales,
            hasRotations: !!this.originalRotations,
            bufferSizes: {
                vertices: this.originalVertices.length,
                normals: normals.length,
                colors: this.originalColors.length,
                scales: this.originalScales.length,
                rotations: this.originalRotations.length,
                curvature: curvature.length
            },
            bounds,
            octree: {
                center,
                size
            }
        });
    }

    async parseBinaryData(header, dataView, result) {
        try {
            let offset = header.headerLength;
            const littleEndian = header.format.includes('little_endian');

            // Helper function to validate offset
            const validateOffset = (size) => {
                if (offset + size > dataView.byteLength) {
                    throw new Error(`Buffer overflow at offset ${offset}, needs ${size} bytes`);
                }
            };

            // Read vertices
            for (let i = 0; i < header.numVertices; i++) {
                for (const [propName, prop] of Object.entries(header.properties)) {
                    if (prop.isList) continue;

                    const propSize = this.propertySizes.get(prop.type);
                    validateOffset(propSize);

                    const value = this.readProperty(dataView, offset, prop.type, littleEndian);
                    offset += propSize;

                    if (propName === 'x' || propName === 'y' || propName === 'z') {
                        result.vertices.push(value);
                    } else if (propName === 'nx' || propName === 'ny' || propName === 'nz') {
                        result.normals.push(value);
                    } else if (propName === 'red' || propName === 'green' || propName === 'blue') {
                        result.colors.push(value / 255);
                    }
                }
            }

            // Read faces
            if (header.numFaces > 0) {
                const faceProp = Object.values(header.properties).find(p => p.isList);
                if (faceProp) {
                    for (let i = 0; i < header.numFaces; i++) {
                        validateOffset(this.propertySizes.get(faceProp.countType));
                        const vertexCount = this.readProperty(dataView, offset, faceProp.countType, littleEndian);
                        offset += this.propertySizes.get(faceProp.countType);

                        if (vertexCount >= 3) {
                            const indices = [];
                            for (let j = 0; j < vertexCount; j++) {
                                validateOffset(this.propertySizes.get(faceProp.type));
                                const index = this.readProperty(dataView, offset, faceProp.type, littleEndian);
                                indices.push(index);
                                offset += this.propertySizes.get(faceProp.type);
                            }

                            // Triangulate face
                            for (let j = 1; j < vertexCount - 1; j++) {
                                result.faces.push(indices[0], indices[j], indices[j + 1]);
                            }
                        }
                    }
                }
            }

        } catch (error) {
            console.error('Error parsing binary data:', error);
            console.error('At offset:', offset);
            throw error;
        }
    }

    // Update readProperty to handle endianness consistently
    readProperty(dataView, offset, type, littleEndian = true) {
        try {
            switch (type) {
                case 'float': return dataView.getFloat32(offset, littleEndian);
                case 'double': return dataView.getFloat64(offset, littleEndian);
                case 'int': return dataView.getInt32(offset, littleEndian);
                case 'uint': return dataView.getUint32(offset, littleEndian);
                case 'short': return dataView.getInt16(offset, littleEndian);
                case 'ushort': return dataView.getUint16(offset, littleEndian);
                case 'uchar': return dataView.getUint8(offset);
                case 'char': return dataView.getInt8(offset);
                default: return 0;
            }
        } catch (error) {
            throw new Error(`Error reading ${type} at offset ${offset}: ${error.message}`);
        }
    }

    bindAttributes() {
        const gl = this.gl;
        gl.useProgram(this.program);

        // Bind position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

        // Bind normal attribute
        if (this.attributes.normal !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
            gl.enableVertexAttribArray(this.attributes.normal);
            gl.vertexAttribPointer(this.attributes.normal, 3, gl.FLOAT, false, 0, 0);
        }

        // Bind color attribute
        if (this.attributes.color !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
            gl.enableVertexAttribArray(this.attributes.color);
            gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);
        }

        // Bind curvature attribute
        if (this.attributes.curvature !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.curvature);
            gl.enableVertexAttribArray(this.attributes.curvature);
            gl.vertexAttribPointer(this.attributes.curvature, 1, gl.FLOAT, false, 0, 0);
        }
    }

    drawPoints(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;

        if (!this.program || !this.uniforms || !this.attributes || !this.originalVertices) {
            return;
        }

        try {
            gl.useProgram(this.program);

            // Set uniforms
            gl.uniformMatrix4fv(this.uniforms.projection, false, projectionMatrix);
            gl.uniformMatrix4fv(this.uniforms.modelView, false, modelViewMatrix);
            gl.uniform1f(this.uniforms.pointSize, this.pointSize);
            gl.uniform1i(this.uniforms.viewMode, this.viewMode);
            gl.uniform1f(this.uniforms.nearPlane, 0.1);
            gl.uniform1f(this.uniforms.farPlane, 10.0);

            // Update frustum and get visible points
            if (!this.frustum) {
                this.frustum = new Frustum();
            }
            this.frustum.update(projectionMatrix, modelViewMatrix);

            // In drawPoints where we handle visible points
            if (this.octree && this.useOctree) {
                const cameraPosition = [
                    -modelViewMatrix[12],
                    -modelViewMatrix[13],
                    -modelViewMatrix[14]
                ];
                const visiblePoints = this.octree.queryFrustum(this.frustum, cameraPosition);

                if (visiblePoints.length > 0) {
                    const positions = new Float32Array(visiblePoints.length * 3);
                    const colors = new Float32Array(visiblePoints.length * 3);

                    visiblePoints.forEach((point, i) => {
                        // Position
                        positions[i * 3] = point.x;
                        positions[i * 3 + 1] = point.y;
                        positions[i * 3 + 2] = point.z;

                        // Color - get from original color buffer or use default white
                        if (this.originalColors) {
                            const originalIndex = point.index * 3;
                            colors[i * 3] = this.originalColors[originalIndex];
                            colors[i * 3 + 1] = this.originalColors[originalIndex + 1];
                            colors[i * 3 + 2] = this.originalColors[originalIndex + 2];
                        } else {
                            // Default white color if no colors are present
                            colors[i * 3] = 1.0;
                            colors[i * 3 + 1] = 1.0;
                            colors[i * 3 + 2] = 1.0;
                        }
                    });

                    // Update position buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
                    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
                    gl.enableVertexAttribArray(this.attributes.position);
                    gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

                    // Update color buffer
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
                    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
                    gl.enableVertexAttribArray(this.attributes.color);
                    gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);

                    // Draw the points
                    gl.drawArrays(gl.POINTS, 0, visiblePoints.length);

                    // Draw octree debug visualization if enabled
                    if (this.showOctreeDebug) {
                        this.drawOctreeDebug(projectionMatrix, modelViewMatrix);
                    }
                }
            } else {
                // When octree is disabled, use original buffers
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
                gl.bufferData(gl.ARRAY_BUFFER, this.originalVertices, gl.DYNAMIC_DRAW);
                gl.enableVertexAttribArray(this.attributes.position);
                gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

                if (this.attributes.color !== -1) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
                    gl.bufferData(gl.ARRAY_BUFFER, this.originalColors || new Float32Array(this.originalVertices.length).fill(1.0), gl.DYNAMIC_DRAW);
                    gl.enableVertexAttribArray(this.attributes.color);
                    gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);
                }

                gl.drawArrays(gl.POINTS, 0, this.vertexCount);
            }

            // Draw octree debug visualization if enabled
            if (this.showOctreeDebug && this.octree) {
                this.drawOctreeDebug(projectionMatrix, modelViewMatrix);
            }

        } catch (error) {
            console.error('Error in drawPoints:', error);
        } finally {
            // Cleanup
            gl.disableVertexAttribArray(this.attributes.position);
            if (this.attributes.normal !== -1) gl.disableVertexAttribArray(this.attributes.normal);
            if (this.attributes.color !== -1) gl.disableVertexAttribArray(this.attributes.color);
            if (this.attributes.curvature !== -1) gl.disableVertexAttribArray(this.attributes.curvature);
        }
    }

    bindMeshAttributes() {
        const gl = this.gl;

        // Position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.enableVertexAttribArray(this.meshAttributes.position);
        gl.vertexAttribPointer(this.meshAttributes.position, 3, gl.FLOAT, false, 0, 0);

        // Normal attribute
        if (this.meshAttributes.normal !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
            gl.enableVertexAttribArray(this.meshAttributes.normal);
            gl.vertexAttribPointer(this.meshAttributes.normal, 3, gl.FLOAT, false, 0, 0);
        }

        // Color attribute
        if (this.meshAttributes.color !== -1) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
            gl.enableVertexAttribArray(this.meshAttributes.color);
            gl.vertexAttribPointer(this.meshAttributes.color, 3, gl.FLOAT, false, 0, 0);
        }

        // Texture coordinate attribute
        if (this.meshAttributes.texCoord !== -1 && this.buffers.texCoords) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.texCoords);
            gl.enableVertexAttribArray(this.meshAttributes.texCoord);
            gl.vertexAttribPointer(this.meshAttributes.texCoord, 2, gl.FLOAT, false, 0, 0);
        }
    }

    drawMesh(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;

        gl.useProgram(this.meshProgram);

        // Calculate normal matrix
        const normalMatrix = mat4.create();
        mat4.invert(normalMatrix, modelViewMatrix);
        mat4.transpose(normalMatrix, normalMatrix);

        // Set uniforms
        gl.uniformMatrix4fv(this.meshUniforms.projection, false, projectionMatrix);
        gl.uniformMatrix4fv(this.meshUniforms.modelView, false, modelViewMatrix);
        gl.uniformMatrix4fv(this.meshUniforms.normalMatrix, false, normalMatrix);
        gl.uniform1i(this.meshUniforms.viewMode, this.viewMode);
        gl.uniform1i(this.meshUniforms.wireframe, this.wireframe);
        gl.uniform1f(this.meshUniforms.nearPlane, 0.1);
        gl.uniform1f(this.meshUniforms.farPlane, 1000.0);

        // Bind attributes
        this.bindMeshAttributes();

        // Bind index buffer
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);

        // Choose index type based on extension support and vertex count
        const indexType = this.uint32Indices ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

        if (this.wireframe) {
            // Draw wireframe
            for (let i = 0; i < this.indexCount; i += 3) {
                gl.drawElements(gl.LINE_LOOP, 3, indexType, i * (indexType === gl.UNSIGNED_INT ? 4 : 2));
            }
        } else {
            // Draw triangles
            gl.drawElements(gl.TRIANGLES, this.indexCount, indexType, 0);
        }

        // Cleanup
        gl.disableVertexAttribArray(this.meshAttributes.position);
        gl.disableVertexAttribArray(this.meshAttributes.normal);
        gl.disableVertexAttribArray(this.meshAttributes.color);
        if (this.meshAttributes.texCoord !== -1) {
            gl.disableVertexAttribArray(this.meshAttributes.texCoord);
        }
    }

    async loadPLY(filePath) {
        try {
            console.log('Starting PLY file load from:', filePath);
            const response = await fetch(filePath);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const buffer = await response.arrayBuffer();
            console.log('Received PLY data, size:', buffer.byteLength);

            const data = await this.modelLoader.loadFile(buffer, 'ply');
            console.log('Parsed PLY data:', {
                vertexCount: data?.vertices?.length / 3,
                hasNormals: !!data?.normals,
                hasColors: !!data?.colors,
                hasScales: !!data?.scales,
                hasRotations: !!data?.rotations,
                bounds: data?.bounds
            });

            if (!data || !data.vertices || data.vertices.length === 0) {
                throw new Error('No valid vertex data found in PLY file');
            }

            // Convert data to typed arrays if needed
            const vertices = data.vertices instanceof Float32Array ?
                data.vertices : new Float32Array(data.vertices);

            const normals = data.normals instanceof Float32Array ?
                data.normals : data.normals ? new Float32Array(data.normals) : null;

            const colors = data.colors instanceof Float32Array ?
                data.colors : data.colors ? new Float32Array(data.colors) : null;

            const scales = data.scales instanceof Float32Array ?
                data.scales : data.scales ? new Float32Array(data.scales) : null;

            const rotations = data.rotations instanceof Float32Array ?
                data.rotations : data.rotations ? new Float32Array(data.rotations) : null;

            // Update buffers with the processed data
            this.updateBuffers({
                vertices: vertices,
                normals: normals,
                colors: colors,
                scales: scales,
                rotations: rotations
            });

            // Calculate bounds for camera positioning
            this.calculateBounds(vertices);
            this.vertexCount = vertices.length / 3;

            console.log('Successfully loaded PLY with:', {
                vertices: this.vertexCount,
                bounds: this.bounds,
                bufferSizes: {
                    vertices: vertices.length,
                    normals: normals?.length || 0,
                    colors: colors?.length || 0,
                    scales: scales?.length || 0,
                    rotations: rotations?.length || 0
                }
            });

            // Dispatch success event
            window.dispatchEvent(new CustomEvent('modelLoaded', {
                detail: {
                    type: 'ply',
                    vertexCount: this.vertexCount,
                    bounds: this.bounds
                }
            }));

            return true;
        } catch (error) {
            console.error('Error loading PLY:', error);
            console.error('Stack trace:', error.stack);
            throw error;
        }
    }

    async loadPLYFromText(plyText) {
        try {
            const data = await this.modelLoader.loadFile(plyText, 'ply');
            this.updateBuffers(data);
            this.calculateBounds(data.vertices);
            this.vertexCount = data.vertices.length / 3;
            console.log(`Loaded PLY data with ${this.vertexCount} points`);

            // Emit modelLoaded event
            window.dispatchEvent(new CustomEvent('modelLoaded', {
                detail: {
                    type: 'ply',
                    vertexCount: this.vertexCount,
                    bounds: this.bounds
                }
            }));
        } catch (error) {
            console.error('Error loading PLY from text:', error);
            throw error;
        }
    }

    async loadModel(fileData, fileType) {
        try {
            console.log(`Loading ${fileType.toUpperCase()} model...`);

            let data;
            if (fileData instanceof ArrayBuffer) {
                data = await this.modelLoader.loadFile(fileData, fileType);
            } else if (typeof fileData === 'string') {
                if (fileData.startsWith('http') || fileData.startsWith('/')) {
                    const response = await fetch(fileData);
                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }
                    const buffer = await response.arrayBuffer();
                    data = await this.modelLoader.loadFile(buffer, fileType);
                } else {
                    data = await this.modelLoader.loadFile(fileData, fileType);
                }
            } else {
                throw new Error('Unsupported file data format');
            }

            if (!data || !data.vertices || data.vertices.length === 0) {
                throw new Error('No vertex data found in model');
            }

            // Update buffers and calculate bounds
            this.updateBuffers(data);
            this.calculateBounds(data.vertices);

            console.log(`Loaded ${fileType.toUpperCase()} model with ${this.vertexCount} vertices`);

            // Emit modelLoaded event
            window.dispatchEvent(new CustomEvent('modelLoaded', {
                detail: {
                    type: fileType,
                    vertexCount: this.vertexCount,
                    bounds: this.bounds
                }
            }));

            return true;
        } catch (error) {
            console.error('Error processing file:', error);
            throw error;
        }
    }

    draw(projectionMatrix, modelViewMatrix) {
        if (this.renderMode === 'points') {
            this.drawPoints(projectionMatrix, modelViewMatrix);
        } else if (this.renderMode === 'splat') {
            this.drawSplats(projectionMatrix, modelViewMatrix);
        } else {
            this.drawMesh(projectionMatrix, modelViewMatrix);
        }
    }

    setRenderMode(mode) {
        this.renderMode = mode;
    }

    setWireframe(enabled) {
        this.wireframe = enabled;
    }


    // Updated camera position calculation
    getCameraPositionFromBounds() {
        const center = {
            x: (this.bounds.max.x + this.bounds.min.x) / 2,
            y: (this.bounds.max.y + this.bounds.min.y) / 2,
            z: (this.bounds.max.z + this.bounds.min.z) / 2
        };

        // Calculate model size
        const sizeX = this.bounds.max.x - this.bounds.min.x;
        const sizeY = this.bounds.max.y - this.bounds.min.y;
        const sizeZ = this.bounds.max.z - this.bounds.min.z;

        // Get the largest dimension
        const maxSize = Math.max(sizeX, sizeY, sizeZ);

        // Position camera based on model size
        const distance = maxSize * 2; // Adjust this multiplier to change camera distance
        const elevation = maxSize * 0.5; // Adjust for camera height

        return {
            position: [
                center.x,  // Camera X at center
                center.y + elevation,  // Camera Y above model
                center.z + distance    // Camera Z behind model
            ],
            target: [center.x, center.y, center.z],  // Look at center
            up: [0, 1, 0]  // Y-up orientation
        };
    }

    calculateBounds(vertices) {
        // Reset bounds
        this.bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const y = vertices[i + 1];
            const z = vertices[i + 2];

            // Update minimum bounds
            this.bounds.min.x = Math.min(this.bounds.min.x, x);
            this.bounds.min.y = Math.min(this.bounds.min.y, y);
            this.bounds.min.z = Math.min(this.bounds.min.z, z);

            // Update maximum bounds
            this.bounds.max.x = Math.max(this.bounds.max.x, x);
            this.bounds.max.y = Math.max(this.bounds.max.y, y);
            this.bounds.max.z = Math.max(this.bounds.max.z, z);
        }

        console.log('Calculated bounds:', this.bounds);
    }

    cleanup() {
        const gl = this.gl;

        // Delete point shader program resources
        if (this.program) {
            const shaders = gl.getAttachedShaders(this.program);
            shaders?.forEach(shader => gl.deleteShader(shader));
            gl.deleteProgram(this.program);
        }

        // Delete mesh shader program resources
        if (this.meshProgram) {
            const shaders = gl.getAttachedShaders(this.meshProgram);
            shaders?.forEach(shader => gl.deleteShader(shader));
            gl.deleteProgram(this.meshProgram);
        }

        // Delete buffers
        Object.values(this.buffers).forEach(buffer => {
            if (buffer) gl.deleteBuffer(buffer);
        });
    }

    drawOctreeNode(node) {
        if (!node) {
            console.warn('Attempted to draw null node');
            return;
        }

        /*console.log('Drawing octree node:', {
            center: node.center,
            size: node.size,
            points: node.points.length,
            hasChildren: !!node.children
        });*/

        // Draw current node bounds
        this.drawBoundingBox(node.getBounds());

        // Recursively draw children
        if (node.children) {
            for (const child of node.children) {
                this.drawOctreeNode(child);
            }
        }
    }

    drawOctreeDebug(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;
        if (!this.debugProgram || !this.debugBuffer) {
            console.warn('Debug program not initialized');
            return;
        }

        // Store original program and GL state
        const originalProgram = gl.getParameter(gl.CURRENT_PROGRAM);

        // Use debug shader program
        gl.useProgram(this.debugProgram);

        // Enable vertex attributes for debug drawing
        gl.enableVertexAttribArray(this.debugAttribs.position);

        // Set debug shader uniforms
        gl.uniformMatrix4fv(this.debugUniforms.projection, false, projectionMatrix);
        gl.uniformMatrix4fv(this.debugUniforms.modelView, false, modelViewMatrix);

        // Enable blending for transparent boxes
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        // Draw octree nodes recursively
        if (this.octree) {
            this.drawOctreeNode(this.octree);  // Call the method as a member function
        }

        // Cleanup
        gl.disable(gl.BLEND);
        gl.disableVertexAttribArray(this.debugAttribs.position);

        // Restore original program
        gl.useProgram(originalProgram);
    }

    drawBoundingBox(bounds) {
        const gl = this.gl;

        // Generate line segments for box edges
        const vertices = [];

        // Front face
        vertices.push(bounds.min.x, bounds.min.y, bounds.min.z);
        vertices.push(bounds.max.x, bounds.min.y, bounds.min.z);

        vertices.push(bounds.max.x, bounds.min.y, bounds.min.z);
        vertices.push(bounds.max.x, bounds.max.y, bounds.min.z);

        vertices.push(bounds.max.x, bounds.max.y, bounds.min.z);
        vertices.push(bounds.min.x, bounds.max.y, bounds.min.z);

        vertices.push(bounds.min.x, bounds.max.y, bounds.min.z);
        vertices.push(bounds.min.x, bounds.min.y, bounds.min.z);

        // Back face
        vertices.push(bounds.min.x, bounds.min.y, bounds.max.z);
        vertices.push(bounds.max.x, bounds.min.y, bounds.max.z);

        vertices.push(bounds.max.x, bounds.min.y, bounds.max.z);
        vertices.push(bounds.max.x, bounds.max.y, bounds.max.z);

        vertices.push(bounds.max.x, bounds.max.y, bounds.max.z);
        vertices.push(bounds.min.x, bounds.max.y, bounds.max.z);

        vertices.push(bounds.min.x, bounds.max.y, bounds.max.z);
        vertices.push(bounds.min.x, bounds.min.y, bounds.max.z);

        // Connecting edges
        vertices.push(bounds.min.x, bounds.min.y, bounds.min.z);
        vertices.push(bounds.min.x, bounds.min.y, bounds.max.z);

        vertices.push(bounds.max.x, bounds.min.y, bounds.min.z);
        vertices.push(bounds.max.x, bounds.min.y, bounds.max.z);

        vertices.push(bounds.max.x, bounds.max.y, bounds.min.z);
        vertices.push(bounds.max.x, bounds.max.y, bounds.max.z);

        vertices.push(bounds.min.x, bounds.max.y, bounds.min.z);
        vertices.push(bounds.min.x, bounds.max.y, bounds.max.z);

        // Update debug buffer and draw
        gl.bindBuffer(gl.ARRAY_BUFFER, this.debugBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(this.debugAttribs.position, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, vertices.length / 3);
    }

    drawSplats(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        if (!this.splatProgram || !this.splatUniforms || !this.splatAttributes) {
            return;
        }

        try {
            gl.useProgram(this.splatProgram);

            // Calculate normal matrix
            const normalMatrix = mat4.create();
            mat4.invert(normalMatrix, modelViewMatrix);
            mat4.transpose(normalMatrix, normalMatrix);

            // Set uniforms
            gl.uniformMatrix4fv(this.splatUniforms.projection, false, projectionMatrix);
            gl.uniformMatrix4fv(this.splatUniforms.modelView, false, modelViewMatrix);
            gl.uniform1i(this.splatUniforms.viewMode, this.viewMode);

            // Bind attributes
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
            gl.enableVertexAttribArray(this.splatAttributes.position);
            gl.vertexAttribPointer(this.splatAttributes.position, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
            gl.enableVertexAttribArray(this.splatAttributes.color);
            gl.vertexAttribPointer(this.splatAttributes.color, 4, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.scale);
            gl.enableVertexAttribArray(this.splatAttributes.scale);
            gl.vertexAttribPointer(this.splatAttributes.scale, 3, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.rotation);
            gl.enableVertexAttribArray(this.splatAttributes.rotation);
            gl.vertexAttribPointer(this.splatAttributes.rotation, 4, gl.FLOAT, false, 0, 0);

            // Draw splats
            gl.drawArrays(gl.POINTS, 0, this.vertexCount);
        } catch (error) {
            console.error('Error in drawSplats:', error);
        } finally {
            // Cleanup
            gl.disableVertexAttribArray(this.splatAttributes.position);
            gl.disableVertexAttribArray(this.splatAttributes.normal);
            gl.disableVertexAttribArray(this.splatAttributes.color);
            gl.disableVertexAttribArray(this.splatAttributes.scale);
            gl.disableVertexAttribArray(this.splatAttributes.rotation);
        }
    }

}

