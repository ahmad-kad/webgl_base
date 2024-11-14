export class Controls {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        
        this.keys = {};
        this.mouseDown = false;
        this.lastX = this.canvas.width / 2;
        this.lastY = this.canvas.height / 2;

        this.rotationSpeed = 5.0;

        this.initialPosition = [...camera.position];
        this.initialFront = [...camera.front];
        this.initialUp = [...camera.up];
        this.initialYaw = camera.yaw;
        this.initialPitch = camera.pitch;

        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
            
            if (e.key.toLowerCase() === 'f') {
                this.resetCamera();
            }
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
            this.canvas.style.cursor = 'pointer';
        });

        document.addEventListener('mouseup', () => {
            this.mouseDown = false;
            this.canvas.style.cursor = 'default';
        });

        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    resetCamera() {
        // Reset position
        this.camera.position = [...this.initialPosition];
        this.camera.front = [...this.initialFront];
        this.camera.up = [...this.initialUp];
        
        // Reset orientation
        this.camera.yaw = this.initialYaw;
        this.camera.pitch = this.initialPitch;
        
        // Update camera vectors to apply changes
        this.camera.updateCameraVectors();
    }

    update(deltaTime) {
        // Movement controls (WASD + QE)
        if (this.keys['w']) this.camera.processKeyboard('FORWARD', deltaTime);
        if (this.keys['s']) this.camera.processKeyboard('BACKWARD', deltaTime);
        if (this.keys['a']) this.camera.processKeyboard('LEFT', deltaTime);
        if (this.keys['d']) this.camera.processKeyboard('RIGHT', deltaTime);
        if (this.keys['q']) this.camera.processKeyboard('DOWN', deltaTime);
        if (this.keys['e']) this.camera.processKeyboard('UP', deltaTime);

        // Camera rotation controls (IJKL)
        if (this.keys['i']) this.camera.processMouseMovement(0, this.rotationSpeed);     // Look up
        if (this.keys['k']) this.camera.processMouseMovement(0, -this.rotationSpeed);    // Look down
        if (this.keys['j']) this.camera.processMouseMovement(-this.rotationSpeed, 0);    // Look left
        if (this.keys['l']) this.camera.processMouseMovement(this.rotationSpeed, 0);     // Look right
    }
}