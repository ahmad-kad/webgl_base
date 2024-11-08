class Controls {
    constructor(camera, canvas) {
        this.camera = camera;
        this.canvas = canvas;
        
        this.keys = {};
        this.mouseDown = false;
        this.lastX = this.canvas.width / 2;
        this.lastY = this.canvas.height / 2;
        this.firstMouse = true;

        this.setupEventListeners();
    }

    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        
        document.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // Mouse events
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouseDown = true;
            this.canvas.style.cursor = 'grabbing';
        });

        document.addEventListener('mouseup', () => {
            this.mouseDown = false;
            this.canvas.style.cursor = 'grab';
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.mouseDown) return;

            if (this.firstMouse) {
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.firstMouse = false;
            }

            const xoffset = e.clientX - this.lastX;
            const yoffset = this.lastY - e.clientY; // Reversed since y-coordinates range from bottom to top

            this.lastX = e.clientX;
            this.lastY = e.clientY;

            this.camera.processMouseMovement(xoffset, yoffset);
        });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    update(deltaTime) {
        if (this.keys['w']) this.camera.processKeyboard('FORWARD', deltaTime);
        if (this.keys['s']) this.camera.processKeyboard('BACKWARD', deltaTime);
        if (this.keys['a']) this.camera.processKeyboard('LEFT', deltaTime);
        if (this.keys['d']) this.camera.processKeyboard('RIGHT', deltaTime);
        if (this.keys['q']) this.camera.processKeyboard('DOWN', deltaTime);
        if (this.keys['e']) this.camera.processKeyboard('UP', deltaTime);
    }
}