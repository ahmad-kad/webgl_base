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
        const gridColor = [0.5, 0.5, 0.5];

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