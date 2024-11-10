export class ViewerControls {
    constructor(renderer) {
        if (!renderer) {
            throw new Error('ViewerControls requires a renderer instance');
        }
        
        this.renderer = renderer;
        this.viewModes = [
            { name: 'RGB', value: 0 },
            { name: 'Depth', value: 1 },
            { name: 'Normal', value: 2 },
            { name: 'Curvature', value: 3 },
            { name: 'Edge', value: 4 }
        ];
        
        try {
            // Add styles first
            this.addStyles();
            // Then setup UI
            this.setupUI();
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
        
        // Add styles
        this.addStyles();
        
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
            .viewer-controls {
                position: fixed;
                top: 20px;
                left: 20px;
                background: rgba(0, 0, 0, 0.8);
                padding: 15px;
                border-radius: 5px;
                color: white;
                font-family: Arial, sans-serif;
                min-width: 250px;
                z-index: 1000;
                pointer-events: auto;
            }
            
            .control-group {
                margin-bottom: 15px;
                padding-bottom: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.2);
            }
            
            .control-group:last-child {
                margin-bottom: 0;
                padding-bottom: 0;
                border-bottom: none;
            }
            
            .control-group label {
                display: block;
                margin-bottom: 8px;
                font-size: 14px;
                font-weight: bold;
                color: #ddd;
            }
            
            .control-group select,
            .control-group input[type="range"] {
                width: 100%;
                padding: 5px;
                background: #444;
                border: 1px solid #666;
                border-radius: 3px;
                color: white;
                outline: none;
            }
            
            .file-button {
                display: block;
                width: 100%;
                padding: 8px;
                background: #4CAF50;
                border: none;
                border-radius: 3px;
                color: white;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.3s;
            }
            
            .file-button:hover {
                background: #45a049;
            }
            
            .file-button:disabled {
                background: #666;
                cursor: not-allowed;
            }
            
            .file-info {
                margin-top: 8px;
                font-size: 12px;
                color: #ccc;
            }
            
            .camera-controls-info {
                font-size: 13px;
                line-height: 1.6;
            }
            
            .control-info {
                margin-bottom: 4px;
                color: #ddd;
            }
            
            .control-info strong {
                color: #4CAF50;
            }
            
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
                font-size: 14px;
                color: #ddd;
            }
            
            /* Custom range input styling */
            input[type="range"] {
                -webkit-appearance: none;
                margin: 10px 0;
                background: transparent;
            }
            
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                height: 16px;
                width: 16px;
                border-radius: 50%;
                background: #4CAF50;
                cursor: pointer;
                margin-top: -6px;
            }
            
            input[type="range"]::-webkit-slider-runnable-track {
                width: 100%;
                height: 4px;
                background: #666;
                border-radius: 2px;
            }
            
            select {
                appearance: none;
                padding: 8px !important;
                background: #444 url('data:image/svg+xml;utf8,<svg fill="white" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>') no-repeat right 8px center !important;
                background-size: 16px !important;
                cursor: pointer;
            }
            
            select:focus {
                border-color: #4CAF50;
            }
        `;
        document.head.appendChild(style);
    }

    
}
