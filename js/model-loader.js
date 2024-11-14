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