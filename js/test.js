// model-loader.js - Extend the existing PLYLoader class

class PLYLoader {
    constructor() {
        // Keep existing property types and sizes
        this.propertyTypes = new Map([
            ['char', Int8Array],
            ['uchar', Uint8Array],
            ['short', Int16Array],
            ['ushort', Uint16Array],
            ['int', Int32Array],
            ['uint', Uint32Array],
            ['float', Float32Array],
            ['double', Float64Array],
        ]);

        this.propertySizes = new Map([
            ['char', 1], ['uchar', 1],
            ['short', 2], ['ushort', 2],
            ['int', 4], ['uint', 4],
            ['float', 4], ['double', 8]
        ]);

        // Add new format handlers
        this.formatHandlers = {
            standard: this.parseStandardPLY.bind(this),
            inriav1: this.parseINRIAV1.bind(this),
            inriav2: this.parseINRIAV2.bind(this),
            playcanvas: this.parsePlayCanvas.bind(this)
        };
    }

    async loadPLY(fileData) {
        try {
            // First try existing parser
            const standardResult = await this.parseStandardPLY(fileData);
            if (this.isValidResult(standardResult)) {
                return standardResult;
            }
        } catch (error) {
            console.log('Standard parser failed, trying specialized formats...');
        }

        // If standard parser fails, detect format and try specialized parsers
        const format = await this.detectPLYFormat(fileData);
        const parser = this.getParserForFormat(format);
        const result = await parser.parseToUncompressedSplatArray(fileData);
        
        // Convert specialized format to standard format
        return this.convertToStandardFormat(result);
    }

    async detectPLYFormat(fileData) {
        let headerText;
        if (fileData instanceof ArrayBuffer) {
            const decoder = new TextDecoder();
            headerText = decoder.decode(new Uint8Array(fileData, 0, 1024));
        } else if (typeof fileData === 'string') {
            headerText = fileData.substring(0, 1024);
        }

        // Format detection logic
        if (headerText.includes('element codebook_centers')) {
            return 'inriav2';
        } else if (headerText.includes('element chunk') || 
                   headerText.match(/[A-Za-z]*packed_[A-Za-z]*/)) {
            return 'playcanvas';
        } else if (headerText.includes('f_dc_') || headerText.includes('f_rest_')) {
            return 'inriav1';
        }
        
        return 'standard';
    }

    getParserForFormat(format) {
        switch (format) {
            case 'inriav1':
                return new INRIAV1PlyParser();
            case 'inriav2':
                return new INRIAV2PlyParser();
            case 'playcanvas':
                return new PlayCanvasCompressedPlyParser();
            default:
                return this;
        }
    }

    // Keep existing parsing methods
    parseStandardPLY(fileData) {
        // Existing parsing logic remains unchanged
        return this.parsePLYHeader(fileData)
            .then(header => {
                // Existing header parsing code...
            });
    }

    convertToStandardFormat(specializedResult) {
        const result = {
            vertices: [],
            normals: [],
            colors: [],
            faces: [],
            vertexCount: 0
        };

        // Convert vertices
        const positions = specializedResult.getPositions();
        result.vertices = new Float32Array(positions);
        result.vertexCount = positions.length / 3;

        // Convert colors if available
        const colors = specializedResult.getColors();
        if (colors && colors.length > 0) {
            result.colors = new Float32Array(colors);
        }

        // Convert normals if available
        const normals = specializedResult.getNormals();
        if (normals && normals.length > 0) {
            result.normals = new Float32Array(normals);
        }

        // Store specialized data for advanced features
        result.additionalData = {
            scales: specializedResult.getScales(),
            rotations: specializedResult.getRotations(),
            sphericalHarmonics: specializedResult.getSphericalHarmonics()
        };

        return result;
    }

    // Validation helper
    isValidResult(result) {
        return result && 
               result.vertices && 
               result.vertices.length > 0 && 
               result.vertexCount > 0;
    }
}

// Add these extension methods to your existing ModelLoader class
class ModelLoader {
    constructor() {
        // Existing initialization
        this.supportedFormats = ['ply', 'obj', 'fbx'];
        this.plyLoader = new PLYLoader();
    }

    // Existing methods remain unchanged
    async loadFile(fileData, fileType) {
        // Existing loadFile implementation remains the same
    }

    // Add method to handle specialized PLY data
    getSpecializedPLYData(result) {
        if (result && result.additionalData) {
            return {
                hasSphericalHarmonics: !!result.additionalData.sphericalHarmonics,
                hasScales: !!result.additionalData.scales,
                hasRotations: !!result.additionalData.rotations
            };
        }
        return {
            hasSphericalHarmonics: false,
            hasScales: false,
            hasRotations: false
        };
    }
}