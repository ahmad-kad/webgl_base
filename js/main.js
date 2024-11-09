class App {
    constructor() {
        console.log('Initializing App...');
        try {
            this.initializeWebGL();
            this.initializeComponents();
            this.startRenderLoop();
        } catch (error) {
            console.error('Error initializing app:', error);
        }
    }

    initializeWebGL() {
        console.log('Initializing WebGL...');
        this.canvas = document.querySelector('#glCanvas');
        if (!this.canvas) {
            throw new Error('Canvas element not found!');
        }

        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) {
            throw new Error('WebGL not supported!');
        }

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        
        // Enable WebGL features
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        
        console.log('WebGL initialized successfully');
    }

    initializeComponents() {
        console.log('Initializing components...');
        
        try {
            this.camera = new Camera(this.gl);
            console.log('Camera initialized');
        } catch (error) {
            console.error('Error initializing camera:', error);
        }

        try {
            this.controls = new Controls(this.camera, this.canvas);
            console.log('Controls initialized');
        } catch (error) {
            console.error('Error initializing controls:', error);
        }

        try {
            this.pointCloudRenderer = new PointCloudRenderer(this.gl);
            console.log('PointCloudRenderer initialized');
        } catch (error) {
            console.error('Error initializing point cloud renderer:', error);
        }

        // Load initial point cloud if available
        this.loadPointCloud('models/example.ply');
    }

    async loadPointCloud(filePath) {
        console.log(`Loading point cloud from: ${filePath}`);
        try {
            await this.pointCloudRenderer.loadPLY(filePath);
            console.log('Point cloud loaded successfully');
            this.centerCamera();
        } catch (error) {
            console.error('Error loading point cloud:', error);
        }
    }

    resizeCanvas() {
        console.log('Resizing canvas...');
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        console.log(`Canvas resized to ${this.canvas.width}x${this.canvas.height}`);
    }

    render(now) {
        now *= 0.001; // Convert to seconds
        
        // Clear
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // Update controls
        this.controls.update(now);

        // Set up matrices
        const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, 45 * Math.PI / 180, aspect, 0.1, 1000.0);

        const viewMatrix = this.camera.getViewMatrix();
        const modelMatrix = mat4.create();
        const modelViewMatrix = mat4.create();
        mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

        // Render point cloud
        if (this.pointCloudRenderer) {
            this.pointCloudRenderer.draw(projectionMatrix, modelViewMatrix);
        }

        requestAnimationFrame((now) => this.render(now));
    }

    startRenderLoop() {
        console.log('Starting render loop...');
        this.render(0);
    }

    centerCamera() {
        console.log('Centering camera...');
        if (this.pointCloudRenderer && this.pointCloudRenderer.bounds) {
            const bounds = this.pointCloudRenderer.bounds;
            const center = {
                x: (bounds.max.x + bounds.min.x) / 2,
                y: (bounds.max.y + bounds.min.y) / 2,
                z: (bounds.max.z + bounds.min.z) / 2
            };
            const size = Math.max(
                bounds.max.x - bounds.min.x,
                bounds.max.y - bounds.min.y,
                bounds.max.z - bounds.min.z
            );
            this.camera.position = [
                center.x,
                center.y + size * 0.5,
                center.z + size * 1.5
            ];
            console.log('Camera centered at:', this.camera.position);
        }
    }
}

// Initialize app when window loads
window.onload = () => {
    console.log('Window loaded, initializing application...');
    window.app = new App();
};