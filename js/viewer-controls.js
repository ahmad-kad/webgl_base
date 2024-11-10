export class ViewerControls {
    constructor(renderer) {
        if (!renderer) {
            throw new Error('ViewerControls requires a renderer instance');
        }
        
        this.renderer = renderer;
        this.xrControls = null;
        
        this.viewModes = [
            { name: 'RGB', value: 0 },
            { name: 'Depth', value: 1 },
            { name: 'Normal', value: 2 },
            { name: 'Curvature', value: 3 },
            { name: 'Edge', value: 4 }
        ];
        
        try {
            this.addStyles();
            this.setupUI();
            this.setupXRInteractions()
            
            console.log('ViewerControls initialized successfully');
        } catch (error) {
            console.error('Error setting up viewer controls:', error);
            throw error;
        }
    }

    setupUI() {
        // Remove any existing controls
        const existingControls = document.querySelector('.viewer-controls');
        if (existingControls) {
            existingControls.remove();
        }

        const container = document.createElement('div');
        container.className = 'viewer-controls';
        
        // File loader
        container.appendChild(this.createFileLoader());

        // Camera controls info
        container.appendChild(this.createCameraInfo());
        
        // View mode selector
        container.appendChild(this.createViewModeControl());
        
        // Point size control
        container.appendChild(this.createPointSizeControl());
        
        document.body.appendChild(container);
    }

    // Add this to your ViewerControls class
    createFileLoader() {
        const group = document.createElement('div');
        group.className = 'control-group';
        
        const label = document.createElement('label');
        label.textContent = 'Load 3D File';
        
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.ply,.obj,.fbx';
        fileInput.style.display = 'none';
        
        const button = document.createElement('button');
        button.textContent = 'Choose 3D File (PLY, OBJ, FBX)';
        button.className = 'file-button';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.textContent = 'Supported formats: PLY, OBJ, FBX';
        
        button.addEventListener('click', () => {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const fileExtension = file.name.split('.').pop().toLowerCase();
            if (!['ply', 'obj', 'fbx'].includes(fileExtension)) {
                fileInfo.textContent = 'Unsupported file format';
                return;
            }
            
            fileInfo.textContent = `Loading: ${file.name}`;
            button.disabled = true;
            
            try {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        const text = event.target.result;
                        await this.renderer.loadModel(text, fileExtension);
                        fileInfo.textContent = `Loaded: ${file.name}`;
                    } catch (error) {
                        console.error('Error processing file:', error);
                        fileInfo.textContent = `Error: ${error.message}`;
                    } finally {
                        button.disabled = false;
                    }
                };
                
                reader.onerror = () => {
                    fileInfo.textContent = 'Error reading file';
                    button.disabled = false;
                };
                
                reader.readAsText(file);
            } catch (error) {
                console.error('Error loading file:', error);
                fileInfo.textContent = `Error: ${error.message}`;
                button.disabled = false;
            }
        });
        
        group.appendChild(label);
        group.appendChild(button);
        group.appendChild(fileInfo);
        group.appendChild(fileInput);
        
        return group;
    }

    createCameraInfo() {
        const group = document.createElement('div');
        group.className = 'control-group camera-info';
        
        const label = document.createElement('label');
        label.textContent = 'Camera Controls';
        
        const controls = document.createElement('div');
        controls.className = 'camera-controls-info';
        controls.innerHTML = `
            <div class="control-info">
                <strong>Orbit:</strong> Left Mouse Button
            </div>
            <div class="control-info">
                <strong>Pan:</strong> Middle Mouse Button or Alt + Left Mouse
            </div>
            <div class="control-info">
                <strong>Zoom:</strong> Mouse Wheel or Right Mouse Button
            </div>
            <div class="control-info">
                <strong>Reset:</strong> Double Click
            </div>
        `;
        
        group.appendChild(label);
        group.appendChild(controls);
        
        return group;
    }

    createViewModeControl() {
        const group = document.createElement('div');
        group.className = 'control-group';
        
        const label = document.createElement('label');
        label.textContent = 'View Mode';
        
        const select = document.createElement('select');
        this.viewModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.value;
            option.textContent = mode.name;
            select.appendChild(option);
        });
        
        select.addEventListener('change', (e) => {
            try {
                const value = parseInt(e.target.value);
                if (!isNaN(value)) {
                    this.renderer.setViewMode(value);
                }
            } catch (error) {
                console.error('Error changing view mode:', error);
            }
        });
        
        group.appendChild(label);
        group.appendChild(select);
        return group;
    }

    createPointSizeControl() {
        const group = document.createElement('div');
        group.className = 'control-group';
        
        const label = document.createElement('label');
        label.textContent = 'Point Size';
        
        const pointSizeContainer = document.createElement('div');
        pointSizeContainer.className = 'point-size-container';
        
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.id = 'pointSizeSlider';
        slider.min = '1';
        slider.max = '10';
        slider.step = '0.1';
        slider.value = '1';
        
        const value = document.createElement('span');
        value.textContent = '1.0';
        
        slider.addEventListener('input', (e) => {
            try {
                const size = parseFloat(e.target.value);
                if (!isNaN(size)) {
                    this.renderer.setPointSize(size);
                    value.textContent = size.toFixed(1);
                }
            } catch (error) {
                console.error('Error updating point size:', error);
            }
        });
        
        pointSizeContainer.appendChild(slider);
        pointSizeContainer.appendChild(value);
        
        group.appendChild(label);
        group.appendChild(pointSizeContainer);
        return group;
    }
    
    addStyles() {
        const styleId = 'viewer-controls-styles';
        
        // Remove existing styles if they exist
        const existingStyles = document.getElementById(styleId);
        if (existingStyles) {
            existingStyles.remove();
        }

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* Base UI Styles */
            .viewer-controls {
                position: fixed;
                top: 20px;
                left: 20px;
                background: rgba(0, 0, 0, 0.8);
                padding: 15px;
                border-radius: 15px;
                color: white;
                font-family: Arial, sans-serif;
                min-width: 300px;
                z-index: 1000;
                pointer-events: auto;

                /* Spatial/XR Optimizations */
                transform-style: preserve-3d;
                transform: translateZ(-1m);
                font-size: 18px;
                line-height: 1.5;
                letter-spacing: 0.5px;
                backdrop-filter: blur(10px);
            }
            
            /* Control Groups */
            .control-group {
                margin-bottom: 20px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                transition: transform 0.2s ease;
            }
            
            .control-group:last-child {
                margin-bottom: 0;
                padding-bottom: 0;
                border-bottom: none;
            }
            
            /* Labels */
            .control-group label {
                display: block;
                margin-bottom: 8px;
                font-size: 16px;
                font-weight: bold;
                color: #ddd;
            }
            
            /* Input Elements */
            .control-group select,
            .control-group input[type="range"] {
                width: 100%;
                padding: 12px;
                background: #444;
                border: 1px solid #666;
                border-radius: 8px;
                color: white;
                outline: none;
                min-height: 44px;
                margin: 10px 0;
            }
            
            /* File Button */
            .file-button {
                display: block;
                width: 100%;
                padding: 12px 20px;
                background: #4CAF50;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s ease;
                min-height: 44px;
            }
            
            .file-button:hover {
                background: #45a049;
                transform: scale(1.02);
            }
            
            .file-button:disabled {
                background: #666;
                cursor: not-allowed;
            }
            
            /* Info Text */
            .file-info {
                margin-top: 10px;
                font-size: 14px;
                color: #ccc;
            }
            
            /* Camera Controls Info */
            .camera-controls-info {
                font-size: 14px;
                line-height: 1.6;
            }
            
            .control-info {
                margin-bottom: 6px;
                color: #ddd;
            }
            
            .control-info strong {
                color: #4CAF50;
            }
            
            /* Point Size Container */
            .point-size-container {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .point-size-container input {
                flex: 1;
            }
            
            .point-size-container span {
                min-width: 30px;
                text-align: right;
                font-size: 16px;
                color: #ddd;
            }
            
            /* Range Input Styling */
            input[type="range"] {
                -webkit-appearance: none;
                margin: 10px 0;
                background: transparent;
                touch-action: none;
            }
            
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                height: 30px;
                width: 30px;
                border-radius: 50%;
                background: #4CAF50;
                cursor: pointer;
                margin-top: -14px;
                border: 2px solid rgba(255, 255, 255, 0.3);
            }
            
            input[type="range"]::-webkit-slider-runnable-track {
                width: 100%;
                height: 4px;
                background: #666;
                border-radius: 2px;
            }
            
            /* Select Element Styling */
            select {
                appearance: none;
                padding: 12px !important;
                background: #444 url('data:image/svg+xml;utf8,<svg fill="white" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>') no-repeat right 8px center !important;
                background-size: 16px !important;
                cursor: pointer;
                touch-action: none;
            }
            
            select:focus {
                border-color: #4CAF50;
            }

            /* XR-specific Interactions */
            .viewer-controls .control-group:hover,
            .viewer-controls .control-group.active {
                transform: scale(1.05);
            }

            .xr-hover {
                outline: 2px solid #4CAF50;
                transform: scale(1.05);
                box-shadow: 0 0 15px rgba(76, 175, 80, 0.3);
            }

            /* Responsive Layout */
            @media (max-width: 768px) {
                .viewer-controls {
                    min-width: 250px;
                }
                
                .control-group {
                    padding: 12px;
                }
                
                .file-button,
                .control-group select,
                .control-group input[type="range"] {
                    padding: 10px;
                }
            }

            /* VR Mode Optimizations */
            .vr-mode .viewer-controls {
                transform: translateZ(-0.5m) scale(1.5);
                opacity: 0.95;
            }

            .vr-mode .control-group {
                margin-bottom: 25px;
            }

            .vr-mode input[type="range"]::-webkit-slider-thumb {
                height: 40px;
                width: 40px;
            }
        `;
        
        document.head.appendChild(style);
    }

    setupSpatialEvents() {
        // Handle spatial selection events
        document.addEventListener('select', (e) => {
            if (e.target.closest('.viewer-controls')) {
                // Handle UI interaction in spatial context
                e.target.click();
            }
        });

        // Handle hover states
        document.addEventListener('beforexrselect', (e) => {
            const control = e.target.closest('.control-group');
            if (control) {
                control.style.transform = 'scale(1.1)';
            }
        });
    }

    setupXRInteractions() {
        // For Vision Pro gestures
        window.addEventListener('gesturestart', (e) => this.handleGestureStart(e));
        window.addEventListener('gesturechange', (e) => this.handleGestureChange(e));
        window.addEventListener('gestureend', (e) => this.handleGestureEnd(e));

        // For Quest controller interaction
        this.activeControl = null;
        this.isDragging = false;
        this.lastPointerPosition = { x: 0, y: 0 };

        // Add ray intersection detection for Quest controllers
        document.addEventListener('controller-ray-intersect', (e) => {
            const { element, controller } = e.detail;
            if (element.closest('.viewer-controls')) {
                this.handleControllerIntersection(element, controller);
            }
        });
    }

    handleGestureStart(e) {
        // Find the control element under the gesture
        const control = document.elementFromPoint(e.clientX, e.clientY);
        if (control) {
            if (control.type === 'range') {
                // Handle slider interaction
                this.activeControl = control;
                this.initialValue = parseFloat(control.value);
                this.lastX = e.clientX;
            } else if (control.tagName === 'SELECT') {
                // Handle view mode selection
                this.activeControl = control;
            }
        }
    }

    handleGestureChange(e) {
        if (!this.activeControl) return;
    
        if (this.activeControl.type === 'range') {
            // Handle slider movement
            let delta;
            if (e.scale) {
                // Pinch gesture
                delta = (e.scale - 1.0) * 5.0; // Increased sensitivity
            } else if (e.clientX) {
                // Drag gesture
                delta = (e.clientX - this.lastX) / 100;
                this.lastX = e.clientX;
            }
    
            if (delta) {
                const range = this.activeControl.max - this.activeControl.min;
                const newValue = parseFloat(this.activeControl.value) + (delta * range);
                
                // Update slider value
                this.activeControl.value = Math.min(Math.max(newValue, this.activeControl.min), this.activeControl.max);
                
                // Update point size
                if (this.activeControl.id === 'pointSizeSlider') {
                    this.renderer.setPointSize(parseFloat(this.activeControl.value));
                    // Update display value
                    const valueDisplay = this.activeControl.parentNode.querySelector('span');
                    if (valueDisplay) {
                        valueDisplay.textContent = parseFloat(this.activeControl.value).toFixed(1);
                    }
                }
            }
        } else if (this.activeControl.tagName === 'SELECT') {
            // Handle view mode selection with rotation gesture
            const rotationDelta = e.rotation;
            if (Math.abs(rotationDelta) > 45) { // Threshold for view mode change
                const currentIndex = this.activeControl.selectedIndex;
                const newIndex = rotationDelta > 0 ? 
                    (currentIndex + 1) % this.activeControl.options.length :
                    (currentIndex - 1 + this.activeControl.options.length) % this.activeControl.options.length;
                
                this.activeControl.selectedIndex = newIndex;
                this.renderer.setViewMode(parseInt(this.activeControl.value));
            }
        }
    }

    handleGestureEnd(e) {
        this.activeControl = null;
        this.initialValue = null;
    }

    // For Quest controller interaction
    handleControllerIntersection(element, controller) {
        const prevHover = document.querySelector('.xr-hover');
        if (prevHover) prevHover.classList.remove('xr-hover');
        
        const controlGroup = element.closest('.control-group');
        if (controlGroup) {
            controlGroup.classList.add('xr-hover');
        }
    
        if (controller.buttons[0].pressed) { // Trigger button
            if (element.type === 'range') {
                // Handle slider
                const rect = element.getBoundingClientRect();
                const percentage = (controller.position.x - rect.left) / rect.width;
                const newValue = element.min + (percentage * (element.max - element.min));
                element.value = Math.min(Math.max(newValue, element.min), element.max);
                
                if (element.id === 'pointSizeSlider') {
                    this.renderer.setPointSize(parseFloat(element.value));
                }
            } else if (element.tagName === 'SELECT') {
                // Handle view mode selection
                element.selectedIndex = (element.selectedIndex + 1) % element.options.length;
                this.renderer.setViewMode(parseInt(element.value));
            }
        }
    }
    setXRControls(xrControls) {
        this.xrControls = xrControls;
        this.checkVRSupport();
    }


    async checkVRSupport() {
        if (!this.xrControls || !('xr' in navigator)) return;
        
        try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (isSupported) {
                this.addVRButton();
            }
        } catch (error) {
            console.error('Error checking VR support:', error);
        }
    }

    addVRButton() {
        const container = document.querySelector('.viewer-controls');
        if (!container) return;

        // Create VR control group
        const group = document.createElement('div');
        group.className = 'control-group vr-control';

        const label = document.createElement('label');
        label.textContent = 'Virtual Reality';

        const vrButton = document.createElement('button');
        vrButton.className = 'vr-button';
        vrButton.innerHTML = `
            <svg class="vr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20.5 7H3.5C2.67157 7 2 7.67157 2 8.5V15.5C2 16.3284 2.67157 17 3.5 17H20.5C21.3284 17 22 16.3284 22 15.5V8.5C22 7.67157 21.3284 7 20.5 7Z" stroke="currentColor" stroke-width="2"/>
                <circle cx="8" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
                <circle cx="16" cy="12" r="2" stroke="currentColor" stroke-width="2"/>
            </svg>
            Enter VR Mode
        `;

        // Add status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'vr-status';
        statusIndicator.textContent = 'VR Ready';

        vrButton.addEventListener('click', () => this.handleVRButtonClick(vrButton, statusIndicator));

        group.appendChild(label);
        group.appendChild(vrButton);
        group.appendChild(statusIndicator);
        container.appendChild(group);

        // Add specific styles for the VR button
        this.addVRButtonStyles();
    }

    async handleVRButtonClick(button, statusIndicator) {
        if (!this.xrControls) return;
    
        try {
            if (!this.xrControls.xrSession) {
                button.disabled = true;
                statusIndicator.textContent = 'Starting VR...';
                
                await this.xrControls.startXRSession();
                
                button.innerHTML = `
                    <svg class="vr-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z" fill="currentColor"/>
                    </svg>
                    Exit VR Mode
                `;
                statusIndicator.textContent = 'VR Active';
                statusIndicator.classList.add('active');
                document.body.classList.add('vr-mode');
                
            } else {
                await this.xrControls.xrSession.end();
            }
            button.disabled = false;
        } catch (error) {
            console.error('Error handling VR mode:', error);
            statusIndicator.textContent = 'VR Error';
            statusIndicator.classList.add('error');
            button.disabled = false;
            setTimeout(() => {
                statusIndicator.textContent = 'VR Ready';
                statusIndicator.classList.remove('error');
            }, 3000);
        }
    }

    addVRButtonStyles() {
        const styleSheet = document.querySelector('#viewer-controls-styles');
        if (!styleSheet) return;

        const vrStyles = `
            /* VR Button Styles */
            .vr-control {
                margin-top: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                padding-top: 20px;
            }

            .vr-button {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                width: 100%;
                padding: 12px 20px;
                background: #2196F3;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s ease;
                min-height: 44px;
            }

            .vr-button:hover {
                background: #1976D2;
                transform: scale(1.02);
            }

            .vr-icon {
                width: 24px;
                height: 24px;
            }

            .vr-status {
                margin-top: 8px;
                font-size: 14px;
                color: #888;
                text-align: center;
                transition: all 0.3s ease;
            }

            .vr-status.active {
                color: #4CAF50;
            }

            .vr-status.error {
                color: #F44336;
            }

            /* VR Mode specific styles */
            .vr-mode .viewer-controls {
                opacity: 0.9;
                transform: scale(1.2);
            }

            .vr-mode .vr-button {
                background: #F44336;
            }

            .vr-mode .vr-button:hover {
                background: #D32F2F;
            }

            /* Hover effects for VR interaction */
            .vr-button.xr-hover {
                transform: scale(1.1);
                box-shadow: 0 0 20px rgba(33, 150, 243, 0.4);
            }

            @media (max-width: 768px) {
                .vr-button {
                    padding: 10px 15px;
                    font-size: 14px;
                }

                .vr-icon {
                    width: 20px;
                    height: 20px;
                }
            }
        `;

        styleSheet.textContent += vrStyles;
    }
}
