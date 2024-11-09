class PLYLoader {
    constructor() {
        this.vertices = [];
        this.colors = [];
        this.normals = [];
    }

    async loadPLY(filePath) {
        try {
            const response = await fetch(filePath);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            return this.parsePLY(text);
        } catch (error) {
            console.error('Error loading PLY file:', error);
            throw error;
        }
    }

    parsePLY(data) {
        const lines = data.split('\n');
        let headerEnd = 0;
        let vertexCount = 0;
        let format = '';
        
        // Parse header
        const header = {
            hasNormals: false,
            hasColors: false,
            properties: []
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            
            if (line === 'end_header') {
                headerEnd = i + 1;
                break;
            }
            
            if (line.includes('element vertex')) {
                vertexCount = parseInt(line.split(' ')[2]);
            }
            
            if (line.includes('format')) {
                format = line.split(' ')[1];
            }
            
            if (line.includes('property')) {
                const parts = line.split(' ');
                const property = {
                    type: parts[1],
                    name: parts[2]
                };
                header.properties.push(property);
                
                if (parts[2].match(/^(nx|ny|nz)$/)) {
                    header.hasNormals = true;
                }
                if (parts[2].match(/^(red|green|blue|r|g|b)$/)) {
                    header.hasColors = true;
                }
            }
        }

        // Initialize arrays
        const vertices = [];
        const normals = header.hasNormals ? [] : null;
        const colors = header.hasColors ? [] : null;

        // Parse vertex data
        for (let i = 0; i < vertexCount; i++) {
            const values = lines[headerEnd + i].trim().split(/\s+/);
            let valueIndex = 0;
            
            // Process each property in order
            for (const prop of header.properties) {
                const value = parseFloat(values[valueIndex++]);
                
                switch(prop.name) {
                    case 'x': case 'y': case 'z':
                        vertices.push(value);
                        break;
                    case 'nx': case 'ny': case 'nz':
                        normals?.push(value);
                        break;
                    case 'red': case 'r':
                        colors?.push(value / 255);
                        break;
                    case 'green': case 'g':
                        colors?.push(value / 255);
                        break;
                    case 'blue': case 'b':
                        colors?.push(value / 255);
                        break;
                }
            }
        }

        return {
            vertices,
            normals,
            colors,
            vertexCount
        };
    }
}