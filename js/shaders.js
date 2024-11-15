// shaders.js
console.log('Loading shaders module...');

export const SHADERS = {
    grid: {
        vertex: `
            attribute vec3 aVertexPosition;
            attribute vec3 aVertexColor;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uModelViewMatrix;
            varying vec3 vColor;
            
            void main() {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
                vColor = aVertexColor;
            }
        `,
        fragment: `
            precision mediump float;
            varying vec3 vColor;
            
            void main() {
                gl_FragColor = vec4(vColor, 1.0);
            }
        `
    },
    point: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute vec3 aColor;
            attribute float aCurvature;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform float uPointSize;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            
            void main() {
                vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
                gl_Position = uProjectionMatrix * mvPosition;
                gl_PointSize = uPointSize;
                
                vNormal = normalize((uModelViewMatrix * vec4(aNormal, 0.0)).xyz);
                vDepth = -mvPosition.z;
                vCurvature = aCurvature;
                vColor = aColor;
            }
        `,
        fragment: `
            #ifdef GL_OES_standard_derivatives
            #extension GL_OES_standard_derivatives : enable
            #endif
            
            precision highp float;
            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            
            uniform float uNearPlane;
            uniform float uFarPlane;
            uniform int uViewMode;
            
            void main() {
                // Discard pixels outside point circle
                vec2 coord = gl_PointCoord - vec2(0.5);
                if(length(coord) > 0.5) {
                    discard;
                }
                
                vec4 finalColor;
                
                // View mode selection
                if (uViewMode == 0) {
                    finalColor = vec4(vColor, 1.0); // RGB mode
                } 
                else if (uViewMode == 1) {
                    float depth = (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vec3(1.0 - depth), 1.0); // Depth mode
                } 
                else if (uViewMode == 2) {
                    finalColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); // Normal mode
                } 
                else if (uViewMode == 3) {
                    finalColor = vec4(vec3(vCurvature), 1.0); // Curvature mode
                } 
                else if (uViewMode == 4) {
                    #ifdef GL_OES_standard_derivatives
                        float dx = dFdx(vDepth);
                        float dy = dFdy(vDepth);
                        float edgeStrength = length(vec2(dx, dy));
                        finalColor = vec4(vec3(1.0 - edgeStrength * 10.0), 1.0); // Edge detection
                    #else
                        finalColor = vec4(vColor, 1.0);
                    #endif
                }
                else {
                    finalColor = vec4(vColor, 1.0); // Default to RGB
                }
                
                gl_FragColor = finalColor;
            }
        `
    },

    mesh: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute vec3 aColor;
            attribute vec2 aTexCoord;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform mat4 uNormalMatrix;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec2 vTexCoord;
            varying float vDepth;
            
            void main() {
                vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
                gl_Position = uProjectionMatrix * mvPosition;
                
                vNormal = normalize((uNormalMatrix * vec4(aNormal, 0.0)).xyz);
                vColor = aColor;
                vTexCoord = aTexCoord;
                vDepth = -mvPosition.z;
            }
        `,
        fragment: `
            precision highp float;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying vec2 vTexCoord;
            varying float vDepth;
            
            uniform int uViewMode;
            uniform float uNearPlane;
            uniform float uFarPlane;
            uniform bool uWireframe;
            
            void main() {
                vec4 finalColor;
                
                if (uViewMode == 0) {
                    // RGB mode with basic lighting
                    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
                    float diff = max(dot(vNormal, lightDir), 0.0);
                    vec3 ambient = vColor * 0.3;
                    vec3 diffuse = vColor * diff * 0.7;
                    finalColor = vec4(ambient + diffuse, 1.0);
                } 
                else if (uViewMode == 1) {
                    // Depth mode
                    float depth = (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vec3(1.0 - depth), 1.0);
                } 
                else if (uViewMode == 2) {
                    // Normal mode
                    finalColor = vec4(vNormal * 0.5 + 0.5, 1.0);
                }
                else {
                    finalColor = vec4(vColor, 1.0);
                }
                
                if (uWireframe) {
                    vec3 wireColor = vec3(0.0, 1.0, 0.0);
                    finalColor = vec4(wireColor, 1.0);
                }
                
                gl_FragColor = finalColor;
            }
        `}
};

export const DEBUG_SHADERS = {
    vertex: `
        attribute vec3 aPosition;
        uniform mat4 uProjectionMatrix;
        uniform mat4 uModelViewMatrix;
        
        void main() {
            gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aPosition, 1.0);
        }
    `,
    fragment: `
        precision mediump float;
        
        void main() {
            gl_FragColor = vec4(0.0, 1.0, 0.0, 0.3); // Semi-transparent green
        }
    `
};

console.log('Shaders module loaded successfully');