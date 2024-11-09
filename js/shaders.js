// js/shaders.js
const SHADERS = {
    point: {
        vertex: `
            attribute vec3 aPosition;
            attribute vec3 aNormal;
            attribute vec3 aColor;
            attribute float aCurvature;

            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform float uPointSize;
            uniform int uViewMode;

            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            varying vec4 vPosition;

            void main() {
                vec4 mvPosition = uModelViewMatrix * vec4(aPosition, 1.0);
                gl_Position = uProjectionMatrix * mvPosition;
                gl_PointSize = uPointSize;
                
                vPosition = gl_Position;
                vNormal = normalize((uModelViewMatrix * vec4(aNormal, 0.0)).xyz);
                vDepth = -mvPosition.z;
                vCurvature = aCurvature;
                vColor = aColor;
            }
        `,
        fragment: `
            precision highp float;

            varying vec3 vColor;
            varying vec3 vNormal;
            varying float vDepth;
            varying float vCurvature;
            varying vec4 vPosition;

            uniform int uViewMode;
            uniform float uNearPlane;
            uniform float uFarPlane;

            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                if(length(coord) > 0.5) {
                    discard;
                }
                
                vec4 finalColor;
                
                if (uViewMode == 0) {
                    finalColor = vec4(vColor, 1.0); // RGB
                } else if (uViewMode == 1) {
                    float alpha = 1.0 - (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vColor, alpha); // Alpha
                } else if (uViewMode == 2) {
                    float depth = (vDepth - uNearPlane) / (uFarPlane - uNearPlane);
                    finalColor = vec4(vec3(depth), 1.0); // Depth
                } else if (uViewMode == 3) {
                    finalColor = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0); // Normal
                } else if (uViewMode == 4) {
                    finalColor = vec4(vec3(vCurvature), 1.0); // Curvature
                } else if (uViewMode == 5) {
                    float edge = fwidth(vDepth) * 10.0;
                    finalColor = vec4(vec3(1.0 - edge), 1.0); // Edge
                } else {
                    finalColor = vec4(vColor, 1.0); // Default to RGB
                }
                
                gl_FragColor = finalColor;
            }
        `
    }
};