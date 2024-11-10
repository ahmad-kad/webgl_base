// XRControls.js
export class XRControls {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.xrSession = null;
        this.referenceSpace = null;
        this.controllers = [];
        this.device = null; // 'quest' or 'visionpro'
        
        this.setupXRButton();
        // Only setup XR if supported
        if ('xr' in navigator) {
            this.setupXREvents();
        }
    }

    setupXRButton() {
        let xrButton = document.getElementById('xr-button');
        if (!xrButton) {
            xrButton = document.createElement('button');
            xrButton.id = 'xr-button';
            xrButton.className = 'xr-button';
            xrButton.textContent = 'Enter VR';
            xrButton.style.display = 'none';
            document.body.appendChild(xrButton);
        }
        this.xrButton = xrButton;

        if ('xr' in navigator) {
            navigator.xr.isSessionSupported('immersive-vr')
                .then((supported) => {
                    if (supported) {
                        this.xrButton.style.display = 'block';
                        this.xrButton.addEventListener('click', () => this.startXRSession());
                    }
                });
        }
    }

    setupXREvents() {
        // Handle XR input sources
        if ('xr' in navigator) {
            window.addEventListener('vrdisplayconnect', () => {
                console.log('VR display connected');
            });

            window.addEventListener('vrdisplaydisconnect', () => {
                console.log('VR display disconnected');
            });
        }
    }

    async startXRSession() {
        if (!this.xrSession) {
            try {
                // Request session with universal features
                const session = await navigator.xr.requestSession('immersive-vr', {
                    requiredFeatures: ['local-floor'],
                    optionalFeatures: ['hand-tracking']
                });

                this.xrSession = session;
                this.xrButton.textContent = 'Exit VR';

                // Setup session
                await this.setupXRSession(session);

                // Detect device type
                this.detectDevice(session);

                // Setup device-specific controls
                if (this.device === 'quest') {
                    this.setupQuestControls(session);
                } else if (this.device === 'visionpro') {
                    this.setupVisionProControls(session);
                }

                session.addEventListener('end', () => {
                    this.xrSession = null;
                    this.xrButton.textContent = 'Enter VR';
                });

            } catch (error) {
                console.error('Error starting XR session:', error);
            }
        } else {
            // End existing session
            try {
                await this.xrSession.end();
            } catch (error) {
                console.error('Error ending XR session:', error);
            }
        }
    }

    detectDevice(session) {
        if (session.inputSources?.[0]?.profiles?.includes('oculus-touch')) {
            this.device = 'quest';
        } else if ('ongesturechange' in window) {
            this.device = 'visionpro';
        }
        console.log('Detected XR device:', this.device);
    }

    async setupXRSession(session) {
        try {
            const gl = this.renderer.gl;
            const xrGLLayer = new XRWebGLLayer(session, gl);
            session.updateRenderState({ baseLayer: xrGLLayer });

            // Get reference space
            this.referenceSpace = await session.requestReferenceSpace('local-floor');

            // Start render loop
            session.requestAnimationFrame((time, frame) => this.onXRFrame(time, frame));
        } catch (error) {
            console.error('Error setting up XR session:', error);
            throw error;
        }
    }

    setupQuestControls(session) {
        session.addEventListener('inputsourceschange', (event) => {
            event.added.forEach(inputSource => {
                if (inputSource.handedness) {
                    this.controllers.push({
                        inputSource,
                        gripSpace: inputSource.gripSpace,
                        targetRaySpace: inputSource.targetRaySpace
                    });
                }
            });

            event.removed.forEach(inputSource => {
                const index = this.controllers.findIndex(c => c.inputSource === inputSource);
                if (index !== -1) {
                    this.controllers.splice(index, 1);
                }
            });
        });
    }

    setupVisionProControls(session) {
        if ('ongesturechange' in window) {
            window.addEventListener('gesturechange', (e) => {
                this.handleVisionProGesture(e);
            });
        }
    }

    handleVisionProGesture(event) {
        if (event.scale) {
            const zoomDelta = (event.scale - 1.0) * 0.1;
            this.camera.position[2] += zoomDelta;
        }
    }

    onXRFrame(time, frame) {
        const session = frame.session;
        if (!session) return;

        // Request next frame
        session.requestAnimationFrame((t, f) => this.onXRFrame(t, f));

        const pose = frame.getViewerPose(this.referenceSpace);
        if (!pose) return;

        // Handle device-specific input
        if (this.device === 'quest') {
            this.controllers.forEach(controller => {
                if (controller.inputSource.gamepad) {
                    this.handleQuestController(frame, controller.inputSource);
                }
            });
        }

        // Update camera from pose
        const view = pose.views[0];
        if (view) {
            this.updateCameraFromXRPose(view);
        }
    }

    handleQuestController(frame, inputSource) {
        if (!inputSource.gamepad) return;

        const { buttons, axes } = inputSource.gamepad;

        // Handle thumbstick movement
        if (Math.abs(axes[0]) > 0.1 || Math.abs(axes[1]) > 0.1) {
            this.camera.position[0] += axes[0] * 0.1;
            this.camera.position[2] -= axes[1] * 0.1;
        }

        // Handle buttons
        buttons.forEach((button, index) => {
            if (button.pressed) {
                switch (index) {
                    case 0: // Trigger
                        this.toggleSelection();
                        break;
                    case 1: // Grip
                        this.toggleGrab();
                        break;
                    case 3: // Thumbstick button
                        this.resetView();
                        break;
                }
            }
        });
    }

    updateCameraFromXRPose(view) {
        const matrix = view.transform.matrix;
        
        // Update camera position
        this.camera.position = [
            matrix[12],
            matrix[13],
            matrix[14]
        ];

        // Update camera rotation based on view matrix
        this.camera.rotation = {
            y: Math.atan2(matrix[8], matrix[10]),
            x: Math.atan2(-matrix[9], Math.sqrt(matrix[8] * matrix[8] + matrix[10] * matrix[10]))
        };
    }

    resetView() {
        this.camera.position = [0, 1.6, 3];
        this.camera.rotation = { x: 0, y: 0, z: 0 };
    }

    toggleSelection() {
        // Implement selection logic here
        console.log('Selection toggled');
    }

    toggleGrab() {
        // Implement grab logic here
        console.log('Grab toggled');
    }
}