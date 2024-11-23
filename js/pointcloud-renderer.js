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
    
        
        if (!shadersInitialized || !meshShadersInitialized || !debugShadersInitialized) {
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
            texCoords: this.gl.createBuffer()
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
                colorProfile: gl.getUniformLocation(this.program,'uColorProfile')
            };
    
            // Validate required uniforms
            if (!this.uniforms.modelView || !this.uniforms.projection || !this.uniforms.pointSize) {
                throw new Error('Could not find required uniforms');
            }
    
            console.log('Shader initialization successful', {
                attributes: Object.entries(this.attributes).map(([name, location]) => 
                    `${name}: ${location}`).join(', '),
                uniforms: Object.keys(this.uniforms).join(', ')
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
        
        // Store original data
        this.originalVertices = data.vertices instanceof Float32Array ? 
            data.vertices : new Float32Array(data.vertices);
        this.originalNormals = data.normals instanceof Float32Array ? 
            data.normals : data.normals ? new Float32Array(data.normals) : null;
        this.originalColors = data.colors instanceof Float32Array ?
            data.colors : data.colors ? new Float32Array(data.colors) : new Float32Array(this.originalVertices.length).fill(1.0);
                
        this.vertexCount = this.originalVertices.length / 3;
    
        // Reset previous buffers
        Object.values(this.buffers).forEach(buffer => {
            if (buffer) gl.deleteBuffer(buffer);
        });
        
        this.initBuffers();
    
        // Initialize buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, this.originalVertices, gl.STATIC_DRAW);
    
        // Initialize normals
        const normals = this.originalNormals || 
            new Float32Array(this.originalVertices.length).fill(0).map((_, i) => i % 3 === 1 ? 1 : 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    
        // Initialize colors - moved before octree creation
        const colors = this.originalColors;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    
        // Initialize curvature
        const curvature = new Float32Array(this.vertexCount).fill(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.curvature);
        gl.bufferData(gl.ARRAY_BUFFER, curvature, gl.STATIC_DRAW);
    
        // Build octree
        const bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };
    
        // Calculate bounds and build octree data
        for (let i = 0; i < this.originalVertices.length; i += 3) {
            bounds.min.x = Math.min(bounds.min.x, this.originalVertices[i]);
            bounds.min.y = Math.min(bounds.min.y, this.originalVertices[i + 1]);
            bounds.min.z = Math.min(bounds.min.z, this.originalVertices[i + 2]);
            bounds.max.x = Math.max(bounds.max.x, this.originalVertices[i]);
            bounds.max.y = Math.max(bounds.max.y, this.originalVertices[i + 1]);
            bounds.max.z = Math.max(bounds.max.z, this.originalVertices[i + 2]);
        }
    
        // Create octree
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
        
        // Insert points into octree
        for (let i = 0; i < this.originalVertices.length; i += 3) {
            this.octree.insert({
                x: this.originalVertices[i],
                y: this.originalVertices[i + 1],
                z: this.originalVertices[i + 2],
                index: i / 3
            });
        }
    
        console.log('Buffers initialized with:', {
            vertexCount: this.vertexCount,
            hasNormals: !!this.originalNormals,
            hasColors: !!this.originalColors,
            bufferSizes: {
                vertices: this.originalVertices.length,
                normals: normals.length,
                colors: colors.length,
                curvature: curvature.length
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
            console.error('Cannot draw points: not properly initialized');
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
    
            // Update buffers with the processed data
            this.updateBuffers({
                vertices: vertices,
                normals: normals,
                colors: colors
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
                    colors: colors?.length || 0
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


}