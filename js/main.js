const vertexShaderSource = `
    attribute vec3 aVertexPosition;
    attribute vec3 aVertexColor;
    
    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;
    
    varying vec3 vColor;
    
    void main(void) {
        gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
        vColor = aVertexColor;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    varying vec3 vColor;
    
    void main(void) {
        gl_FragColor = vec4(vColor, 1.0);
    }
`;

class Renderer {
    constructor() {
        console.log("Initializing Renderer...");
        
        this.canvas = document.querySelector("#glCanvas");
        if (!this.canvas) {
            console.error("Canvas element not found!");
            return;
        }
        console.log("Canvas found:", this.canvas);

        this.gl = this.canvas.getContext("webgl", {
            antialias: true
        });
        
        if (!this.gl) {
            console.error("WebGL context creation failed!");
            alert("Unable to initialize WebGL.");
            return;
        }
        console.log("WebGL context created successfully");

        // Set initial canvas size
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        console.log(`Canvas size set to: ${this.canvas.width}x${this.canvas.height}`);

        // Enable depth testing
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.depthFunc(this.gl.LEQUAL);
        console.log("Depth testing enabled");

        // Initialize shaders first
        this.initShaders();
        
        console.log("Initializing camera...");
        this.camera = new Camera(this.gl);
        
        console.log("Initializing controls...");
        this.controls = new Controls(this.camera, this.canvas);
        
        console.log("Initializing grid...");
        this.grid = new Grid(this.gl, 100, 20);

        this.then = 0;
        
        // Add debug info display
        this.createDebugDisplay();
        
        console.log("Starting render loop...");
        this.render();
    }

        // Add this method
    compileShader(source, type) {
        console.log(`Compiling ${type === this.gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader...`);
        
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }

        console.log('Shader compiled successfully');
        return shader;
    }

    createDebugDisplay() {
        this.debugDisplay = document.createElement('div');
        this.debugDisplay.style.position = 'fixed';
        this.debugDisplay.style.top = '10px';
        this.debugDisplay.style.right = '10px';
        this.debugDisplay.style.backgroundColor = 'rgba(0,0,0,0.7)';
        this.debugDisplay.style.color = 'white';
        this.debugDisplay.style.padding = '10px';
        this.debugDisplay.style.fontFamily = 'monospace';
        this.debugDisplay.style.fontSize = '12px';
        this.debugDisplay.style.zIndex = '1000';
        document.body.appendChild(this.debugDisplay);
    }

    updateDebugInfo(deltaTime) {
        const cameraPos = this.camera.position;
        this.debugDisplay.innerHTML = `
            FPS: ${(1 / deltaTime).toFixed(2)}<br>
            Camera Position: (${cameraPos[0].toFixed(2)}, ${cameraPos[1].toFixed(2)}, ${cameraPos[2].toFixed(2)})<br>
            Grid Vertices: ${this.grid.vertexCount}<br>
            Canvas Size: ${this.canvas.width}x${this.canvas.height}<br>
        `;
    }

    initShaders() {
        console.log("Initializing shaders...");
        
        const vertexShader = this.compileShader(vertexShaderSource, this.gl.VERTEX_SHADER);
        const fragmentShader = this.compileShader(fragmentShaderSource, this.gl.FRAGMENT_SHADER);
        
        if (!vertexShader || !fragmentShader) {
            console.error("Shader compilation failed!");
            return;
        }

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Shader program linking failed:', this.gl.getProgramInfoLog(this.program));
            return;
        }

        // Validate program
        this.gl.validateProgram(this.program);
        if (!this.gl.getProgramParameter(this.program, this.gl.VALIDATE_STATUS)) {
            console.error('Shader program validation failed:', this.gl.getProgramInfoLog(this.program));
            return;
        }

        console.log("Shader program created successfully");
        
        // Log attribute locations
        const positionLoc = this.gl.getAttribLocation(this.program, 'aVertexPosition');
        const colorLoc = this.gl.getAttribLocation(this.program, 'aVertexColor');
        console.log('Attribute locations:', {
            aVertexPosition: positionLoc,
            aVertexColor: colorLoc
        });
    }

    render(now) {
        now *= 0.001;
        const deltaTime = now - this.then;
        this.then = now;

        // Update debug info
        this.updateDebugInfo(deltaTime);

        // Update controls
        this.controls.update(deltaTime);

        // Clear the canvas
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Set up matrices
        const fieldOfView = 45 * Math.PI / 180;
        const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        const zNear = 0.1;
        const zFar = 1000.0;

        const projectionMatrix = glMatrix.mat4.create();
        glMatrix.mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    
        const viewMatrix = this.camera.getViewMatrix();
        const modelMatrix = glMatrix.mat4.create();
        const modelViewMatrix = glMatrix.mat4.create();
        glMatrix.mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

        // Use shader program
        this.gl.useProgram(this.program);

        // Get uniform locations
        const projectionLoc = this.gl.getUniformLocation(this.program, "uProjectionMatrix");
        const modelViewLoc = this.gl.getUniformLocation(this.program, "uModelViewMatrix");

        if (projectionLoc === null || modelViewLoc === null) {
            console.error("Unable to get uniform locations", {
                projectionLoc,
                modelViewLoc
            });
        }

        // Set uniforms
        this.gl.uniformMatrix4fv(projectionLoc, false, projectionMatrix);
        this.gl.uniformMatrix4fv(modelViewLoc, false, modelViewMatrix);

        try {
            this.grid.draw(this.program);
        } catch (error) {
            console.error("Error drawing grid:", error);
        }

        requestAnimationFrame(this.render.bind(this));
    }
}

// Start the application
window.onload = () => {
    new Renderer();
};