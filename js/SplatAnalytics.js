export class SplatAnalytics {
    constructor() {
        this.initializeState();
        this.initializeUI();
        this.setupEventListeners();
        this.setupDensityHover();

        this.colorMode = 'scene';
        this.addColorModeToggle();
    }

    addColorModeToggle() {
        const toggle = document.createElement('div');
        toggle.className = 'color-mode-toggle';
        toggle.style.cssText = `
            margin: 10px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        `;

        const label = document.createElement('label');
        label.textContent = 'Color Mode:';
        label.style.fontSize = '12px';

        const select = document.createElement('select');
        select.style.cssText = `
            background: rgba(255, 255, 255, 0.1);
            border: none;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
        `;

        const options = ['Scene Colors', 'Rendered Colors'];
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.toLowerCase().split(' ')[0];
            option.textContent = opt;
            select.appendChild(option);
        });

        select.addEventListener('change', (e) => {
            this.colorMode = e.target.value;
            this.updateVisualization();
        });

        toggle.appendChild(label);
        toggle.appendChild(select);
        this.container.insertBefore(toggle, this.canvas);
    }

    // State initialization
    initializeState() {
        this.activeTab = 'size';
        this.data = {
            sizes: [],
            opacities: [],
            densities: {
                grid: [],
                bounds: null
            },
            colors: {
                clusters: [],
                stats: {}
            }
        };
        this.mousePosition = { x: 0, y: 0 };
        this.isDragging = false;
    }

    // UI initialization
    initializeUI() {
        this.container = this.createContainer();
        this.statsPanel = this.createStatsPanel();
        this.tabsContainer = this.createTabsContainer();
        this.canvas = this.createCanvas();
        this.ctx = this.canvas.getContext('2d');

        this.container.appendChild(this.statsPanel);
        this.container.appendChild(this.tabsContainer);
        this.container.appendChild(this.canvas);
        document.body.appendChild(this.container);

        this.updateUIScale();
    }

    // Container creation
    createContainer() {
        const container = document.createElement('div');
        container.className = 'analytics-container';
        container.style.cssText = `
            position: fixed;
            right: 20px;
            top: 20px;
            width: 400px;
            background: rgba(0, 0, 0, 0.8);
            border-radius: 8px;
            color: white;
            font-family: Arial, sans-serif;
            z-index: 1000;
            backdrop-filter: blur(10px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            padding: 15px;
        `;
        return container;
    }

    // Stats panel creation
    createStatsPanel() {
        const panel = document.createElement('div');
        panel.className = 'stats-panel';
        panel.style.cssText = `
            margin-bottom: 15px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            font-size: 12px;
            font-family: monospace;
        `;
        return panel;
    }

    // Tabs container creation
    createTabsContainer() {
        const container = document.createElement('div');
        container.style.cssText = 'display: flex; gap: 10px; margin-bottom: 15px;';

        ['Size', 'Opacity', 'Density', 'Color'].forEach(tabName => {
            const tab = this.createTab(tabName);
            container.appendChild(tab);
        });

        return container;
    }

    // Individual tab creation
    createTab(tabName) {
        const tab = document.createElement('button');
        tab.textContent = tabName;
        tab.className = 'analytics-tab';
        tab.style.cssText = `
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.1);
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            flex: 1;
        `;
        tab.addEventListener('click', () => this.setActiveTab(tabName.toLowerCase()));
        return tab;
    }

    // Canvas creation
    createCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = 370;
        canvas.height = 250;
        canvas.style.cssText = 'background: rgba(0, 0, 0, 0.3); border-radius: 4px;';
        return canvas;
    }

    // Event listeners setup
    setupEventListeners() {
        this.setupDragging();
        this.setupCanvasInteraction();
        window.addEventListener('resize', () => this.updateUIScale());
    }

    // Canvas interaction setup
    setupCanvasInteraction() {
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.mousePosition = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
            this.updateVisualization(); // Redraw with updated mouse position
        });
    }

    // Dragging functionality setup
    setupDragging() {
        let initialX, initialY;

        this.container.addEventListener('mousedown', (e) => {
            if (e.target === this.container) {
                this.isDragging = true;
                initialX = e.clientX - this.container.offsetLeft;
                initialY = e.clientY - this.container.offsetTop;
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (this.isDragging) {
                e.preventDefault();
                const x = e.clientX - initialX;
                const y = e.clientY - initialY;
                this.container.style.left = `${x}px`;
                this.container.style.top = `${y}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    // Update UI scaling
    updateUIScale() {
        const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const maxHeight = Math.max(vh * 0.8, 400);
        this.container.style.maxHeight = `${maxHeight}px`;
    }

    // Data processing methods
    updateData(depthSortedIndices, textureData, texwidth, texheight) {
        this.processPointData(depthSortedIndices, textureData, texwidth, texheight);
        this.updateVisualization();
        this.updateStats();
    }

    updateSceneData(sceneState) {
        const {
            depthIndex,
            textureData,
            texwidth,
            texheight,
            viewMatrix,
            projectionMatrix,
            viewport,
            focal
        } = sceneState;
    
        console.log('Updating scene data:', {
            depthIndexLength: depthIndex.length,
            textureDataLength: textureData.length,
            texwidth,
            texheight
        });
    
        // Process the data distributions
        const sizeData = this.processSizeDistribution(depthIndex, textureData, texwidth);
        const opacityData = this.processOpacityDistribution(depthIndex, textureData, texwidth);
        const densityData = this.processDensityDistribution(depthIndex, textureData, texwidth);
    
        // Update the data object
        this.data = {
            sizes: sizeData,
            opacities: opacityData,
            densities: densityData,
            colors: this.colorMode === 'render' 
                ? this.processRenderedColors(depthIndex, textureData, texwidth, texheight, viewMatrix, projectionMatrix, viewport, focal)
                : this.processSceneColorDistribution(depthIndex, textureData, texwidth)
        };
    
        console.log('Updated data:', this.data);
    
        // Trigger updates
        this.updateVisualization();
        this.updateStats();
    }
    processTextureData(texdata, texwidth, texheight) {
        this.textureData = texdata;
        this.texwidth = texwidth;
        this.texheight = texheight;
    }

    transformAndComputeColors(depthIndex, textureData, texwidth, texheight, viewMatrix, projectionMatrix, viewport, focal) {
        const f_buffer = new Float32Array(textureData.buffer);
        const u_buffer = new Uint8Array(textureData.buffer);
        const transformedColors = [];

        for (let i = 0; i < depthIndex.length; i++) {
            const idx = depthIndex[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;

            // Get position
            const pos = new Float32Array([
                f_buffer[baseIndex * 4],
                f_buffer[baseIndex * 4 + 1],
                f_buffer[baseIndex * 4 + 2],
                1.0
            ]);

            // Transform to view space and project
            const viewSpacePos = this.transformPoint(pos, viewMatrix);
            const projectedPos = this.transformPoint(viewSpacePos, projectionMatrix);

            // Perspective divide and viewport transform
            const w = projectedPos[3];
            const screenPos = [
                (projectedPos[0] / w * 0.5 + 0.5) * viewport[0],
                (projectedPos[1] / w * 0.5 + 0.5) * viewport[1]
            ];

            // Get color
            const color = [
                u_buffer[(baseIndex + 3) * 4] / 255,
                u_buffer[(baseIndex + 3) * 4 + 1] / 255,
                u_buffer[(baseIndex + 3) * 4 + 2] / 255
            ];

            transformedColors.push({
                position: screenPos,
                color: color,
                depth: -viewSpacePos[2]
            });
        }

        return transformedColors;
    }

    transformPoint(point, matrix) {
        const result = new Float32Array(4);
        for (let i = 0; i < 4; i++) {
            result[i] = 0;
            for (let j = 0; j < 4; j++) {
                result[i] += point[j] * matrix[j * 4 + i];
            }
        }
        return result;
    }

    processRenderedColors(depthIndex, textureData, texwidth, texheight, viewMatrix, projectionMatrix, viewport, focal) {
        // Transform points to screen space and compute colors
        const transformedColors = this.transformAndComputeColors(
            depthIndex,
            textureData,
            texwidth,
            texheight,
            viewMatrix,
            projectionMatrix,
            viewport,
            focal
        );

        this.data.colors = this.processColorDistribution(transformedColors);
    }


    processPointData(depthSortedIndices, textureData, texwidth, texheight) {
        const sizeData = this.processSizeDistribution(depthSortedIndices, textureData, texwidth);
        const opacityData = this.processOpacityDistribution(depthSortedIndices, textureData, texwidth);
        const densityData = this.processDensityDistribution(depthSortedIndices, textureData, texwidth);
        const colorData = this.processColorDistribution(depthSortedIndices, textureData, texwidth);

        this.data = {
            sizes: sizeData,
            opacities: opacityData,
            densities: densityData,
            colors: colorData
        };
    }

    processSizeDistribution(indices, textureData, texwidth) {
        const sizeHistogram = new Map();
        const f_buffer = new Float32Array(textureData.buffer);
    
        // Process each splat
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;
    
            // Scale components are stored in the second texel
            const scale_0 = f_buffer[baseIndex * 4 + 4];  // First scale component
            const scale_1 = f_buffer[baseIndex * 4 + 5];  // Second scale component
            const scale_2 = f_buffer[baseIndex * 4 + 6];  // Third scale component
    
            // Calculate the overall size (you might want to adjust this formula based on your needs)
            const size = Math.sqrt(scale_0 * scale_0 + scale_1 * scale_1 + scale_2 * scale_2);
            
            // Create size bins (adjust bin size as needed)
            const binSize = 0.01;  // 0.01 unit bins
            const binKey = Math.floor(size / binSize) * binSize;
    
            // Update histogram
            sizeHistogram.set(binKey, (sizeHistogram.get(binKey) || 0) + 1);
        }
    
        // Convert to array and sort by size
        return Array.from(sizeHistogram.entries())
            .sort(([a], [b]) => a - b)
            .map(([size, count]) => ({size, count}));  // Return objects instead of arrays
    }

    processOpacityDistribution(indices, textureData, texwidth) {
        const opacityMap = new Map();
        const f_buffer = new Float32Array(textureData.buffer);
        const u_buffer = new Uint8Array(textureData.buffer);

        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;

            // Get position and compute depth
            const x = f_buffer[baseIndex * 4];
            const y = f_buffer[baseIndex * 4 + 1];
            const z = f_buffer[baseIndex * 4 + 2];
            const depth = Math.sqrt(x*x + y*y + z*z);

            // Get opacity from last texel
            const opacity = u_buffer[(baseIndex + 3) * 4 + 3] / 255;

            // Create 2D histogram key
            const depthBin = Math.floor(depth * 10) / 10;
            const opacityBin = Math.floor(opacity * 10) / 10;
            const key = `${depthBin},${opacityBin}`;

            opacityMap.set(key, (opacityMap.get(key) || 0) + 1);
        }

        return Array.from(opacityMap.entries());
    }

    processDensityDistribution(indices, textureData, texwidth) {
        const f_buffer = new Float32Array(textureData.buffer);
        const gridSize = 20;
        const densityGrid = new Map();
        const bounds = {
            min: { x: Infinity, y: Infinity, z: Infinity },
            max: { x: -Infinity, y: -Infinity, z: -Infinity }
        };

        // First pass: calculate bounds
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;

            const x = f_buffer[baseIndex * 4];
            const y = f_buffer[baseIndex * 4 + 1];
            const z = f_buffer[baseIndex * 4 + 2];

            bounds.min.x = Math.min(bounds.min.x, x);
            bounds.min.y = Math.min(bounds.min.y, y);
            bounds.min.z = Math.min(bounds.min.z, z);
            bounds.max.x = Math.max(bounds.max.x, x);
            bounds.max.y = Math.max(bounds.max.y, y);
            bounds.max.z = Math.max(bounds.max.z, z);
        }

        // Second pass: build density grid
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;

            const x = f_buffer[baseIndex * 4];
            const y = f_buffer[baseIndex * 4 + 1];

            // Calculate grid cell
            const cellX = Math.floor((x - bounds.min.x) / gridSize);
            const cellY = Math.floor((y - bounds.min.y) / gridSize);
            const key = `${cellX},${cellY}`;

            if (!densityGrid.has(key)) {
                densityGrid.set(key, {
                    count: 0,
                    x: cellX * gridSize + gridSize/2 + bounds.min.x,
                    y: cellY * gridSize + gridSize/2 + bounds.min.y
                });
            }
            densityGrid.get(key).count++;
        }

        return {
            grid: Array.from(densityGrid.values()),
            bounds: bounds
        };
    }

    processColorDistribution(indices, textureData, texwidth) {
        // Initialize data structures for color analysis
        const clusters = new Map();
        const stats = {
            totalHue: 0,
            totalSat: 0,
            totalLum: 0,
            count: 0,
            // Track min/max for scaling
            minCount: Infinity,
            maxCount: 0
        };

        const u_buffer = new Uint8Array(textureData.buffer);

        // Process each splat's color
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;

            // Get color from the fourth texel (color data)
            const r = u_buffer[(baseIndex + 3) * 4] / 255;
            const g = u_buffer[(baseIndex + 3) * 4 + 1] / 255;
            const b = u_buffer[(baseIndex + 3) * 4 + 2] / 255;
            const a = u_buffer[(baseIndex + 3) * 4 + 3] / 255;

            // Skip fully transparent splats
            if (a < 0.01) continue;

            // Convert RGB to HSL
            const [h, s, l] = this.rgbToHsl(r, g, b);

            // Create more granular bins for better visualization
            const hueBin = Math.floor(h * 30) / 30;  // 30 hue sectors
            const satBin = Math.floor(s * 10) / 10;  // 10 saturation levels
            const lumBin = Math.floor(l * 10) / 10;  // 10 luminance levels
            
            const key = `${hueBin.toFixed(3)},${satBin.toFixed(1)},${lumBin.toFixed(1)}`;

            if (!clusters.has(key)) {
                clusters.set(key, {
                    count: 0,
                    hue: hueBin,
                    sat: satBin,
                    lum: lumBin,
                    rgb: [r, g, b]
                });
            }

            const cluster = clusters.get(key);
            cluster.count++;

            // Update min/max counts
            stats.minCount = Math.min(stats.minCount, cluster.count);
            stats.maxCount = Math.max(stats.maxCount, cluster.count);

            // Update color averages
            stats.totalHue += h;
            stats.totalSat += s;
            stats.totalLum += l;
            stats.count++;
        }

        // Calculate averages
        if (stats.count > 0) {
            stats.avgHue = stats.totalHue / stats.count;
            stats.avgSat = stats.totalSat / stats.count;
            stats.avgLum = stats.totalLum / stats.count;
        }

        return {
            clusters: Array.from(clusters.values()),
            stats: stats
        };
    }

    drawColorDistribution(data, title) {
        const ctx = this.ctx;
        const { width, height } = this.canvas;
        const padding = 40;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (!data.clusters || data.clusters.length === 0) {
            this.drawNoDataMessage();
            return;
        }

        // Draw title
        this.drawChartTitle(title);

        // Calculate visualization dimensions
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width - 2 * padding, height - 2 * padding) / 2.5;

        // Draw color wheel background (subtle circular guides)
        this.drawColorWheelBackground(centerX, centerY, radius);

        // Draw all color clusters
        data.clusters.forEach(cluster => {
            this.drawColorCluster(ctx, centerX, centerY, radius, cluster, data.stats);
        });

        // Draw polar grid and labels
        this.drawPolarGrid(centerX, centerY, radius);
        
        // Draw color statistics
        this.drawColorStats(data.stats, padding);
    }

    drawColorWheelBackground(centerX, centerY, radius) {
        const ctx = this.ctx;

        // Draw saturation circles
        for (let r = radius / 4; r <= radius; r += radius / 4) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.stroke();
        }

        // Draw hue sectors
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius
            );
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.stroke();
        }
    }

    drawColorCluster(ctx, centerX, centerY, radius, cluster, stats) {
        // Convert HSL position to polar coordinates
        const angle = cluster.hue * Math.PI * 2;
        const distance = cluster.sat * radius;

        // Convert to canvas coordinates
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;

        // Calculate point size based on count (logarithmic scale for better visualization)
        const normalizedCount = (cluster.count - stats.minCount) / (stats.maxCount - stats.minCount);
        const size = Math.max(3, Math.sqrt(normalizedCount) * 15);

        // Draw cluster point
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        
        // Use actual RGB color with luminance-based opacity
        const opacity = 0.3 + cluster.lum * 0.7;  // Higher luminance = more opaque
        ctx.fillStyle = `rgba(${cluster.rgb[0] * 255}, ${cluster.rgb[1] * 255}, ${cluster.rgb[2] * 255}, ${opacity})`;
        ctx.fill();

        // Add subtle white border for contrast
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    drawPolarGrid(centerX, centerY, radius) {
        const ctx = this.ctx;
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';

        // Draw saturation labels
        for (let r = radius / 4; r <= radius; r += radius / 4) {
            const sat = Math.round((r / radius) * 100);
            ctx.fillText(
                `${sat}%`,
                centerX + r + 10,
                centerY
            );
        }

        // Draw hue labels
        const hueLabels = ['0°', '60°', '120°', '180°', '240°', '300°'];
        hueLabels.forEach((label, i) => {
            const angle = (i / 6) * Math.PI * 2;
            ctx.fillText(
                label,
                centerX + Math.cos(angle) * (radius + 20),
                centerY + Math.sin(angle) * (radius + 20)
            );
        });
    }

    drawColorStats(stats, padding) {
        const ctx = this.ctx;
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';

        const statsText = [
            `Average Hue: ${(stats.avgHue * 360).toFixed(1)}°`,
            `Average Saturation: ${(stats.avgSat * 100).toFixed(1)}%`,
            `Average Luminance: ${(stats.avgLum * 100).toFixed(1)}%`,
            `Total Points: ${stats.count.toLocaleString()}`
        ];

        statsText.forEach((text, i) => {
            ctx.fillText(text, padding, padding + (i + 1) * 16);
        });
    }
    rgbToHsl(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return [h, s, l];
    }

    // Visualization methods
    setActiveTab(tabName) {
        this.activeTab = tabName;
        this.updateVisualization();
    }

    updateVisualization() {
        switch (this.activeTab) {
            case 'size':
                this.drawHistogram(this.data.sizes, 'Size Distribution');
                break;
            case 'opacity':
                this.drawHistogram(this.data.opacities, 'Opacity Distribution');
                break;
            case 'density':
                this.drawDensityPlot(this.data.densities, 'Spatial Density');
                break;
            case 'color':
                this.drawColorDistribution(this.data.colors, 'Color Distribution');
                break;
        }
    }

    drawHistogram(data, title) {
        const ctx = this.ctx;
        const { width, height } = this.canvas;
        const padding = 40;
    
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
    
        if (!data || data.length === 0) {
            this.drawNoDataMessage();
            return;
        }
    
        // Draw title
        this.drawChartTitle(title);
    
        // Calculate scales
        const maxValue = Math.max(...data.map(item => item.count));
        const chartWidth = width - 2 * padding;
        const chartHeight = height - 2 * padding;
        const barWidth = chartWidth / data.length;
    
        // Draw axes and grid
        this.drawAxes(padding, width, height);
        this.drawGrid(padding, width, height, maxValue);
    
        // Draw bars
        data.forEach((item, i) => {
            const barHeight = -(item.count / maxValue) * chartHeight;
            this.drawHistogramBar(
                padding + i * barWidth,
                height - padding,
                barWidth - 2,
                barHeight,
                item.size
            );
        });
    
        // Draw hover tooltip if mouse is over a bar
        this.drawHistogramTooltip(data, barWidth, padding, height, maxValue);
    }

    drawDensityPlot(data, title) {
        const ctx = this.ctx;
        const { width, height } = this.canvas;
        const padding = 40;

        // Clear canvas
        ctx.clearRect(0, 0, width, height);

        if (!data.grid || data.grid.length === 0) {
            this.drawNoDataMessage();
            return;
        }

        // Draw title
        this.drawChartTitle(title);

        // Calculate scales
        const { xScale, yScale } = this.calculateDensityScales(data, width, height, padding);
        const maxDensity = Math.max(...data.grid.map(cell => cell.count));

        // Draw axes and grid
        this.drawAxes(padding, width, height);
        this.drawDensityGrid(padding, width, height, data.bounds);

        // Draw density points
        data.grid.forEach(cell => {
            this.drawDensityPoint(cell, xScale, yScale, maxDensity, padding, height);
        });
    }

    processSceneColorDistribution(indices, textureData, texwidth) {
        const clusters = new Map();
        const stats = {
            totalHue: 0,
            totalSat: 0,
            totalLum: 0,
            count: 0
        };
    
        const u_buffer = new Uint8Array(textureData.buffer);
    
        // Process each splat
        for (let i = 0; i < indices.length; i++) {
            const idx = indices[i];
            const texelX = (idx & 0x3ff) << 1;
            const texelY = idx >> 10;
            const baseIndex = (texelY * texwidth + texelX) * 4;
    
            // Get color from the last texel (fourth texel, after position and scale)
            const r = u_buffer[(baseIndex + 3) * 4] / 255;
            const g = u_buffer[(baseIndex + 3) * 4 + 1] / 255;
            const b = u_buffer[(baseIndex + 3) * 4 + 2] / 255;
    
            // Skip fully transparent or black splats
            if (r === 0 && g === 0 && b === 0) continue;
    
            // Convert to HSL
            const [h, s, l] = this.rgbToHsl(r, g, b);
    
            // Create more granular clusters
            const hueSector = Math.floor(h * 12);  // 12 hue sectors instead of 6
            const satLevel = Math.floor(s * 4);    // 4 saturation levels
            const lumLevel = Math.floor(l * 4);    // 4 luminance levels
            const key = `${hueSector}-${satLevel}-${lumLevel}`;
    
            if (!clusters.has(key)) {
                clusters.set(key, {
                    count: 0,
                    hue: h,
                    sat: s,
                    lum: l,
                    rgb: [r, g, b]
                });
            }
    
            const cluster = clusters.get(key);
            cluster.count++;
    
            // Update running averages
            cluster.hue = (cluster.hue * (cluster.count - 1) + h) / cluster.count;
            cluster.sat = (cluster.sat * (cluster.count - 1) + s) / cluster.count;
            cluster.lum = (cluster.lum * (cluster.count - 1) + l) / cluster.count;
            cluster.rgb = [
                (cluster.rgb[0] * (cluster.count - 1) + r) / cluster.count,
                (cluster.rgb[1] * (cluster.count - 1) + g) / cluster.count,
                (cluster.rgb[2] * (cluster.count - 1) + b) / cluster.count
            ];
    
            // Update global stats
            stats.totalHue += h;
            stats.totalSat += s;
            stats.totalLum += l;
            stats.count++;
        }
    
        if (stats.count > 0) {
            stats.avgHue = stats.totalHue / stats.count;
            stats.avgSat = stats.totalSat / stats.count;
            stats.avgLum = stats.totalLum / stats.count;
        }
    
        console.log('Color processing complete:', {
            clusterCount: clusters.size,
            totalPoints: stats.count,
            averages: {
                hue: stats.avgHue,
                sat: stats.avgSat,
                lum: stats.avgLum
            }
        });
    
        return {
            clusters: Array.from(clusters.entries()),
            stats: stats
        };
    }
    

    drawColorAxes(centerX, centerY, radius) {
        const ctx = this.ctx;

        // Draw circular guides
        for (let r = radius / 3; r <= radius; r += radius / 3) {
            ctx.beginPath();
            ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.stroke();
        }

        // Draw radial guides
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 3) {
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(
                centerX + Math.cos(angle) * radius,
                centerY + Math.sin(angle) * radius
            );
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.stroke();
        }
    }

    // Helper drawing methods
    drawChartTitle(title) {
        this.ctx.fillStyle = 'white';
        this.ctx.font = '14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(title, this.canvas.width / 2, 20);
    }

    drawNoDataMessage() {
        const ctx = this.ctx;
        const { width, height } = this.canvas;
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No data available', width / 2, height / 2);
    }

    drawAxes(padding, width, height) {
        this.ctx.strokeStyle = 'white';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(padding, height - padding);
        this.ctx.lineTo(width - padding, height - padding);
        this.ctx.moveTo(padding, height - padding);
        this.ctx.lineTo(padding, padding);
        this.ctx.stroke();
    }

    // Stats update methods
    updateStats() {
        const stats = this.calculateStats();
        this.updateStatsDisplay(stats);
    }

    calculateStats() {
        // Calculate various statistics from the data
        return {
            totalPoints: this.data.sizes.reduce((sum, [_, count]) => sum + count, 0),
            averageSize: this.calculateAverageSize(),
            densityStats: this.calculateDensityStats(),
            colorStats: this.calculateColorStats()
        };
    }

    updateStatsDisplay(stats) {
        this.statsPanel.innerHTML = this.formatStats(stats);
    }

    // Add these methods to SplatAnalytics class

    calculateAverageSize() {
        if (!this.data.sizes || this.data.sizes.length === 0) return 0;
        
        let totalSize = 0;
        let totalCount = 0;
        
        this.data.sizes.forEach(([size, count]) => {
            totalSize += size * count;
            totalCount += count;
        });
        
        return totalCount > 0 ? totalSize / totalCount : 0;
    }

    calculateDensityStats() {
        if (!this.data.densities.grid || this.data.densities.grid.length === 0) {
            return { min: 0, max: 0, average: 0 };
        }
        
        const counts = this.data.densities.grid.map(cell => cell.count);
        return {
            min: Math.min(...counts),
            max: Math.max(...counts),
            average: counts.reduce((a, b) => a + b, 0) / counts.length
        };
    }

    calculateColorStats() {
        if (!this.data.colors.stats || !this.data.colors.clusters) {
            return { variance: 0, dominantHue: 0 };
        }
        
        const stats = this.data.colors.stats;
        let variance = 0;
        let totalWeight = 0;
        
        // Calculate weighted variance of hue
        this.data.colors.clusters.forEach(([_, cluster]) => {
            const hueDiff = Math.min(
                Math.abs(cluster.hue - stats.avgHue),
                Math.abs(cluster.hue - stats.avgHue + 1),
                Math.abs(cluster.hue - stats.avgHue - 1)
            );
            variance += hueDiff * hueDiff * cluster.count;
            totalWeight += cluster.count;
        });
        
        return {
            variance: totalWeight > 0 ? Math.sqrt(variance / totalWeight) : 0,
            dominantHue: stats.avgHue
        };
    }

    // Grid drawing for charts
    drawGrid(padding, width, height, maxValue) {
        const ctx = this.ctx;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Draw horizontal grid lines
        const gridLines = 5;
        for (let i = 1; i < gridLines; i++) {
            const y = height - padding - (height - 2 * padding) * (i / gridLines);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();

            // Add value labels
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(
                Math.round(maxValue * (i / gridLines)),
                padding - 5,
                y + 4
            );
        }
    }

    drawHistogramBar(x, y, width, height, value) {
        const ctx = this.ctx;
        
        // Draw bar
        ctx.fillStyle = 'rgba(64, 149, 255, 0.6)';
        ctx.fillRect(x, y, width, height);
        
        // Draw outline
        ctx.strokeStyle = 'rgba(64, 149, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, width, height);
    
        // Draw value label if bar is tall enough
        if (Math.abs(height) > 20) {
            ctx.fillStyle = 'white';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(typeof value === 'number' ? value.toFixed(3) : value, x + width/2, y - 5);
        }
    }
    
    drawHistogramTooltip(data, barWidth, padding, height, maxValue) {
        if (!this.mousePosition) return;
    
        const ctx = this.ctx;
        const mouseX = this.mousePosition.x;
        const mouseY = this.mousePosition.y;
    
        // Find which bar we're hovering over
        const barIndex = Math.floor((mouseX - padding) / barWidth);
        if (barIndex < 0 || barIndex >= data.length) return;
    
        const item = data[barIndex];
        const barHeight = -(item.count / maxValue) * (height - 2 * padding);
        const barX = padding + barIndex * barWidth;
        const barY = height - padding;
    
        // Check if mouse is over bar
        if (mouseX >= barX && mouseX <= barX + barWidth &&
            mouseY >= barY + barHeight && mouseY <= barY) {
            
            // Draw tooltip
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            
            const tooltipWidth = 120;
            const tooltipHeight = 45;
            const tooltipX = Math.min(mouseX + 10, this.canvas.width - tooltipWidth - 10);
            const tooltipY = Math.max(mouseY - tooltipHeight - 10, 10);
    
            // Draw tooltip background
            ctx.beginPath();
            ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 5);
            ctx.fill();
            ctx.stroke();
    
            // Draw tooltip text
            ctx.fillStyle = 'white';
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`Size: ${item.size.toFixed(3)}`, tooltipX + 8, tooltipY + 20);
            ctx.fillText(`Count: ${item.count}`, tooltipX + 8, tooltipY + 35);
        }
    }
    // Density plot helper methods
    calculateDensityScales(data, width, height, padding) {
        const bounds = data.bounds;
        const xRange = bounds.max.x - bounds.min.x;
        const yRange = bounds.max.y - bounds.min.y;

        return {
            xScale: (width - 2 * padding) / xRange,
            yScale: (height - 2 * padding) / yRange
        };
    }

    drawDensityGrid(padding, width, height, bounds) {
        const ctx = this.ctx;
        const gridLines = 5;
        
        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;

        // Vertical grid
        for (let i = 1; i < gridLines; i++) {
            const x = padding + (width - 2 * padding) * (i / gridLines);
            ctx.beginPath();
            ctx.moveTo(x, padding);
            ctx.lineTo(x, height - padding);
            ctx.stroke();

            // Add x-axis labels
            const value = bounds.min.x + (bounds.max.x - bounds.min.x) * (i / gridLines);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(value.toFixed(1), x, height - padding + 15);
        }

        // Horizontal grid
        for (let i = 1; i < gridLines; i++) {
            const y = height - padding - (height - 2 * padding) * (i / gridLines);
            ctx.beginPath();
            ctx.moveTo(padding, y);
            ctx.lineTo(width - padding, y);
            ctx.stroke();

            // Add y-axis labels
            const value = bounds.min.y + (bounds.max.y - bounds.min.y) * (i / gridLines);
            ctx.textAlign = 'right';
            ctx.fillText(value.toFixed(1), padding - 5, y + 4);
        }
    }

    drawDensityPoint(cell, xScale, yScale, maxDensity, padding, height) {
        const ctx = this.ctx;
        
        // Calculate point position
        const x = padding + (cell.x - this.data.densities.bounds.min.x) * xScale;
        const y = height - padding - (cell.y - this.data.densities.bounds.min.y) * yScale;
        
        // Validate coordinates
        if (!isFinite(x) || !isFinite(y)) {
            console.warn('Invalid coordinates for density point:', { x, y, cell });
            return;
        }
        
        // Calculate point size and color based on density
        const normalizedDensity = cell.count / maxDensity;
        const radius = Math.max(2, Math.min(normalizedDensity * 10, 20));  // Cap maximum radius
        
        try {
            // Create gradient for point
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(64, 149, 255, ${normalizedDensity})`);
            gradient.addColorStop(1, 'rgba(64, 149, 255, 0)');
            
            // Draw point
            ctx.beginPath();
            ctx.fillStyle = gradient;
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        } catch (error) {
            console.warn('Error drawing density point:', { x, y, radius, error });
        }
    }

    // Add hover effects for density plot
    setupDensityHover() {
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.activeTab !== 'density') return;

            const rect = this.canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Find nearest density point and show tooltip
            this.updateDensityTooltip(mouseX, mouseY);
        });
    }

    updateDensityTooltip(mouseX, mouseY) {
        if (!this.data.densities.grid) return;

        const padding = 40;
        const { xScale, yScale } = this.calculateDensityScales(
            this.data.densities,
            this.canvas.width,
            this.canvas.height,
            padding
        );

        // Convert mouse position to world coordinates
        const worldX = (mouseX - padding) / xScale + this.data.densities.bounds.min.x;
        const worldY = (this.canvas.height - mouseY - padding) / yScale + this.data.densities.bounds.min.y;

        // Find nearest point
        let nearestPoint = null;
        let minDistance = Infinity;

        this.data.densities.grid.forEach(cell => {
            const dx = cell.x - worldX;
            const dy = cell.y - worldY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < minDistance) {
                minDistance = distance;
                nearestPoint = cell;
            }
        });

        // If a point is close enough, show tooltip
        if (nearestPoint && minDistance < 20 / xScale) {
            this.drawDensityTooltip(nearestPoint, mouseX, mouseY);
        }
    }

    drawDensityTooltip(point, mouseX, mouseY) {
        const ctx = this.ctx;
        
        // Draw tooltip background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        
        const tooltipWidth = 120;
        const tooltipHeight = 60;
        const tooltipX = Math.min(mouseX + 10, this.canvas.width - tooltipWidth - 10);
        const tooltipY = Math.max(mouseY - tooltipHeight - 10, 10);

        ctx.beginPath();
        ctx.roundRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight, 5);
        ctx.fill();
        ctx.stroke();

        // Draw tooltip text
        ctx.fillStyle = 'white';
        ctx.font = '12px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`X: ${point.x.toFixed(2)}`, tooltipX + 8, tooltipY + 20);
        ctx.fillText(`Y: ${point.y.toFixed(2)}`, tooltipX + 8, tooltipY + 35);
        ctx.fillText(`Count: ${point.count}`, tooltipX + 8, tooltipY + 50);
    }

    formatStats(stats) {
        const densityStats = stats.densityStats;
        const colorStats = stats.colorStats;
        
        return `
            <div class="stats-grid">
                <div>Total Points: ${stats.totalPoints.toLocaleString()}</div>
                <div>Average Size: ${stats.averageSize.toFixed(3)}</div>
                <div>Density: ${densityStats.min} - ${densityStats.max}</div>
                <div>Color Variance: ${(colorStats.variance * 360).toFixed(1)}°</div>
            </div>
        `;
    }
}