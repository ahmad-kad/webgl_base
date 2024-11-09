class ViewerControls {
    constructor(renderer) {
        this.renderer = renderer;
        this.viewModes = [
            { name: 'RGB', value: 0 },
            { name: 'Alpha', value: 1 },
            { name: 'Depth', value: 2 },
            { name: 'Normal', value: 3 },
            { name: 'Curvature', value: 4 },
            { name: 'Edge', value: 5 }
        ];
        this.setupUI();
    }

    setupUI() {
        const container = document.createElement('div');
        container.className = 'viewer-controls';
        
        // View mode selector
        container.appendChild(this.createViewModeControl());
        
        // Point size control
        container.appendChild(this.createPointSizeControl());
        
        // Add styles
        this.addStyles();
        
        document.body.appendChild(container);
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
            this.renderer.setViewMode(parseInt(e.target.value));
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
            const size = parseFloat(e.target.value);
            this.renderer.setPointSize(size);
            value.textContent = size.toFixed(1);
        });
        
        pointSizeContainer.appendChild(slider);
        pointSizeContainer.appendChild(value);
        
        group.appendChild(label);
        group.appendChild(pointSizeContainer);
        return group;
    }

    addStyles() {
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
                min-width: 200px;
            }
            
            .control-group {
                margin-bottom: 15px;
            }
            
            .control-group:last-child {
                margin-bottom: 0;
            }
            
            .control-group label {
                display: block;
                margin-bottom: 5px;
                font-size: 14px;
            }
            
            .control-group select,
            .control-group input[type="range"] {
                width: 100%;
                padding: 5px;
                background: #333;
                border: 1px solid #555;
                border-radius: 3px;
                color: white;
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
            }
        `;
        document.head.appendChild(style);
    }
}