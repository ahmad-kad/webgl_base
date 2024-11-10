// XRControls.js
export class XRControls {
    constructor(renderer, camera) {
        this.renderer = renderer;
        this.camera = camera;
        this.xrSession = null;
        this.referenceSpace = null;
        this.controllers = [];
        this.device = null; // 'quest' or 'visionpro'
        this.handTracking = {
            enabled: false,
            joints: new Map(),
            gestures: new Map()
        };
        
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
                // Request session with enhanced features for Vision Pro
                const sessionInit = {
                    requiredFeatures: ['local-floor'],
                    optionalFeatures: [
                        'hand-tracking',
                        'eye-tracking',
                        'spatial-anchors',
                        'plane-detection',
                        'mesh-detection'
                    ]
                };

                const session = await navigator.xr.requestSession('immersive-vr', sessionInit);
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
                    await this.setupVisionProControls(session);
                }

                session.addEventListener('end', () => {
                    this.xrSession = null;
                    this.xrButton.textContent = 'Enter VR';
                    this.cleanupVisionProTracking();
                });

            } catch (error) {
                console.error('Error starting XR session:', error);
            }
        } else {
            try {
                await this.xrSession.end();
            } catch (error) {
                console.error('Error ending XR session:', error);
            }
        }
    }

    detectDevice(session) {
        // Enhanced device detection for Vision Pro
        if (session.inputSources?.[0]?.profiles?.includes('oculus-touch')) {
            this.device = 'quest';
        } else if (
            'ongesturechange' in window || 
            navigator.userAgent.includes('AppleWebKit') && 
            session.environmentBlendMode === 'mixed'
        ) {
            this.device = 'visionpro';
        }
        console.log('Detected XR device:', this.device);
    }

    async setupXRSession(session) {
        try {
            const gl = this.renderer.gl;
            const xrGLLayer = new XRWebGLLayer(session, gl);
            session.updateRenderState({ baseLayer: xrGLLayer });

            // Get reference space with enhanced stability
            this.referenceSpace = await session.requestReferenceSpace('local-floor');

            // Start render loop
            session.requestAnimationFrame((time, frame) => this.onXRFrame(time, frame));
        } catch (error) {
            console.error('Error setting up XR session:', error);
            throw error;
        }
    }

    async setupVisionProControls(session) {
        // Setup Vision Pro specific features
        try {
            // Initialize hand tracking if available
            if (session.supportedFeatures?.has('hand-tracking')) {
                this.handTracking.enabled = true;
                await this.setupHandTracking(session);
            }

            // Setup pinch gesture recognition
            this.setupPinchGestureRecognition();

            // Setup spatial event handlers
            this.setupSpatialEventHandlers(session);

            // Setup eye tracking if available
            if (session.supportedFeatures?.has('eye-tracking')) {
                await this.setupEyeTracking(session);
            }

        } catch (error) {
            console.error('Error setting up Vision Pro controls:', error);
        }
    }

    async setupHandTracking(session) {
        session.addEventListener('inputsourceschange', (event) => {
            event.added.forEach(inputSource => {
                if (inputSource.hand) {
                    this.handTracking.joints.set(inputSource.handedness, new Map());
                }
            });

            event.removed.forEach(inputSource => {
                if (inputSource.hand) {
                    this.handTracking.joints.delete(inputSource.handedness);
                }
            });
        });
    }

    setupPinchGestureRecognition() {
        this.handTracking.gestures.set('pinch', {
            active: false,
            startPosition: null,
            threshold: 0.02 // meters
        });
    }

    setupSpatialEventHandlers(session) {
        if (session.supportedFeatures?.has('spatial-anchors')) {
            session.addEventListener('spatial-anchor-create', this.handleSpatialAnchor.bind(this));
        }

        if (session.supportedFeatures?.has('plane-detection')) {
            session.addEventListener('plane-detected', this.handlePlaneDetection.bind(this));
        }
    }

    async setupEyeTracking(session) {
        try {
            const eyeTracker = await session.requestEyeTracker();
            eyeTracker.addEventListener('eyetrack', this.handleEyeTracking.bind(this));
        } catch (error) {
            console.warn('Eye tracking not available:', error);
        }
    }

    handleSpatialAnchor(event) {
        const anchor = event.anchor;
        // Handle spatial anchor creation
        console.log('Spatial anchor created:', anchor);
    }

    handlePlaneDetection(event) {
        const plane = event.plane;
        // Handle detected plane
        console.log('Plane detected:', plane);
    }

    handleEyeTracking(event) {
        const gazePoint = event.gazePoint;
        if (gazePoint) {
            // Handle gaze point data
            console.log('Gaze point:', gazePoint);
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
            this.handleQuestFrame(frame);
        } else if (this.device === 'visionpro') {
            this.handleVisionProFrame(frame);
        }

        // Update camera from pose
        const view = pose.views[0];
        if (view) {
            this.updateCameraFromXRPose(view);
        }
    }

    handleVisionProFrame(frame) {
        if (!this.handTracking.enabled) return;

        for (const inputSource of frame.session.inputSources) {
            if (inputSource.hand) {
                this.updateHandJoints(frame, inputSource);
                this.detectPinchGesture(inputSource.handedness);
            }
        }
    }

    updateHandJoints(frame, inputSource) {
        const hand = inputSource.hand;
        const handJoints = this.handTracking.joints.get(inputSource.handedness);

        for (const joint of hand.values()) {
            const pose = frame.getJointPose(joint, this.referenceSpace);
            if (pose) {
                handJoints.set(joint.jointName, pose);
            }
        }
    }

    detectPinchGesture(handedness) {
        const joints = this.handTracking.joints.get(handedness);
        if (!joints) return;

        const thumb = joints.get('thumb-tip');
        const index = joints.get('index-finger-tip');

        if (thumb && index) {
            const distance = this.calculateJointDistance(thumb, index);
            const pinchData = this.handTracking.gestures.get('pinch');

            if (distance < pinchData.threshold && !pinchData.active) {
                this.startPinchGesture(thumb.transform.position);
            } else if (distance >= pinchData.threshold && pinchData.active) {
                this.endPinchGesture();
            }
        }
    }

    calculateJointDistance(joint1, joint2) {
        const pos1 = joint1.transform.position;
        const pos2 = joint2.transform.position;
        return Math.sqrt(
            Math.pow(pos2.x - pos1.x, 2) +
            Math.pow(pos2.y - pos1.y, 2) +
            Math.pow(pos2.z - pos1.z, 2)
        );
    }

    startPinchGesture(position) {
        const pinchData = this.handTracking.gestures.get('pinch');
        pinchData.active = true;
        pinchData.startPosition = position;
        this.handlePinchStart(position);
    }

    endPinchGesture() {
        const pinchData = this.handTracking.gestures.get('pinch');
        pinchData.active = false;
        pinchData.startPosition = null;
        this.handlePinchEnd();
    }

    handlePinchStart(position) {
        // Handle pinch gesture start
        console.log('Pinch gesture started at:', position);
    }

    handlePinchEnd() {
        // Handle pinch gesture end
        console.log('Pinch gesture ended');
    }

    cleanupVisionProTracking() {
        this.handTracking.joints.clear();
        this.handTracking.gestures.clear();
        this.handTracking.enabled = false;
    }

    // Existing methods remain unchanged...
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
}