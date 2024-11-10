import { ModelLoader } from './model-loader.js';
import { SHADERS } from './shaders.js';

export class PointCloudRenderer {
    constructor(gl) {
        console.log('Initializing PointCloudRenderer');
        this.gl = gl;
        this.viewMode = 0;
        this.pointSize = 5.0;
        this.vertexCount = 0;
        this.bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        try {
            this.modelLoader = new ModelLoader();
            this.initShaders();
            this.initBuffers();
            console.log('PointCloudRenderer initialized successfully');
        } catch (error) {
            console.error('Error initializing PointCloudRenderer:', error);
            throw error;
        }
    }

    initShaders() {
        // Use shaders from shaders.js
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, SHADERS.point.vertex);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, SHADERS.point.fragment);
        
        if (!vertexShader || !fragmentShader) {
            console.error('Failed to create shaders');
            return;
        }
    
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
    
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            const error = this.gl.getProgramInfoLog(this.program);
            console.error('Failed to link program:', error);
            // Clean up shaders
            this.gl.deleteShader(vertexShader);
            this.gl.deleteShader(fragmentShader);
            this.gl.deleteProgram(this.program);
            return;
        }

        // Get attribute locations
        this.attributes = {
            position: this.gl.getAttribLocation(this.program, 'aPosition'),
            normal: this.gl.getAttribLocation(this.program, 'aNormal'),
            color: this.gl.getAttribLocation(this.program, 'aColor'),
            curvature: this.gl.getAttribLocation(this.program, 'aCurvature')
        };

        // Get uniform locations
        this.uniforms = {
            modelView: this.gl.getUniformLocation(this.program, 'uModelViewMatrix'),
            projection: this.gl.getUniformLocation(this.program, 'uProjectionMatrix'),
            pointSize: this.gl.getUniformLocation(this.program, 'uPointSize'),
            viewMode: this.gl.getUniformLocation(this.program, 'uViewMode'),
            nearPlane: this.gl.getUniformLocation(this.program, 'uNearPlane'),
            farPlane: this.gl.getUniformLocation(this.program, 'uFarPlane')
        };

        // Clean up shaders after linking
        this.gl.deleteShader(vertexShader);
        this.gl.deleteShader(fragmentShader);

        // Verify all locations were found
        Object.entries(this.attributes).forEach(([name, location]) => {
            if (location === -1) {
                console.warn(`Attribute '${name}' not found in shader program`);
            }
        });

        Object.entries(this.uniforms).forEach(([name, location]) => {
            if (location === null) {
                console.warn(`Uniform '${name}' not found in shader program`);
            }
        });
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

    initBuffers() {
        this.buffers = {
            position: this.gl.createBuffer(),
            normal: this.gl.createBuffer(),
            color: this.gl.createBuffer(),
            curvature: this.gl.createBuffer()
        };
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
            hasColors: !!data.colors
        });

        // Ensure vertices are in Float32Array format
        const vertices = data.vertices instanceof Float32Array ? 
            data.vertices : new Float32Array(data.vertices);

        // Bind and upload position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
        console.log('Position buffer updated with', vertices.length, 'values');

        // Handle normals
        let normals;
        if (data.normals && data.normals.length > 0) {
            normals = data.normals instanceof Float32Array ?
                data.normals : new Float32Array(data.normals);
        } else {
            // Create default normals if not provided
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

        // Handle colors
        let colors;
        if (data.colors && data.colors.length > 0) {
            colors = data.colors instanceof Float32Array ?
                data.colors : new Float32Array(data.colors);
            // Normalize colors if they're in 0-255 range
            if (colors.some(c => c > 1.0)) {
                for (let i = 0; i < colors.length; i++) {
                    colors[i] = colors[i] / 255;
                }
            }
        } else {
            // Create default white colors if not provided
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

        // Update vertex count
        this.vertexCount = vertices.length / 3;
        console.log('Updated vertex count:', this.vertexCount);
    }

    draw(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;

        if (!this.program || !this.uniforms || !this.attributes) {
            console.error('Shader program not properly initialized');
            return;
        }

        gl.useProgram(this.program);

        // Set uniforms
        gl.uniformMatrix4fv(this.uniforms.projection, false, projectionMatrix);
        gl.uniformMatrix4fv(this.uniforms.modelView, false, modelViewMatrix);
        gl.uniform1f(this.uniforms.pointSize, this.pointSize);
        gl.uniform1i(this.uniforms.viewMode, this.viewMode);
        gl.uniform1f(this.uniforms.nearPlane, 0.1);
        gl.uniform1f(this.uniforms.farPlane, 1000.0);

        // Enable and bind position attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.enableVertexAttribArray(this.attributes.position);
        gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);

        // Enable and bind normal attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
        gl.enableVertexAttribArray(this.attributes.normal);
        gl.vertexAttribPointer(this.attributes.normal, 3, gl.FLOAT, false, 0, 0);

        // Enable and bind color attribute
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.enableVertexAttribArray(this.attributes.color);
        gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);

        // Draw the points
        gl.drawArrays(gl.POINTS, 0, this.vertexCount);

        // Disable vertex attributes
        gl.disableVertexAttribArray(this.attributes.position);
        gl.disableVertexAttribArray(this.attributes.normal);
        gl.disableVertexAttribArray(this.attributes.color);
    }

    async loadPLY(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            const data = await this.modelLoader.loadFile(text, 'ply');
            this.updateBuffers(data);
            this.calculateBounds(data.vertices);
            this.vertexCount = data.vertices.length / 3;
            console.log(`Loaded PLY file with ${this.vertexCount} points`);

            // Emit modelLoaded event
            window.dispatchEvent(new CustomEvent('modelLoaded', {
                detail: {
                    type: 'ply',
                    vertexCount: this.vertexCount,
                    bounds: this.bounds
                }
            }));
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

            // Ensure data is in Float32Arrays without normalization
            const processedData = {
                vertices: data.vertices instanceof Float32Array ? 
                    data.vertices : new Float32Array(data.vertices),
                normals: data.normals instanceof Float32Array ? 
                    data.normals : new Float32Array(data.normals || []),
                colors: data.colors instanceof Float32Array ? 
                    data.colors : new Float32Array(data.colors || []),
                vertexCount: data.vertices.length / 3
            };

            // Update buffers and calculate bounds
            this.updateBuffers(processedData);
            this.calculateBounds(processedData.vertices);

            console.log(`Loaded ${fileType.toUpperCase()} model with ${this.vertexCount} vertices`);
            console.log('Model bounds:', this.bounds);

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
            console.error(`Error loading ${fileType.toUpperCase()} file:`, error);
            throw error;
        }
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
        this.bounds.min.x = this.bounds.min.y = this.bounds.min.z = Infinity;
        this.bounds.max.x = this.bounds.max.y = this.bounds.max.z = -Infinity;

        for (let i = 0; i < vertices.length; i += 3) {
            this.bounds.min.x = Math.min(this.bounds.min.x, vertices[i]);
            this.bounds.min.y = Math.min(this.bounds.min.y, vertices[i + 1]);
            this.bounds.min.z = Math.min(this.bounds.min.z, vertices[i + 2]);
            this.bounds.max.x = Math.max(this.bounds.max.x, vertices[i]);
            this.bounds.max.y = Math.max(this.bounds.max.y, vertices[i + 1]);
            this.bounds.max.z = Math.max(this.bounds.max.z, vertices[i + 2]);
        }
    }
}