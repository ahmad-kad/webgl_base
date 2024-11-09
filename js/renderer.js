class Renderer {
    constructor() {
        this.initializeWebGL();
        if (!this.gl) return;

        this.initializeComponents();
        this.setupEventListeners();
        this.startRenderLoop();
    }

    initializeWebGL() {
        this.canvas = document.querySelector('#glCanvas');
        this.gl = this.canvas.getContext('webgl');
        
        if (!this.gl) {
            alert('Unable to initialize WebGL. Your browser may not support it.');
            return;
        }

        this.setupWebGLContext();
        this.resizeCanvas();
    }

    setupWebGLContext() {
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.BLEND);
        this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    }

    initializeComponents() {
        this.camera = new Camera(this.gl);
        this.controls = new Controls(this.camera, this.canvas);
        this.pointCloudRenderer = new PointCloudRenderer(this.gl);
        this.grid = new Grid(this.gl);
        
        this.lastFrame = 0;
        this.isLoading = false;
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        const { innerWidth, innerHeight } = window;
        this.canvas.width = innerWidth;
        this.canvas.height = innerHeight;
        this.gl.viewport(0, 0, innerWidth, innerHeight);
    }

    async loadPointCloud(filePath) {
        if (this.isLoading) return;
        
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
        const center = this.calculateCenter(bounds);
        const size = this.calculateBoundsSize(bounds);
        
        this.positionCamera(center, size);
    }

    calculateCenter(bounds) {
        return {
            x: (bounds.max.x + bounds.min.x) / 2,
            y: (bounds.max.y + bounds.min.y) / 2,
            z: (bounds.max.z + bounds.min.z) / 2
        };
    }

    calculateBoundsSize(bounds) {
        return Math.max(
            bounds.max.x - bounds.min.x,
            bounds.max.y - bounds.min.y,
            bounds.max.z - bounds.min.z
        );
    }

    positionCamera(center, size) {
        this.camera.position = [
            center.x,
            center.y + size * 0.5,
            center.z + size * 1.5
        ];
        this.camera.lookAt([center.x, center.y, center.z]);
    }

    setupMatrices() {
        const aspect = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
        const projectionMatrix = mat4.create();
        mat4.perspective(projectionMatrix, 45 * Math.PI / 180, aspect, 0.1, 1000.0);

        const viewMatrix = this.camera.getViewMatrix();
        const modelMatrix = mat4.create();
        const modelViewMatrix = mat4.create();
        mat4.multiply(modelViewMatrix, viewMatrix, modelMatrix);

        return { projectionMatrix, modelViewMatrix };
    }

    render(now) {
        now *= 0.001;
        const deltaTime = now - this.lastFrame;
        this.lastFrame = now;

        this.controls.update(deltaTime);
        this.clearCanvas();
        
        const matrices = this.setupMatrices();
        this.renderScene(matrices);

        requestAnimationFrame((now) => this.render(now));
    }

    clearCanvas() {
        this.gl.clearColor(0.1, 0.1, 0.1, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
    }

    renderScene(matrices) {
        this.grid.draw(matrices.projectionMatrix, matrices.modelViewMatrix);
        this.pointCloudRenderer.draw(matrices.projectionMatrix, matrices.modelViewMatrix);
    }

    startRenderLoop() {
        this.render(0);
        this.loadPointCloud('models/example.ply');
    }
}