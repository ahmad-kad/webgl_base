
// Add debug logging to Grid class
class Grid {
    constructor(gl, size = 100, divisions = 20) {
        console.log("Creating grid:", { size, divisions });
        this.gl = gl;
        this.size = size;
        this.divisions = divisions;
        this.initBuffers();
    }

    initBuffers() {
        console.log("Initializing grid buffers...");
        const vertices = [];
        const colors = [];
        const step = this.size / this.divisions;
        const halfSize = this.size / 2;

        // Create vertices for grid lines
        for (let i = -halfSize; i <= halfSize; i += step) {
            vertices.push(i, 0, -halfSize, i, 0, halfSize);
            vertices.push(-halfSize, 0, i, halfSize, 0, i);

            const isCenter = Math.abs(i) < 0.1;
            const color = isCenter ? [1, 1, 1] : [0.5, 0.5, 0.5];
            for (let j = 0; j < 4; j++) {
                colors.push(...color);
            }
        }

        console.log(`Generated ${vertices.length / 3} vertices`);

        try {
            // Create vertex buffer
            this.vertexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(vertices), this.gl.STATIC_DRAW);
            
            // Create color buffer
            this.colorBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.colorBuffer);
            this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(colors), this.gl.STATIC_DRAW);
            
            this.vertexCount = vertices.length / 3;
            console.log("Grid buffers created successfully");
        } catch (error) {
            console.error("Error creating grid buffers:", error);
        }
    }

    draw(program) {
        console.log("Drawing grid...");
        const gl = this.gl;

        // Get attribute locations
        const positionLoc = gl.getAttribLocation(program, 'aVertexPosition');
        const colorLoc = gl.getAttribLocation(program, 'aVertexColor');

        console.log("Attribute locations:", { positionLoc, colorLoc });

        if (positionLoc === -1 || colorLoc === -1) {
            console.error("Failed to get attribute locations");
            return;
        }

        try {
            // Bind position buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(positionLoc);

            // Bind color buffer
            gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
            gl.vertexAttribPointer(colorLoc, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(colorLoc);

            // Draw the grid
            gl.drawArrays(gl.LINES, 0, this.vertexCount);
            console.log(`Drew grid with ${this.vertexCount} vertices`);

        } catch (error) {
            console.error("Error during grid drawing:", error);
        } finally {
            // Cleanup
            gl.disableVertexAttribArray(positionLoc);
            gl.disableVertexAttribArray(colorLoc);
        }
    }
}