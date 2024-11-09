class ViewerControls {
    constructor(renderer) {
        this.renderer = renderer;
        this.viewModes = ['RGB', 'Alpha', 'Depth', 'Normal', 'Curvature', 'Edge'];
        this.currentMode = 0;
        this.setupUI();
    }

    setupUI() {
        const container = document.createElement('div');
        container.className = 'viewer-controls';
        
        // View mode selector
        const viewModeSelect = document.createElement('select');
        this.viewModes.forEach((mode, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = mode;
            viewModeSelect.appendChild(option);
        });
        
        viewModeSelect.addEventListener('change', (e) => {
            this.currentMode = parseInt(e.target.value);
            this.renderer.setViewMode(this.currentMode);
        });

        // Point size slider
        const sizeSlider = document.createElement('input');
        sizeSlider.type = 'range';
        sizeSlider.min = '1';
        sizeSlider.max = '10';
        sizeSlider.step = '0.1';
        sizeSlider.value = '1';
        
        sizeSlider.addEventListener('input', (e) => {
            this.renderer.setPointSize(parseFloat(e.target.value));
        });

        // Add controls to container
        container.appendChild(this.createControlGroup('View Mode', viewModeSelect));
        container.appendChild(this.createControlGroup('Point Size', sizeSlider));
        
        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .viewer-controls {
                position: fixed;
                top: 20px;
                left: 20px;
                background: rgba(0, 0, 0, 0.7);
                padding: 15px;
                border-radius: 5px;
                color: white;
                font-family: Arial, sans-serif;
            }
            
            .control-group {
                margin-bottom: 10px;
            }
            
            .control-group label {
                display: block;
                margin-bottom: 5px;
            }
            
            .control-group select,
            .control-group input {
                width: 100%;
                padding: 5px;
                border-radius: 3px;
                border: 1px solid #555;
                background: #333;
                color: white;
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(container);
    }

    createControlGroup(label, element) {
        const group = document.createElement('div');
        group.className = 'control-group';
        
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        
        group.appendChild(labelElement);
        group.appendChild(element);
        
        return group;
    }
}