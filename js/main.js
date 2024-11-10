import { mat4, vec3 } from 'https://cdn.skypack.dev/gl-matrix';
import { Camera } from './camera.js';
import { Controls } from './controls.js';
import { ViewerControls } from './viewer-controls.js';
import { PointCloudRenderer } from './pointcloud-renderer.js';
import { Grid } from './grid.js';
import { ModelLoader } from './model-loader.js'; // Keep this import
import { SHADERS } from './shaders.js';

class App {
    constructor() {
        console.log('Initializing App...');
        // Store gl-matrix functions
        window.glMatrix = { mat4, vec3 };
        this.mat4 = mat4;
        this.vec3 = vec3;
        
        this.initializeWebGL();
        if (this.gl) {
            this.initializeComponents();
            this.setupEventListeners();
            this.startRenderLoop();
        }
    }
    
    initializeWebGL() {
        console.log('Initializing WebGL...');
        this.canvas = document.querySelector('#glCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        this.gl = this.canvas.getContext('webgl');
        if (!this.gl) {
            console.error('Unable to initialize WebGL. Your browser may not support it.');
            return;
        }

        this.setupWebGLContext();
        this.resizeCanvas();
        console.log('WebGL initialized successfully');
    }

    setupWebGLContext() {
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    initializeComponents() {
        console.log('Initializing components...');
        try {
            this.camera = new Camera();
            console.log('Camera initialized');

            this.controls = new Controls(this.camera, this.canvas);
            console.log('Controls initialized');

            this.pointCloudRenderer = new PointCloudRenderer(this.gl);
            console.log('Point cloud renderer initialized');

            this.viewerControls = new ViewerControls(this.pointCloudRenderer);
            console.log('Viewer controls initialized');

            this.grid = new Grid(this.gl);
            console.log('Grid initialized');

            this.lastFrame = 0;
            this.isLoading = false;

            // Initial point cloud load
            this.loadPointCloud('models/example.ply');

        } catch (error) {
            console.error('Error initializing components:', error);
            throw error;
        }
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        console.log('Resizing canvas...');
        const { innerWidth, innerHeight } = window;
        this.canvas.width = innerWidth;
        this.canvas.height = innerHeight;
        this.gl.viewport(0, 0, innerWidth, innerHeight);
        console.log(`Canvas resized to ${innerWidth}x${innerHeight}`);
    }

    async loadPointCloud(filePath) {
        if (this.isLoading) return;
        
        console.log('Loading point cloud from:', filePath);
        this.isLoading = true;
        
        try {
            await this.pointCloudRenderer.loadPLY(filePath);
            this.centerCameraOnPointCloud();
        } catch (error) {
            console.error('Error loading point cloud:', error);
        } finally {
            this.isLoading = false;
        }
    }

    centerCameraOnPointCloud() {
        const { bounds } = this.pointCloudRenderer;
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
        this.camera.lookAt([center.x, center.y, center.z]);
    }

    render(now) {
        try {
            now *= 0.001;
            const deltaTime = now - this.lastFrame;
            this.lastFrame = now;

            // Update controls
            this.controls.update(deltaTime);

            // Clear canvas
            this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            // Setup matrices
            const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
            const projectionMatrix = this.mat4.create();
            this.mat4.perspective(projectionMatrix, 45 * Math.PI / 180, aspect, 0.1, 1000.0);

            const viewMatrix = this.camera.getViewMatrix();
            const modelMatrix = this.mat4.create();
            const modelViewMatrix = this.mat4.create();
            this.mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

            // Render scene
            this.grid.draw(projectionMatrix, modelViewMatrix);
            this.pointCloudRenderer.draw(projectionMatrix, modelViewMatrix);

            requestAnimationFrame((now) => this.render(now));
        } catch (error) {
            console.error('Error in render loop:', error);
        }
    }

    startRenderLoop() {
        console.log('Starting render loop...');
        this.render(0);
    }
}

// Initialize app when window loads
window.addEventListener('load', () => {
    console.log('Window loaded, initializing application...');
    try {
        new App();
    } catch (error) {
        console.error('Error initializing app:', error);
    }
});

window.addEventListener('load', async () => {
    console.log('Window loaded, initializing application...');
    try {
        // Make sure all modules are loaded first
        await Promise.all([
            import('./camera.js'),
            import('./controls.js'),
            import('./viewer-controls.js'),
            import('./pointcloud-renderer.js'),
            import('./grid.js'),
            import('./model-loader.js'),
            import('./shaders.js')
        ]);
        
        console.log('All modules loaded successfully');
        new App();
    } catch (error) {
        console.error('Error loading modules or initializing app:', error);
    }
});

window.addEventListener('modelLoaded', (event) => {
    const { bounds, vertexCount } = event.detail;
    console.log(`Model loaded with ${vertexCount} vertices`);
});