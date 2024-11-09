// js/shaders.js
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
            uniform int uViewMode;        // Make sure this is declared as int
            uniform float uNearPlane;
            uniform float uFarPlane;
            
            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            varying vec4 vPosition;
            varying float vViewMode;      // Add this varying to pass viewMode to fragment
            
            void main() {
                vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
                gl_Position = uProjectionMatrix * mvPosition;
                gl_PointSize = uPointSize;
                
                vPosition = gl_Position;
                vNormal = normalize((uModelViewMatrix * vec4(aNormal, 0.0)).xyz);
                vDepth = -mvPosition.z;
                vCurvature = aCurvature;
                vColor = aColor;
                vViewMode = float(uViewMode);  // Pass viewMode to fragment shader
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
            varying vec4 vPosition;
            varying float vViewMode;      // Receive viewMode from vertex shader
            
            uniform float uNearPlane;
            uniform float uFarPlane;
            
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                if(length(coord) > 0.5) {
                    discard;
                }
                
                vec4 finalColor;
                int viewMode = int(vViewMode);  // Convert back to int
                
                if (viewMode == 0) {
                    finalColor = vec4(vColor, 1.0); // RGB
                } else if (viewMode == 1) {
                    float alpha = 1.0 - (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vColor, alpha); // Alpha
                } else if (viewMode == 2) {
                    float depth = (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vec3(depth), 1.0); // Depth
                } else if (viewMode == 3) {
                    finalColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); // Normal
                } else if (viewMode == 4) {
                    finalColor = vec4(vec3(vCurvature), 1.0); // Curvature
                } else if (viewMode == 5) {
                    #ifdef GL_OES_standard_derivatives
                        float edge = fwidth(vDepth) * 10.0;
                    #else
                        float edge = 0.0;
                    #endif
                    finalColor = vec4(vec3(1.0 - edge), 1.0); // Edge
                } else {
                    finalColor = vec4(vColor, 1.0); // Default to RGB
                }
                gl_FragColor = finalColor;
            }
        `
    }
};