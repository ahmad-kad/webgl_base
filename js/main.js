import { mat4, vec3 } from 'https://cdn.skypack.dev/gl-matrix';
import { Camera } from './camera.js';
import { Controls } from './controls.js';
import { ViewerControls } from './viewer-controls.js';
import { PointCloudRenderer } from './pointcloud-renderer.js';
import { Grid } from './grid.js';
import { ModelLoader } from './model-loader.js'; // Keep this import
import { SHADERS } from './shaders.js';
import { XRControls } from './XRControls.js';

class App {
    constructor() {
        console.log('Initializing App...');
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

        // Initialize WebGL 1 context
        this.gl = this.canvas.getContext('webgl', {
            xrCompatible: true,
            antialias: true,
            alpha: false,
            depth: true,
            stencil: false
        });

        if (!this.gl) {
            console.error('WebGL not supported');
            return;
        }

        console.log('Using WebGL 1.0');
        this.setupWebGLContext();
        this.resizeCanvas();
    }

    setupWebGLContext() {
        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_ALPHA);

        // Enable extensions needed for WebGL 1
        this.uint32Indices = gl.getExtension('OES_element_index_uint');
        gl.getExtension('OES_vertex_array_object');
        gl.getExtension('OES_standard_derivatives');
        gl.getExtension('WEBGL_depth_texture');
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

            // Initialize XR controls first
            this.xrControls = new XRControls(this.pointCloudRenderer, this.camera);
            console.log('XR controls initialized');

            // Initialize viewer controls and pass XR controls reference
            this.viewerControls = new ViewerControls(this.pointCloudRenderer);
            this.viewerControls.setXRControls(this.xrControls);
            console.log('Viewer controls initialized');

            this.grid = new Grid(this.gl);
            console.log('Grid initialized');

            this.lastFrame = 0;
            this.isLoading = false;

            // Add event listener for model loading
            window.addEventListener('modelLoaded', (event) => {
                const cameraSetup = this.pointCloudRenderer.getCameraPositionFromBounds();
                this.camera.position = cameraSetup.position;
                this.camera.lookAt(cameraSetup.target);
                this.camera.up = cameraSetup.up;
            });

            // Setup XR session end handler
            window.addEventListener('xrsessionend', () => {
                const vrButton = document.querySelector('.vr-button');
                const statusIndicator = document.querySelector('.vr-status');
                if (vrButton && statusIndicator) {
                    vrButton.innerHTML = `
                        <svg class="vr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20.5 7H3.5C2.67157 7 2 7.67157 2 8.5V15.5C2 16.3284 2.67157 17 3.5 17H20.5C21.3284 17 22 16.3284 22 15.5V8.5C22 7.67157 21.3284 7 20.5 7Z" stroke="currentColor" stroke-width="2"/>
                            <circle cx="8" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
                            <circle cx="16" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
                        </svg>
                        Enter VR Mode
                    `;
                    statusIndicator.textContent = 'VR Ready';
                    statusIndicator.classList.remove('active');
                }
                document.body.classList.remove('vr-mode');
            });

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

            // XR VS Normal Controls
            if (!this.xrControls.xrSession) {
                this.controls.update(deltaTime);
            }

            this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

            // SMatrix
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
