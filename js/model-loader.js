// Enhanced ModelLoader class with robust PLY and OBJ face support
export class ModelLoader {
    constructor() {
        this.supportedFormats = ['ply', 'obj', 'fbx'];
        this.fileExtensionRegex = /\.([0-9a-z]+)(?:[\?#]|$)/i;
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
                if (fileType?.toLowerCase() === 'ply' && this.isPlyBinary(fileData)) {
                    fileData = await response.arrayBuffer();
                } else {
                    fileData = await response.text();
                }
            }

            // Parse based on file type
            switch (fileType?.toLowerCase()) {
                case 'ply':
                    return await this.parsePLY(fileData);
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
        // Check first few bytes for PLY signature
        const header = data.slice(0, 1000); // Read first 1000 bytes
        const text = new TextDecoder().decode(header);
        const lines = text.split('\n');
        return lines.some(line => line.includes('format binary'));
    }

    async parsePLY(data) {
        try {
            let arrayBuffer;
            if (data instanceof ArrayBuffer) {
                arrayBuffer = data;
            } else if (typeof data === 'string') {
                // Convert string data to ArrayBuffer
                const encoder = new TextEncoder();
                arrayBuffer = encoder.encode(data).buffer;
            } else {
                throw new Error('Invalid PLY data format');
            }

            const dataView = new DataView(arrayBuffer);
            let offset = 0;

            // Parse header
            const headerInfo = this.parsePLYHeader(dataView, offset);
            offset = headerInfo.offset;

            // Parse data based on format
            let result;
            if (headerInfo.format === "ascii") {
                const text = new TextDecoder().decode(arrayBuffer);
                const lines = text.split(/\r\n|\r|\n/);
                result = this.parseAsciiPLYData(lines, headerInfo);
            } else {
                result = this.parseBinaryPLYData(dataView, offset, headerInfo);
            }

            return this.convertToStandardFormat(result, headerInfo);
        } catch (error) {
            console.error('Error parsing PLY:', error);
            throw error;
        }
    }

    parsePLYHeader(dataView, initialOffset) {
        const decoder = new TextDecoder();
        let offset = initialOffset;
        let headerText = '';
        
        const header = {
            format: '',
            elements: [],
            properties: new Map(),
            offset: 0,
            vertexCount: 0,
            faceCount: 0
        };

        while (true) {
            let line = '';
            while (offset < dataView.byteLength) {
                const byte = dataView.getUint8(offset++);
                if (byte === 10) break; // newline
                line += String.fromCharCode(byte);
            }
            
            line = line.trim();
            if (line === 'end_header') break;
            
            const parts = line.split(/\s+/);
            
            switch(parts[0]) {
                case 'format':
                    header.format = parts[1];
                    header.version = parts[2];
                    break;
                    
                case 'element':
                    const element = {
                        name: parts[1],
                        count: parseInt(parts[2]),
                        properties: []
                    };
                    header.elements.push(element);
                    
                    if (parts[1] === 'vertex') header.vertexCount = element.count;
                    if (parts[1] === 'face') header.faceCount = element.count;
                    break;
                    
                case 'property':
                    if (!header.elements.length) break;
                    
                    const currentElement = header.elements[header.elements.length - 1];
                    
                    if (parts[1] === 'list') {
                        currentElement.properties.push({
                            type: 'list',
                            countType: parts[2],
                            valueType: parts[3],
                            name: parts[4]
                        });
                    } else {
                        currentElement.properties.push({
                            type: parts[1],
                            name: parts[2]
                        });
                    }
                    break;
            }
        }

        header.offset = offset;
        return header;
    }

    parseAsciiPLYData(lines, header) {
        const result = {
            vertices: [],
            normals: [],
            colors: [],
            faces: [],
            textureCoords: []
        };

        let currentElement = null;
        let elementIndex = 0;
        let elementCount = 0;

        for (let line of lines) {
            line = line.trim();
            if (!line || line === 'ply' || line.startsWith('format') || 
                line.startsWith('comment') || line.startsWith('element') ||
                line.startsWith('property') || line === 'end_header') {
                continue;
            }

            // Get current element if not set
            if (!currentElement && header.elements[elementIndex]) {
                currentElement = header.elements[elementIndex];
                elementCount = 0;
            }

            // Parse element data
            if (currentElement) {
                const values = line.split(/\s+/);
                
                if (currentElement.name === 'vertex') {
                    this.parseVertexData(values, currentElement.properties, result);
                } else if (currentElement.name === 'face') {
                    this.parseFaceData(values, currentElement.properties, result);
                }

                elementCount++;
                
                // Move to next element type if we've processed all of current type
                if (elementCount >= currentElement.count) {
                    elementIndex++;
                    currentElement = null;
                }
            }
        }

        return result;
    }

    parseBinaryPLYData(dataView, offset, header) {
        const result = {
            vertices: [],
            normals: [],
            colors: [],
            faces: [],
            textureCoords: []
        };

        const isLittleEndian = header.format === "binary_little_endian";

        for (const element of header.elements) {
            for (let i = 0; i < element.count; i++) {
                if (element.name === 'vertex') {
                    offset = this.parseVertexBinary(dataView, offset, element.properties, result, isLittleEndian);
                } else if (element.name === 'face') {
                    offset = this.parseFaceBinary(dataView, offset, element.properties, result, isLittleEndian);
                }
            }
        }

        return result;
    }

    parseVertexData(values, properties, result) {
        let vIndex = 0;
        
        properties.forEach((prop, index) => {
            const value = parseFloat(values[index]);
            
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
                    
                case 'u':
                case 'v':
                    result.textureCoords.push(value);
                    break;
            }
        });
    }

    parseFaceData(values, properties, result) {
        // Handle face property (usually a list)
        properties.forEach(prop => {
            if (prop.type === 'list') {
                const count = parseInt(values[0]);
                const indices = values.slice(1, count + 1).map(v => parseInt(v));
                
                // Triangulate if necessary (assuming convex polygons)
                for (let i = 1; i < count - 1; i++) {
                    result.faces.push(
                        indices[0],
                        indices[i],
                        indices[i + 1]
                    );
                }
            }
        });
    }

    parseVertexBinary(dataView, offset, properties, result, isLittleEndian) {
        properties.forEach(prop => {
            const value = this.readBinaryValue(dataView, offset, prop.type, isLittleEndian);
            offset += this.getPropertySize(prop.type);
            
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
                case 'u':
                case 'v':
                    result.textureCoords.push(value);
                    break;
            }
        });
        
        return offset;
    }

