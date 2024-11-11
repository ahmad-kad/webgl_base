import { ModelLoader } from './model-loader.js';
import { SHADERS } from './shaders.js';
import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export class PointCloudRenderer {
    constructor(gl) {
        this.gl = gl;
        console.log('Initializing PointCloudRenderer with WebGL 1');
        
        // Initialize bounds first
        this.bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        // Initialize ModelLoader
        this.modelLoader = new ModelLoader();
        
        this.initBuffers();
        const shadersInitialized = this.initShaders();
        const meshShadersInitialized = this.initMeshShaders();
        
        if (!shadersInitialized || !meshShadersInitialized) {
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

            // Get attributes
            this.attributes = {
                position: gl.getAttribLocation(this.program, 'aPosition'),
                normal: gl.getAttribLocation(this.program, 'aNormal'),
                color: gl.getAttribLocation(this.program, 'aColor'),
                curvature: gl.getAttribLocation(this.program, 'aCurvature')
            };

            // Get uniforms
            this.uniforms = {
                modelView: gl.getUniformLocation(this.program, 'uModelViewMatrix'),
                projection: gl.getUniformLocation(this.program, 'uProjectionMatrix'),
                pointSize: gl.getUniformLocation(this.program, 'uPointSize'),
                viewMode: gl.getUniformLocation(this.program, 'uViewMode'),
                nearPlane: gl.getUniformLocation(this.program, 'uNearPlane'),
                farPlane: gl.getUniformLocation(this.program, 'uFarPlane')
            };

            return true;
        } catch (error) {
            console.error('Error initializing shaders:', error);
            return false;
        }
    }


    initMeshShaders() {
        // Initialize mesh shader program similar to point shader program
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, SHADERS.mesh.vertex);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, SHADERS.mesh.fragment);
        
        this.meshProgram = this.gl.createProgram();
        this.gl.attachShader(this.meshProgram, vertexShader);
        this.gl.attachShader(this.meshProgram, fragmentShader);
        this.gl.linkProgram(this.meshProgram);
        
        // Get mesh attribute and uniform locations
        this.meshAttributes = {
            position: this.gl.getAttribLocation(this.meshProgram, 'aPosition'),
            normal: this.gl.getAttribLocation(this.meshProgram, 'aNormal'),
            color: this.gl.getAttribLocation(this.meshProgram, 'aColor'),
            texCoord: this.gl.getAttribLocation(this.meshProgram, 'aTexCoord')
        };
        
        this.meshUniforms = {
            modelView: this.gl.getUniformLocation(this.meshProgram, 'uModelViewMatrix'),
            projection: this.gl.getUniformLocation(this.meshProgram, 'uProjectionMatrix'),
            normalMatrix: this.gl.getUniformLocation(this.meshProgram, 'uNormalMatrix'),
            viewMode: this.gl.getUniformLocation(this.meshProgram, 'uViewMode'),
            wireframe: this.gl.getUniformLocation(this.meshProgram, 'uWireframe'),
            nearPlane: this.gl.getUniformLocation(this.meshProgram, 'uNearPlane'),
            farPlane: this.gl.getUniformLocation(this.meshProgram, 'uFarPlane')
        };
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

    setViewMode(mode) {
        this.viewMode = mode;
    }

    setPointSize(size) {
        this.pointSize = Math.max(0.1, Math.min(10.0, size));
    }

    updateBuffers(data) {
        const gl = this.gl;
    
        // Log buffer data for debugging
        console.log('Updating buffers with data:', {
            verticesLength: data.vertices.length,
            hasNormals: !!data.normals,
            hasColors: !!data.colors,
            vertexCount: data.vertices.length / 3
        });
    
        // Ensure vertices are in Float32Array format
        const vertices = data.vertices instanceof Float32Array ? 
            data.vertices : new Float32Array(data.vertices);
    
        // Calculate vertex count
        this.vertexCount = vertices.length / 3;
    
        // Bind and upload position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        console.log('Position buffer updated with', vertices.length, 'values');
    
        // Handle normals - ensure same length as vertices
        let normals;
        if (data.normals && data.normals.length === vertices.length) {
            normals = data.normals instanceof Float32Array ?
                data.normals : new Float32Array(data.normals);
        } else {
            // Create default normals for all vertices
            normals = new Float32Array(vertices.length);
            for (let i = 0; i < vertices.length; i += 3) {
                normals[i] = 0;
                normals[i + 1] = 1;
                normals[i + 2] = 0;
            }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
        gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
        console.log('Normal buffer updated with', normals.length, 'values');
    
        // Handle colors - ensure same length as vertices
        let colors;
        if (data.colors && data.colors.length > 0) {
            colors = data.colors instanceof Float32Array ?
                data.colors : new Float32Array(data.colors);
            
            // If colors array is shorter than vertices, extend it
            if (colors.length !== vertices.length) {
                const extendedColors = new Float32Array(vertices.length);
                const lastColor = [colors[colors.length - 3], colors[colors.length - 2], colors[colors.length - 1]];
                
                // Copy existing colors
                for (let i = 0; i < colors.length; i++) {
                    extendedColors[i] = colors[i];
                }
                
                // Fill remaining vertices with last color
                for (let i = colors.length; i < vertices.length; i += 3) {
                    extendedColors[i] = lastColor[0];
                    extendedColors[i + 1] = lastColor[1];
                    extendedColors[i + 2] = lastColor[2];
                }
                
                colors = extendedColors;
            }
    
            // Normalize colors if they're in 0-255 range
            if (colors.some(c => c > 1.0)) {
                for (let i = 0; i < colors.length; i++) {
                    colors[i] = colors[i] / 255;
                }
            }
        } else {
            // Create default white colors for all vertices
            colors = new Float32Array(vertices.length);
            for (let i = 0; i < vertices.length; i += 3) {
                colors[i] = 1.0;     // R
                colors[i + 1] = 1.0; // G
                colors[i + 2] = 1.0; // B
            }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
        console.log('Color buffer updated with', colors.length, 'values');
    
        // Update face-related buffers if available
        if (data.faces && data.faces.length > 0) {
            let indices;
            if (!this.uint32Indices && data.faces instanceof Uint32Array) {
                // Check if any index exceeds UNSIGNED_SHORT limit
                if (data.faces.some(index => index > 65535)) {
                    console.error('Model has too many vertices for WebGL 1 without OES_element_index_uint extension');
                    return;
                }
                indices = new Uint16Array(data.faces);
            } else {
                indices = data.faces;
            }
            
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.buffers.indices);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, indices, this.gl.STATIC_DRAW);
            this.indexCount = indices.length;
        }
        
        if (data.textureCoords && data.textureCoords.length > 0) {
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.texCoords);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, data.textureCoords, this.gl.STATIC_DRAW);
        }
    
        console.log('Final buffer lengths:', {
            vertices: vertices.length,
            normals: normals.length,
            colors: colors.length,
            vertexCount: this.vertexCount
        });
    }


    bindAttributes() {
        const gl = this.gl;
        
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
    }

    drawPoints(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;

        if (!this.program || !this.uniforms || !this.attributes || this.vertexCount === 0) {
            console.error('Cannot draw points: not properly initialized or no data');
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
            gl.uniform1f(this.uniforms.farPlane, 1000.0);

            // Bind attributes
            this.bindAttributes();

            // Draw
            gl.drawArrays(gl.POINTS, 0, this.vertexCount);

            // Cleanup
            if (this.attributes.position !== -1) gl.disableVertexAttribArray(this.attributes.position);
            if (this.attributes.normal !== -1) gl.disableVertexAttribArray(this.attributes.normal);
            if (this.attributes.color !== -1) gl.disableVertexAttribArray(this.attributes.color);
        } catch (error) {
            console.error('Error drawing points:', error);
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
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            console.log('Loading PLY file...');
            const data = await this.modelLoader.loadPLY(text);
            
            if (!data || !data.vertices || data.vertices.length === 0) {
                throw new Error('No valid vertex data found in PLY file');
            }

            this.updateBuffers(data);
            this.calculateBounds(data.vertices);
            this.vertexCount = data.vertices.length / 3;

            // Emit modelLoaded event
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
}