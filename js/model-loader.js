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

class PLYLoader {
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
                colors: [],
                faces: [],
                vertexCount: 0
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
                colorCount: result.colors.length / 3,
                faceCount: result.faces.length / 3
            });
    
            if (result.vertices.length === 0) {
                throw new Error('No vertices found in PLY file');
            }
    
            return {
                vertices: new Float32Array(result.vertices),
                normals: result.normals.length > 0 ? new Float32Array(result.normals) : null,
                colors: result.colors.length > 0 ? new Float32Array(result.colors) : null,
                faces: result.faces.length > 0 ? new Uint32Array(result.faces) : null,
                vertexCount: result.vertices.length / 3
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
                const decoder = new TextDecoder();
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
                            header.properties[tokens[2]] = {
                                type: tokens[1],
                                offset: header.vertexSize
                            };
                            header.vertexSize += this.propertySizes.get(tokens[1]) || 0;
                        }
                        break;
                }
            }
    
            // Single log for header info
            console.log('PLY Header:', {
                format: header.format,
                vertices: header.numVertices,
                faces: header.numFaces,
                properties: Object.keys(header.properties).length
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
                // Read vertex properties
                for (const [propName, prop] of Object.entries(header.properties)) {
                    if (prop.isList) continue;  // Skip list properties when reading vertices
                    
                    if (offset + this.propertySizes.get(prop.type) > dataView.byteLength) {
                        throw new Error(`Buffer overflow at vertex ${i}, property ${propName}`);
                    }
    
                    const value = this.readProperty(dataView, offset, prop.type, littleEndian);
                    
                    // Store vertex coordinates
                    if (propName === 'x' || propName === 'y' || propName === 'z') {
                        result.vertices.push(value);
                    }
                    
                    offset += this.propertySizes.get(prop.type);
                }
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