    parseFaceBinary(dataView, offset, properties, result, isLittleEndian) {
        properties.forEach(prop => {
            if (prop.type === 'list') {
                const count = this.readBinaryValue(dataView, offset, prop.countType, isLittleEndian);
                offset += this.getPropertySize(prop.countType);
                
                const indices = [];
                for (let i = 0; i < count; i++) {
                    indices.push(this.readBinaryValue(dataView, offset, prop.valueType, isLittleEndian));
                    offset += this.getPropertySize(prop.valueType);
                }
                
                // Triangulate if necessary
                for (let i = 1; i < count - 1; i++) {
                    result.faces.push(
                        indices[0],
                        indices[i],
                        indices[i + 1]
                    );
                }
            }
        });
        
        return offset;
    }

    readBinaryValue(dataView, offset, type, isLittleEndian) {
        switch (type) {
            case 'char': return dataView.getInt8(offset);
            case 'uchar': return dataView.getUint8(offset);
            case 'short': return dataView.getInt16(offset, isLittleEndian);
            case 'ushort': return dataView.getUint16(offset, isLittleEndian);
            case 'int': return dataView.getInt32(offset, isLittleEndian);
            case 'uint': return dataView.getUint32(offset, isLittleEndian);
            case 'float': return dataView.getFloat32(offset, isLittleEndian);
            case 'double': return dataView.getFloat64(offset, isLittleEndian);
            default: throw new Error(`Unsupported property type: ${type}`);
        }
    }

    getPropertySize(type) {
        switch (type) {
            case 'char': case 'uchar': return 1;
            case 'short': case 'ushort': return 2;
            case 'int': case 'uint': case 'float': return 4;
            case 'double': return 8;
            default: throw new Error(`Unknown property type: ${type}`);
        }
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
                            const indices = parts[i].split('/').map(idx => parseInt(idx) || 0);
                            
                            // OBJ indices are 1-based, convert to 0-based
                            const vertexIndex = (indices[0] - 1) * 3;
                            if (vertexIndex >= 0 && vertexIndex < temp.vertices.length) {
                                vertices.push(
                                    temp.vertices[vertexIndex],
                                    temp.vertices[vertexIndex + 1],
                                    temp.vertices[vertexIndex + 2]
                                );
                            }

                            // Handle texture coordinates if present
                            if (indices[1]) {
                                const texIndex = (indices[1] - 1) * 2;
                                if (texIndex >= 0 && texIndex < temp.textureCoords.length) {
                                    texCoords.push(
                                        temp.textureCoords[texIndex],
                                        temp.textureCoords[texIndex + 1]
                                    );
                                }
                            }

                            // Handle normals if present
                            if (indices[2]) {
                                const normalIndex = (indices[2] - 1) * 3;
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

    convertToStandardFormat(result, header) {
        return {
            vertices: new Float32Array(result.vertices),
            normals: result.normals.length > 0 ? new Float32Array(result.normals) : null,
            colors: result.colors.length > 0 ? new Float32Array(result.colors) : new Float32Array(result.vertices.length).fill(1.0),
            textureCoords: result.textureCoords.length > 0 ? new Float32Array(result.textureCoords) : null,
            faces: result.faces.length > 0 ? new Uint32Array(result.faces) : null,
            vertexCount: result.vertices.length / 3
        };
    }
}