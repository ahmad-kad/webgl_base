export class ModelLoader {
    constructor() {
        this.supportedFormats = ['ply', 'obj', 'fbx'];
        this.plyLoader = new PLYLoader();
    }

    async loadFile(fileData, fileType) {
        console.log(`Loading ${fileType?.toUpperCase()} file...`);
        
        try {
            // Convert URL/path to appropriate format
            if (typeof fileData === 'string' && (fileData.startsWith('http') || fileData.startsWith('/'))) {
                const response = await fetch(fileData);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                if (fileType?.toLowerCase() === 'ply') {
                    const headerText = await response.clone().text();
                    const isBinary = this.isPlyBinary(headerText);
                    fileData = isBinary ? await response.arrayBuffer() : await response.text();
                } else {
                    fileData = await response.text();
                }
            }

            // Parse based on file type
            switch (fileType?.toLowerCase()) {
                case 'ply':
                    return await this.plyLoader.loadPLY(fileData);
                case 'obj':
                    return await this.parseOBJ(fileData);
                case 'fbx':
                    return this.parseFBX(fileData);
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
    }

    async loadPLY(fileData) {
        let buffer;
        if (fileData instanceof ArrayBuffer) {
            buffer = fileData;
        } else if (typeof fileData === 'string') {
            // Check if it's ASCII or binary format
            const isBinary = fileData.includes('format binary');
            if (isBinary) {
                const encoder = new TextEncoder();
                buffer = encoder.encode(fileData).buffer;
            } else {
                buffer = new TextEncoder().encode(fileData).buffer;
            }
        } else {
            throw new Error('Invalid PLY data format');
        }

        const dataView = new DataView(buffer);
        const header = this.parsePLYHeader(dataView);
        console.log('PLY Header:', header);

        const result = {
            vertices: [],
            normals: [],
            colors: [],
            faces: [],
            vertexCount: header.numVertices
        };

        try {
            if (header.format === 'ascii') {
                await this.parseASCIIData(header, buffer, result);
            } else {
                await this.parseBinaryData(header, dataView, result);
            }
        } catch (error) {
            console.error('Error parsing PLY data:', error);
            throw error;
        }

        return this.convertToTypedArrays(result);
    }

    parsePLYHeader(dataView) {
            const decoder = new TextDecoder();
            let offset = 0;
            const header = {
                format: '',
                version: '',
                numVertices: 0,
                numFaces: 0,
                vertexProperties: [],
                faceProperties: [],
                startOffset: 0,
                littleEndian: true,
                comments: []
            };

            // Read header line by line
            while (offset < dataView.byteLength) {
                let line = '';
                while (offset < dataView.byteLength) {
                    const byte = dataView.getUint8(offset++);
                    if (byte === 10) break; // newline
                    line += String.fromCharCode(byte);
                }

                line = line.trim();
                if (line === 'end_header') {
                    header.startOffset = offset;
                    break;
                }

                if (line === '' || line.startsWith('comment')) {
                    header.comments.push(line);
                    continue;
                }

                const parts = line.split(/\s+/);
                
                switch(parts[0]) {
                    case 'format':
                        header.format = parts[1];
                        header.version = parts[2];
                        header.littleEndian = parts[1].includes('little_endian');
                        break;

                    case 'element':
                        if (parts[1] === 'vertex') {
                            header.numVertices = parseInt(parts[2]);
                        } else if (parts[1] === 'face') {
                            header.numFaces = parseInt(parts[2]);
                        }
                        break;

                    case 'property':
                        if (parts[1] === 'list') {
                            header.faceProperties.push({
                                name: parts[4],
                                countType: parts[2],
                                valueType: parts[3],
                                isList: true
                            });
                        } else {
                            const property = {
                                name: parts[2],
                                type: parts[1],
                                offset: this.propertySizes.get(parts[1]) || 4
                            };
                            header.vertexProperties.push(property);
                        }
                        break;
                }
            }

            // Validate header
            if (!header.format) {
                throw new Error('PLY file format not specified in header');
            }

            if (header.numVertices <= 0) {
                throw new Error('Invalid number of vertices specified in PLY header');
            }

            const hasPosition = header.vertexProperties.some(p => ['x', 'y', 'z'].includes(p.name));
            if (!hasPosition) {
        throw new Error('PLY file missing vertex position properties');
        }

        return header;
    }

    async parseASCIIData(header, buffer, result) {
        const text = new TextDecoder().decode(buffer);
        const lines = text.split('\n');
        let currentLine = 0;

        // Skip header
        while (currentLine < lines.length) {
            const line = lines[currentLine].trim();
            if (line === 'end_header') break;
            currentLine++;
        }
        currentLine++; // Skip 'end_header' line

        // Skip empty lines and comments
        const isSkippableLine = (line) => {
            const trimmed = line.trim();
            return trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('comment');
        };

        // Read vertices
        for (let i = 0; i < header.numVertices; i++) {
            while (currentLine < lines.length && isSkippableLine(lines[currentLine])) {
                currentLine++;
            }
            
            if (currentLine >= lines.length) {
                throw new Error('Unexpected end of file while reading vertices');
            }
            
            const values = lines[currentLine++].trim().split(/\s+/).map(Number);
            let valueIndex = 0;

            for (const prop of header.vertexProperties) {
                const value = values[valueIndex++];
                
                if (Number.isNaN(value)) {
                    console.warn(`Invalid value for property ${prop.name} at vertex ${i}`);
                    continue;
                }

                switch(prop.name) {
                    case 'x':
                    case 'y':
                    case 'z':
                        result.vertices.push(value);
                        break;
                    case 'nx':
                    case 'ny':
                    case 'nz':
                        result.normals.push(value);
                        break;
                    case 'red':
                    case 'green':
                    case 'blue':
                        result.colors.push(value / 255);
                        break;
                }
            }
        }


        // Read faces
        for (let i = 0; i < header.numFaces; i++) {
            while (currentLine < lines.length && isSkippableLine(lines[currentLine])) {
                currentLine++;
            }
            
            if (currentLine >= lines.length) {
                throw new Error('Unexpected end of file while reading faces');
            }

            const values = lines[currentLine++].trim().split(/\s+/).map(Number);
            const numVertices = values[0];
            
            if (numVertices < 3) {
                console.warn(`Skipping invalid face with ${numVertices} vertices`);
                continue;
            }
            
            // Triangulate face if necessary
            if (numVertices === 3) {
                const v1 = values[1] < 0 ? header.numVertices + values[1] : values[1];
                const v2 = values[2] < 0 ? header.numVertices + values[2] : values[2];
                const v3 = values[3] < 0 ? header.numVertices + values[3] : values[3];
                
                if (this.isValidFaceIndices([v1, v2, v3], header.numVertices)) {
                    result.faces.push(v1, v2, v3);
                }
            } else {
                // Fan triangulation for convex polygons
                for (let j = 2; j < numVertices; j++) {
                    const v1 = values[1] < 0 ? header.numVertices + values[1] : values[1];
                    const v2 = values[j] < 0 ? header.numVertices + values[j] : values[j];
                    const v3 = values[j + 1] < 0 ? header.numVertices + values[j + 1] : values[j + 1];
                    
                    if (this.isValidFaceIndices([v1, v2, v3], header.numVertices)) {
                        result.faces.push(v1, v2, v3);
                    }
                }
            }
        }
    }

    async parseBinaryData(header, dataView, result) {
        let offset = header.startOffset;
        const littleEndian = header.littleEndian;
        const dataLength = dataView.byteLength;
    
        // Helper function to check if we have enough bytes left
        const hasEnoughBytes = (needed) => (offset + needed) <= dataLength;
    
        // Read vertices
        for (let i = 0; i < header.numVertices; i++) {
            let vertexOffset = {};
    
            // Calculate total bytes needed for this vertex
            const bytesNeeded = header.vertexProperties.reduce((sum, prop) => 
                sum + this.propertySizes.get(prop.type), 0);
    
            if (!hasEnoughBytes(bytesNeeded)) {
                console.error(`Buffer overflow reading vertex ${i}: needed ${bytesNeeded} bytes, had ${dataLength - offset}`);
                break;
            }
    
            for (const prop of header.vertexProperties) {
                try {
                    const propSize = this.propertySizes.get(prop.type);
                    if (!hasEnoughBytes(propSize)) {
                        throw new Error(`Buffer overflow reading property ${prop.name}`);
                    }
    
                    const value = this.readPropertyValue(dataView, offset, prop.type, littleEndian);
                    offset += propSize;
    
                    if (value !== null) {
                        vertexOffset[prop.name] = value;
                    }
                } catch (error) {
                    console.warn(`Skipping property ${prop.name} for vertex ${i}:`, error);
                    offset += this.propertySizes.get(prop.type);
                    continue;
                }
            }
    
            // Add properties in correct order
            if ('x' in vertexOffset && 'y' in vertexOffset && 'z' in vertexOffset) {
                result.vertices.push(vertexOffset.x, vertexOffset.y, vertexOffset.z);
    
                // Only add normals if we have all components
                if ('nx' in vertexOffset && 'ny' in vertexOffset && 'nz' in vertexOffset) {
                    result.normals.push(vertexOffset.nx, vertexOffset.ny, vertexOffset.nz);
                }
    
                // Only add colors if we have all components
                if ('red' in vertexOffset && 'green' in vertexOffset && 'blue' in vertexOffset) {
                    result.colors.push(
                        vertexOffset.red / 255,
                        vertexOffset.green / 255,
                        vertexOffset.blue / 255
                    );
                }
            }
        }
    
        // Read faces
        for (let i = 0; i < header.numFaces; i++) {
            try {
                // Check if we have enough bytes for the count
                const countSize = this.propertySizes.get(header.faceProperties[0].countType);
                if (!hasEnoughBytes(countSize)) {
                    console.error(`Buffer overflow reading face count at face ${i}`);
                    break;
                }
    
                const numVertices = this.readPropertyValue(
                    dataView, 
                    offset, 
                    header.faceProperties[0].countType, 
                    littleEndian
                );
                offset += countSize;
    
                // Validate number of vertices
                if (numVertices < 3 || numVertices > 1000) { // Add reasonable max limit
                    console.warn(`Invalid vertex count ${numVertices} for face ${i}`);
                    continue;
                }
    
                // Check if we have enough bytes for all indices
                const valueSize = this.propertySizes.get(header.faceProperties[0].valueType);
                const indicesSize = numVertices * valueSize;
                if (!hasEnoughBytes(indicesSize)) {
                    console.error(`Buffer overflow reading face indices at face ${i}`);
                    break;
                }
    
                const indices = [];
                for (let j = 0; j < numVertices; j++) {
                    const index = this.readPropertyValue(
                        dataView,
                        offset,
                        header.faceProperties[0].valueType,
                        littleEndian
                    );
                    
                    // Validate index
                    if (index !== null && index >= 0 && index < header.numVertices) {
                        indices.push(index);
                    }
                    offset += valueSize;
                }
    
                // Only process face if we got all valid indices
                if (indices.length === numVertices && indices.length >= 3) {
                    if (indices.length === 3) {
                        result.faces.push(indices[0], indices[1], indices[2]);
                    } else {
                        // Fan triangulation
                        for (let j = 1; j < indices.length - 1; j++) {
                            result.faces.push(indices[0], indices[j], indices[j + 1]);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error reading face ${i}:`, error);
                break;
            }
        }
    
        if (result.vertices.length === 0) {
            throw new Error('No valid vertices found in PLY file');
        }
    
        return result;
    }
    
    readPropertyValue(dataView, offset, type, littleEndian) {
        try {
            if (offset < 0 || offset >= dataView.byteLength) {
                console.warn(`Invalid offset ${offset} for data view of length ${dataView.byteLength}`);
                return null;
            }
    
            const value = this._readValue(dataView, offset, type, littleEndian);
            if (!Number.isFinite(value)) {
                console.warn(`Invalid ${type} value at offset ${offset}`);
                return null;
            }
            return value;
        } catch (error) {
            console.warn(`Error reading property value at offset ${offset}:`, error);
            return null;
        }
    }    

    _readValue(dataView, offset, type, littleEndian) {
        switch (type) {
            case 'char': return dataView.getInt8(offset);
            case 'uchar': return dataView.getUint8(offset);
            case 'short': return dataView.getInt16(offset, littleEndian);
            case 'ushort': return dataView.getUint16(offset, littleEndian);
            case 'int': return dataView.getInt32(offset, littleEndian);
            case 'uint': return dataView.getUint32(offset, littleEndian);
            case 'float': return dataView.getFloat32(offset, littleEndian);
            case 'double': return dataView.getFloat64(offset, littleEndian);
            default: throw new Error(`Unsupported property type: ${type}`);
        }
    }

    isValidFaceIndices(indices, numVertices) {
        return indices.every(index => 
            Number.isInteger(index) && index >= 0 && index < numVertices);
    }

    convertToTypedArrays(result) {
        return {
            vertices: new Float32Array(result.vertices),
            normals: result.normals.length > 0 ? new Float32Array(result.normals) : null,
            colors: result.colors.length > 0 ? new Float32Array(result.colors) : null,
            faces: result.faces.length > 0 ? new Uint32Array(result.faces) : null,
            vertexCount: result.vertices.length / 3
        };
    }
    }