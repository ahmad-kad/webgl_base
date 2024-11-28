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

        this.colorProfiles = [
            { name: 'Turbo', value: 0 },
            { name: 'Jet', value: 1 },
            { name: 'Viridis', value: 2 },
            { name: 'Inferno', value: 3 }
        ];

        try {
            this.addStyles();
            this.setupUI();
            this.setupXRInteractions();
            this.setupResponsiveScaling();

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

        // Create a scrollable wrapper
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'viewer-controls-scroll';

        // File loader
        scrollWrapper.appendChild(this.createFileLoader());
        // Octree Controls
        scrollWrapper.appendChild(this.createOctreeControls());
        // Camera controls info
        scrollWrapper.appendChild(this.createCameraInfo());

        // View mode selector
        scrollWrapper.appendChild(this.createViewModeControl());

        // Point size control
        scrollWrapper.appendChild(this.createPointSizeControl());

        container.appendChild(scrollWrapper);
        document.body.appendChild(container);
    }

    setupResponsiveScaling() {
        // Initial scaling
        this.updateUIScale();

        // Update scaling on window resize
        window.addEventListener('resize', () => {
            this.updateUIScale();
        });
    }

    updateUIScale() {
        const controls = document.querySelector('.viewer-controls');
        if (!controls) return;

        // Get viewport dimensions
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

        // Calculate maximum height for the scrollable area
        const maxHeight = Math.max(vh * 0.8, 400); // At least 400px or 80% of viewport height
        controls.style.maxHeight = `${maxHeight}px`;
    }


    // Add this to your ViewerControls class
    createFileLoader() {
        const group = document.createElement('div');
        group.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = 'Load PLY File';

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.ply';  // Only accept PLY files for now
        fileInput.style.display = 'none';

        const button = document.createElement('button');
        button.textContent = 'Choose PLY File';
        button.className = 'file-button';

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.textContent = 'Select a PLY file to load';

        button.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            if (!file.name.toLowerCase().endsWith('.ply')) {
                fileInfo.textContent = 'Please select a PLY file';
                return;
            }

            fileInfo.textContent = `Loading: ${file.name}`;
            button.disabled = true;

            try {
                const reader = new FileReader();
                reader.onload = async (event) => {
                    try {
                        // Create a URL for the file
                        const url = URL.createObjectURL(new Blob([event.target.result]));

                        // Load the PLY file
                        await this.renderer.loadPLY(url);

                        fileInfo.textContent = `Loaded: ${file.name}`;

                        // Clean up the URL
                        URL.revokeObjectURL(url);
                    } catch (error) {
                        console.error('Error loading PLY:', error);
                        fileInfo.textContent = `Error: ${error.message}`;
                    } finally {
                        button.disabled = false;
                    }
                };

                reader.onerror = () => {
                    fileInfo.textContent = 'Error reading file';
                    button.disabled = false;
                };

                // Read as ArrayBuffer
                reader.readAsArrayBuffer(file);

            } catch (error) {
                console.error('Error processing file:', error);
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
                <strong>Movement:</strong> WASD Keys
            </div>
            <div class="control-info">
                <strong>Up/Down:</strong> Q/E Keys
            </div>
            <div class="control-info">
                <strong>Look Around:</strong> IJKL Keys
                <div class="sub-info">
                    I: Look Up | K: Look Down
                    J: Look Left | L: Look Right
                </div>
            </div>
            <div class="control-info">
                <strong>Point Select:</strong> Left Mouse Click
            </div>
            <div class="control-info">
                <strong>Reset Camera:</strong> F Key or Double Click
            </div>
        `;

        // Add additional styles for the sub-info
        const style = document.createElement('style');
        style.textContent = `
            .sub-info {
                margin-left: 15px;
                font-size: 0.9em;
                color: #aaa;
            }
            
            .control-info {
                margin-bottom: 8px;
            }
            
            .control-info:last-child {
                margin-bottom: 0;
            }
            
            .control-info strong {
                color: #4CAF50;
            }
            
            .camera-controls-info {
                line-height: 1.6;
                padding: 8px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
            }
        `;
        document.head.appendChild(style);

        group.appendChild(label);
        group.appendChild(controls);
        return group;
    }

    createOctreeControls() {
        const group = document.createElement('div');
        group.className = 'control-group';

        const label = document.createElement('label');
        label.textContent = 'Octree Visualization';

        // Single toggle container
        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'toggle-container';

        const toggleLabel = document.createElement('span');
        toggleLabel.textContent = 'Show Octree';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.id = 'octreeToggle';
        toggle.checked = this.renderer.useOctree && this.renderer.showOctreeDebug;

        // Single event listener to control both features
        toggle.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            this.renderer.useOctree = isEnabled;
            this.renderer.showOctreeDebug = isEnabled;
        });

        // Assemble the container
        toggleContainer.appendChild(toggleLabel);
        toggleContainer.appendChild(toggle);

        group.appendChild(label);
        group.appendChild(toggleContainer);

        return group;
    }

    createViewModeControl() {
        const group = document.createElement('div');
        group.className = 'control-group';

        // Create view mode section
        const viewModeSection = document.createElement('div');
        viewModeSection.className = 'control-section';

        const viewModeLabel = document.createElement('label');
        viewModeLabel.textContent = 'View Mode';

        const viewModeSelect = document.createElement('select');
        viewModeSelect.className = 'control-select';
        this.viewModes.forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.value;
            option.textContent = mode.name;
            viewModeSelect.appendChild(option);
        });

        viewModeSection.appendChild(viewModeLabel);
        viewModeSection.appendChild(viewModeSelect);

        // Create color profile section
        const colorProfileSection = document.createElement('div');
        colorProfileSection.className = 'control-section color-profile-section';
        // Initially hidden
        colorProfileSection.style.display = 'none';

        const colorProfileLabel = document.createElement('label');
        colorProfileLabel.textContent = 'Depth Color Profile';

        const colorProfileSelect = document.createElement('select');
        colorProfileSelect.className = 'control-select';
        [
            { name: 'Turbo', value: 0 },
            { name: 'Jet', value: 1 },
            { name: 'Viridis', value: 2 },
            { name: 'Inferno', value: 3 }
        ].forEach(profile => {
            const option = document.createElement('option');
            option.value = profile.value;
            option.textContent = profile.name;
            colorProfileSelect.appendChild(option);
        });

        colorProfileSection.appendChild(colorProfileLabel);
        colorProfileSection.appendChild(colorProfileSelect);

        // Create render mode section
        const renderModeSection = document.createElement('div');
        renderModeSection.className = 'control-section';

        const renderModeLabel = document.createElement('label');
        renderModeLabel.textContent = 'Render Mode';

        const renderModeSelect = document.createElement('select');
        renderModeSelect.className = 'control-select';
        ['Points', 'Mesh', 'Wireframe', 'Splat'].forEach(mode => {
            const option = document.createElement('option');
            option.value = mode.toLowerCase();
            option.textContent = mode;
            renderModeSelect.appendChild(option);
        });

        renderModeSection.appendChild(renderModeLabel);
        renderModeSection.appendChild(renderModeSelect);

        // Add event listeners
        viewModeSelect.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            this.renderer.setViewMode(value);
            // Show color profile selector only in depth view mode (mode 1)
            colorProfileSection.style.display = value === 1 ? 'block' : 'none';
        });

        colorProfileSelect.addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            this.renderer.setColorProfile?.(value); // Optional chaining in case method isn't implemented
        });

        renderModeSelect.addEventListener('change', (e) => {
            const mode = e.target.value;
            if (mode === 'wireframe') {
                this.renderer.setWireframe(true);
                this.renderer.setRenderMode('mesh');
            } else {
                this.renderer.setWireframe(false);
                this.renderer.setRenderMode(mode);
            }
        });

        // Add sections to group
        group.appendChild(viewModeSection);
        group.appendChild(colorProfileSection);
        group.appendChild(renderModeSection);

        // Add styles
        const styles = `
            .control-section {
                margin-bottom: 15px;
            }
            
            .control-section:last-child {
                margin-bottom: 0;
            }
            
            .color-profile-section {
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                margin: 10px 0;
            }
            
            .control-select {
                width: 100%;
                padding: 8px;
                background: #444;
                border: 1px solid #666;
                border-radius: 4px;
                color: white;
                margin-top: 5px;
            }
            
            .control-select:focus {
                outline: none;
                border-color: #888;
            }
        `;

        // Add styles if they don't exist
        if (!document.getElementById('view-mode-control-styles')) {
            const styleSheet = document.createElement('style');
            styleSheet.id = 'view-mode-control-styles';
            styleSheet.textContent = styles;
            document.head.appendChild(styleSheet);
        }

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

    setupResponsiveScaling() {
        // Initial scaling
        this.updateUIScale();

        // Update scaling on window resize
        window.addEventListener('resize', () => {
            this.updateUIScale();
        });
    }

    updateUIScale() {
        const controls = document.querySelector('.viewer-controls');
        if (!controls) return;

        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);

        const maxHeight = Math.max(vh * 0.8, 400);
        controls.style.maxHeight = `${maxHeight}px`;
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
                width: clamp(300px, 25vw, 400px);
                max-height: 80vh;
                z-index: 1000;
                pointer-events: auto;
                backdrop-filter: blur(10px);
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                display: flex;
                flex-direction: column;
            }

            .viewer-controls-scroll {
                overflow-y: auto;
                overflow-x: hidden;
                flex-grow: 1;
                padding-right: 10px; /* Space for scrollbar */
                scrollbar-width: thin;
                scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
            }

            /* Custom scrollbar styles */
            .viewer-controls-scroll::-webkit-scrollbar {
                width: 6px;
            }

            .viewer-controls-scroll::-webkit-scrollbar-track {
                background: rgba(0, 0, 0, 0.2);
                border-radius: 3px;
            }

            .viewer-controls-scroll::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.3);
                border-radius: 3px;
            }

            .viewer-controls-scroll::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.4);
            }
            
            /* Control Groups */
            .control-group {
                margin-bottom: 20px;
                padding: clamp(12px, 2vw, 20px);
                background: rgba(0, 0, 0, 0.8);
                border-radius: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                transition: transform 0.2s ease;
            }
            
            /* Labels */
            .control-group label {
                display: block;
                margin-bottom: 8px;
                font-size: clamp(14px, 1.2vw, 18px);
                font-weight: bold;
                color: #ddd;
            }
            
            /* Input Elements */
            .control-group select,
            .control-group input[type="range"] {
                width: 100%;
                padding: clamp(8px, 1vw, 12px);
                background: #444;
                border: 1px solid #666;
                border-radius: 8px;
                color: white;
                outline: none;
                height: clamp(36px, 4vh, 44px);
                margin: 10px 0;
                font-size: clamp(12px, 1vw, 16px);
            }
            
            /* File Button */
            .file-button {
                display: block;
                width: 100%;
                padding: clamp(10px, 1.5vw, 20px);
                background: #4CAF50;
                border: none;
                border-radius: 8px;
                color: white;
                cursor: pointer;
                font-size: clamp(14px, 1.2vw, 16px);
                height: clamp(40px, 5vh, 50px);
                transition: all 0.3s ease;
            }
            
            /* Point Size Container */
            .point-size-container {
                display: flex;
                align-items: center;
                gap: clamp(8px, 1vw, 12px);
            }
            
            .point-size-container input {
                flex: 1;
            }
            
            .point-size-container span {
                min-width: 30px;
                text-align: right;
                font-size: clamp(12px, 1vw, 16px);
            }
            
            /* Toggle Container */
            .toggle-container {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: clamp(8px, 1vw, 12px);
                height: clamp(40px, 5vh, 50px);
            }
            
            .toggle-container input[type="checkbox"] {
                width: clamp(40px, 4vw, 50px);
                height: clamp(20px, 2.5vh, 26px);
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .viewer-controls {
                    width: clamp(250px, 80vw, 350px);
                }
            }

            @media (max-height: 600px) {
                .viewer-controls {
                    max-height: 90vh;
                    top: 10px;
                }
            }

            /* Keep all your existing styles below this line */
            ${this.getExistingStyles()}
        `;

        document.head.appendChild(style);
    }

    getExistingStyles() {
        // Return all your existing styles here
        return `
            /* Control Groups */
            .control-group {
                margin-bottom: 20px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.8);
                border-radius: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
                transition: transform 0.2s ease;
            }
            
            /* ... (rest of your existing styles) ... */
        `;
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
        if (!('xr' in navigator)) {
            console.log('WebXR not supported');
            return;
        }

        try {
            const isSupported = await navigator.xr.isSessionSupported('immersive-vr');
            if (isSupported) {
                this.addVRButton();
            }
        } catch (error) {
            console.error('Error checking VR support:', error);
        }

        // Add VR button anyway to show unsupported state
        this.addVRButton();
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
