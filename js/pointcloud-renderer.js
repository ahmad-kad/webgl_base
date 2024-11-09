import { ViewerControls } from './viewer-controls.js';
import { PLYLoader } from './plyloader.js';
import { SHADERS } from './shaders.js';

export class PointCloudRenderer {
    constructor(gl) {
        console.log('Initializing PointCloudRenderer');
        this.gl = gl;
        this.viewMode = 0;
        this.pointSize = 1.0;
        this.vertexCount = 0;
        this.bounds = {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 0, y: 0, z: 0 }
        };

        try {
            this.initShaders();
            this.initBuffers();
            this.controls = new ViewerControls(this);
        } catch (error) {
            console.error('Error initializing PointCloudRenderer:', error);
            throw error;
        }
    }

    initShaders() {
        // Use shaders from shaders.js
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, SHADERS.point.vertex);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, SHADERS.point.fragment);
    
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
    
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Failed to link program:', this.gl.getProgramInfoLog(this.program));
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
        // Create buffers
        this.buffers = {
            position: this.gl.createBuffer(),
            normal: this.gl.createBuffer(),
            color: this.gl.createBuffer(),
            curvature: this.gl.createBuffer()
        };
    }

    async loadPLY(filePath) {
        const loader = new PLYLoader();
        try {
            const data = await loader.loadPLY(filePath);
            this.updateBuffers(data);
            this.calculateBounds(data.vertices);
            this.vertexCount = data.vertices.length / 3;
            console.log(`Loaded point cloud with ${this.vertexCount} points`);
        } catch (error) {
            console.error('Error loading PLY:', error);
        }
    }

    updateBuffers(data) {
        const gl = this.gl;

        // Update position buffer
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.vertices), gl.STATIC_DRAW);

        // Update normal buffer
        if (data.normals) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.normals), gl.STATIC_DRAW);
        } else {
            // Create default normals if not provided
            const defaultNormals = new Float32Array(data.vertices.length).fill(0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
            gl.bufferData(gl.ARRAY_BUFFER, defaultNormals, gl.STATIC_DRAW);
        }

        // Update color buffer
        if (data.colors) {
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data.colors), gl.STATIC_DRAW);
        } else {
            // Create white colors if not provided
            const defaultColors = new Float32Array(data.vertices.length).fill(1.0);
            gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
            gl.bufferData(gl.ARRAY_BUFFER, defaultColors, gl.STATIC_DRAW);
        }

        // Create curvature buffer (placeholder for now)
        const defaultCurvature = new Float32Array(this.vertexCount).fill(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.curvature);
        gl.bufferData(gl.ARRAY_BUFFER, defaultCurvature, gl.STATIC_DRAW);
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

    setViewMode(mode) {
        this.viewMode = mode;
    }

    setPointSize(size) {
        this.pointSize = size;
    }

    draw(projectionMatrix, modelViewMatrix) {
        const gl = this.gl;

        gl.useProgram(this.program);

        // Set uniforms
        gl.uniformMatrix4fv(this.uniforms.projection, false, projectionMatrix);
        gl.uniformMatrix4fv(this.uniforms.modelView, false, modelViewMatrix);
        gl.uniform1f(this.uniforms.pointSize, this.pointSize);
        gl.uniform1i(this.uniforms.viewMode, this.viewMode);
        gl.uniform1f(this.uniforms.nearPlane, 0.1);
        gl.uniform1f(this.uniforms.farPlane, 1000.0);

        // Set vertex attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.position);
        gl.vertexAttribPointer(this.attributes.position, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.attributes.position);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.normal);
        gl.vertexAttribPointer(this.attributes.normal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.attributes.normal);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.color);
        gl.vertexAttribPointer(this.attributes.color, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.attributes.color);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers.curvature);
        gl.vertexAttribPointer(this.attributes.curvature, 1, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(this.attributes.curvature);

        // Draw points
        gl.drawArrays(gl.POINTS, 0, this.vertexCount);

        // Cleanup
        gl.disableVertexAttribArray(this.attributes.position);
        gl.disableVertexAttribArray(this.attributes.normal);
        gl.disableVertexAttribArray(this.attributes.color);
        gl.disableVertexAttribArray(this.attributes.curvature);
    }
}