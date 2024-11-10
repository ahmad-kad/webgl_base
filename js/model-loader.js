export class ModelLoader {
    constructor() {
        this.supportedFormats = ['ply', 'obj', 'fbx'];
        this.fileExtensionRegex = /\.([0-9a-z]+)(?:[\?#]|$)/i;
    }

    async loadFile(fileData, fileType) {
        console.log(`Loading ${fileType?.toUpperCase()} file...`);
        
        try {
            // Convert URL/path to ArrayBuffer for PLY files
            if (typeof fileData === 'string' && (fileData.startsWith('http') || fileData.startsWith('/'))) {
                const response = await fetch(fileData);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                if (fileType?.toLowerCase() === 'ply') {
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
                    return this.parseOBJ(fileData);
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
            offset = headerInfo.offset; // Move to start of data

            // Parse data based on format
            let result;
            if (headerInfo.format === "ascii") {
                const text = new TextDecoder().decode(arrayBuffer);
                const lines = text.split(/\r\n|\r|\n/);
                result = this.parseAsciiData(lines, headerInfo);
            } else if (headerInfo.format === "binary_little_endian") {
                result = this.parseBinaryData(dataView, offset, headerInfo, true);
            } else if (headerInfo.format === "binary_big_endian") {
                result = this.parseBinaryData(dataView, offset, headerInfo, false);
            } else {
                throw new Error("Unsupported PLY format: " + headerInfo.format);
            }

            // Convert to standard format
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
            vertexCount: 0,
            faceCount: 0,
            vertexProperties: [],
            hasNormals: false,
            hasColors: false,
            hasTexCoords: false,
            offset: 0
        };

        // Read header line by line
        while (true) {
            let line = '';
            while (true) {
                const byte = dataView.getUint8(offset++);
                if (byte === 10) break; // newline
                line += String.fromCharCode(byte);
            }
            line = line.trim();
            headerText += line + '\n';

            if (line === 'end_header') {
                break;
            }

            const parts = line.split(/\s+/);
            
            if (line.startsWith('format')) {
                header.format = parts[1];
            } else if (line.startsWith('element vertex')) {
                header.vertexCount = parseInt(parts[2]);
            } else if (line.startsWith('element face')) {
                header.faceCount = parseInt(parts[2]);
            } else if (line.startsWith('property')) {
                if (parts[1] === 'list') {
                    // Handle face property
                    header.vertexProperties.push({
                        type: 'list',
                        countType: parts[2],
                        valueType: parts[3],
                        name: parts[4]
                    });
                } else {
                    // Handle vertex property
                    const prop = {
                        type: parts[1],
                        name: parts[2]
                    };
                    header.vertexProperties.push(prop);

                    if (['nx', 'ny', 'nz'].includes(prop.name)) {
                        header.hasNormals = true;
                    }
                    if (['red', 'green', 'blue', 'r', 'g', 'b'].includes(prop.name)) {
                        header.hasColors = true;
                    }
                    if (['s', 't', 'u', 'v'].includes(prop.name)) {
                        header.hasTexCoords = true;
                    }
                }
            }
        }

        header.offset = offset;
        console.log("PLY Header info:", header);
        return header;
    }

    parseBinaryData(dataView, offset, header, isLittleEndian) {
        const vertices = [];
        const normals = header.hasNormals ? [] : null;
        const colors = header.hasColors ? [] : null;
        const texCoords = header.hasTexCoords ? [] : null;

        // Calculate stride - number of properties per vertex
        const vertexStride = header.vertexProperties.filter(prop => prop.type !== 'list').length;
        console.log("Vertex stride:", vertexStride);

        // Find indices of x, y, z coordinates in the property list
        const propIndices = {
            x: header.vertexProperties.findIndex(p => p.name === 'x'),
            y: header.vertexProperties.findIndex(p => p.name === 'y'),
            z: header.vertexProperties.findIndex(p => p.name === 'z')
        };

        console.log("Property indices:", propIndices);

        for (let i = 0; i < header.vertexCount; i++) {
            // Read all properties for this vertex
            const vertexData = [];
            for (const prop of header.vertexProperties) {
                if (prop.type !== 'list') {
                    vertexData.push(this.readBinaryValue(dataView, offset, prop.type, isLittleEndian));
                    offset += this.getPropertySize(prop.type);
                }
            }

            // Extract vertex coordinates using the correct indices
            vertices.push(
                vertexData[propIndices.x],
                vertexData[propIndices.y],
                vertexData[propIndices.z]
            );
        }

        return {
            vertices,
            normals,
            colors,
            texCoords
        };
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
            case 'list': return 0;
            default: throw new Error(`Unknown property type: ${type}`);
        }
    }

    parseAsciiData(lines, header) {
        const vertices = [];
        const normals = header.hasNormals ? [] : null;
        const colors = header.hasColors ? [] : null;
        let vertexCount = 0;
        let dataStarted = false;

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine === 'ply' || trimmedLine.startsWith('format') || 
                trimmedLine.startsWith('comment') || trimmedLine.startsWith('element') || 
                trimmedLine.startsWith('property')) {
                continue;
            }

            if (trimmedLine === 'end_header') {
                dataStarted = true;
                continue;
            }

            if (dataStarted && vertexCount < header.vertexCount) {
                const values = trimmedLine.split(/\s+/).map(Number);
                let valueIndex = 0;

                // Process each property
                for (const prop of header.vertexProperties) {
                    if (prop.type === 'list') continue;

                    const value = values[valueIndex++];
                    switch(prop.name) {
                        case 'x': case 'y': case 'z':
                            vertices.push(value);
                            break;
                        case 'nx': case 'ny': case 'nz':
                            normals?.push(value);
                            break;
                        case 'red': case 'r':
                            colors?.push(value / 255);
                            break;
                        case 'green': case 'g':
                            colors?.push(value / 255);
                            break;
                        case 'blue': case 'b':
                            colors?.push(value / 255);
                            break;
                    }
                }
                vertexCount++;
            }
        }

        return { vertices, normals, colors };
    }

    convertToStandardFormat(result, header) {
        // Convert arrays to Float32Array if they aren't already
        const vertices = new Float32Array(result.vertices);
        const normals = result.normals ? new Float32Array(result.normals) : null;
        const colors = result.colors ? new Float32Array(result.colors) : new Float32Array(vertices.length).fill(1.0);

        return {
            vertices,
            normals,
            colors,
            vertexCount: vertices.length / 3
        };
    }

    parseOBJ(data) {
        console.log('Parsing OBJ data...');
        const tempVertices = [];
        const tempNormals = [];
        const tempUVs = [];
        const vertices = [];
        const normals = [];
        const uvs = [];
        const colors = [];

        // Split data into lines and clean them
        const lines = data.split(/\r\n|\r|\n/)
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));

        try {
            // First pass: collect all vertex data
            lines.forEach(line => {
                const parts = line.split(/\s+/);
                const command = parts[0].toLowerCase();

                switch (command) {
                    case 'v': // Vertex
                        if (parts.length >= 4) {
                            tempVertices.push(
                                parseFloat(parts[1]) || 0,
                                parseFloat(parts[2]) || 0,
                                parseFloat(parts[3]) || 0
                            );
                        }
                        break;
                    case 'vn': // Normal
                        if (parts.length >= 4) {
                            tempNormals.push(
                                parseFloat(parts[1]) || 0,
                                parseFloat(parts[2]) || 0,
                                parseFloat(parts[3]) || 0
                            );
                        }
                        break;
                    case 'vt': // Texture coordinate
                        if (parts.length >= 3) {
                            tempUVs.push(
                                parseFloat(parts[1]) || 0,
                                parseFloat(parts[2]) || 0
                            );
                        }
                        break;
                }
            });

            // Second pass: process faces
            lines.forEach(line => {
                const parts = line.split(/\s+/);
                if (parts[0].toLowerCase() === 'f') {
                    // Handle different face formats: v, v/t, v//n, v/t/n
                    const faceVertices = parts.slice(1).map(vert => {
                        const indices = vert.split('/').map(idx => parseInt(idx) || 0);
                        return {
                            v: (indices[0] || 0) - 1,
                            t: (indices[1] || 0) - 1,
                            n: (indices[2] || 0) - 1
                        };
                    });

                    // Triangulate face if necessary (fan triangulation)
                    for (let i = 1; i < faceVertices.length - 1; i++) {
                        const triangle = [faceVertices[0], faceVertices[i], faceVertices[i + 1]];
                        
                        triangle.forEach(vertex => {
                            // Add vertex coordinates
                            if (vertex.v >= 0 && vertex.v * 3 + 2 < tempVertices.length) {
                                vertices.push(
                                    tempVertices[vertex.v * 3],
                                    tempVertices[vertex.v * 3 + 1],
                                    tempVertices[vertex.v * 3 + 2]
                                );
                            } else {
                                vertices.push(0, 0, 0);
                            }

                            // Add normal coordinates
                            if (vertex.n >= 0 && vertex.n * 3 + 2 < tempNormals.length) {
                                normals.push(
                                    tempNormals[vertex.n * 3],
                                    tempNormals[vertex.n * 3 + 1],
                                    tempNormals[vertex.n * 3 + 2]
                                );
                            }

                            // Add default color (white)
                            colors.push(1.0, 1.0, 1.0);
                        });
                    }
                }
            });

            if (vertices.length === 0) {
                throw new Error('No valid vertices found in OBJ file');
            }

            // If we have normals but not for every vertex, generate missing ones
            if (normals.length > 0 && normals.length < vertices.length) {
                while (normals.length < vertices.length) {
                    normals.push(0, 1, 0); // Default normal pointing up
                }
            }

            console.log(`Parsed OBJ data: ${vertices.length / 3} vertices${normals.length > 0 ? ', with normals' : ''}`);

            return {
                vertices: vertices,
                normals: normals.length > 0 ? normals : null,
                colors: colors,
                vertexCount: vertices.length / 3
            };

        } catch (error) {
            console.error('Error parsing OBJ file:', error);
            throw new Error(`Failed to parse OBJ file: ${error.message}`);
        }
    }

    parseFBX(data) {
        console.warn('FBX parsing is not fully implemented');
        return {
            vertices: [],
            normals: null,
            colors: [],
            vertexCount: 0
        };
    }
}