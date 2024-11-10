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
    }
};

console.log('Shaders module loaded successfully');