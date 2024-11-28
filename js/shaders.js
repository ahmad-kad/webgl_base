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
            uniform int uColorProfile;
            
            // Turbo colormap function
            vec3 turbo(float t) {
                const vec3 h = vec3(0.7858, 0.8320, 0.8828);
                const vec3 a = vec3(1.9743, 2.0574, 1.8304);
                const vec3 b = vec3(-1.2661, -1.7715, -1.5430);
                const vec3 c = vec3(0.2039, 0.0883, 0.1934);
                return clamp(h + a * cos(6.28318 * (b * t + c)), 0.0, 1.0);
            }
            
            // Viridis colormap approximation
            vec3 viridis(float t) {
                const vec3 c0 = vec3(0.2777, 0.0048, 0.2899);
                const vec3 c1 = vec3(0.1056, 0.5767, 0.4016);
                const vec3 c2 = vec3(0.8352, 0.2302, 0.1935);
                return c0 + c1 * cos(6.28318 * (c2 * t + vec3(0.0, 0.1, 0.2)));
            }
            
            // Inferno colormap approximation
            vec3 inferno(float t) {
                const vec3 c0 = vec3(0.0002, 0.0016, 0.0139);
                const vec3 c1 = vec3(0.7873, 0.3372, 0.2361);
                const vec3 c2 = vec3(0.2354, 0.4869, 0.9918);
                return c0 + c1 * cos(6.28318 * (c2 * t + vec3(0.0, 0.1, 0.2)));
            }
            
            // Jet colormap approximation
            vec3 jet(float t) {
                return vec3(
                    1.5 - abs(4.0 * t - 3.0),
                    1.5 - abs(4.0 * t - 2.0),
                    1.5 - abs(4.0 * t - 1.0)
                );
            }
    
            vec3 depthToColor(float depth) {
                // Normalize depth to 10 meters max
                float normalizedDepth = clamp(depth / 10.0, 0.0, 1.0);
                
                // Invert so closer is brighter
                normalizedDepth = 1.0 - normalizedDepth;
                
                // Select color profile based on uniform
                if (uColorProfile == 0) return turbo(normalizedDepth);
                if (uColorProfile == 1) return jet(normalizedDepth);
                if (uColorProfile == 2) return viridis(normalizedDepth);
                return inferno(normalizedDepth); // Profile 3
            }
            
            void main() {
                // Discard pixels outside point circle
                vec2 coord = gl_PointCoord - vec2(0.5);
                if(length(coord) > 0.5) {
                    discard;
                }
                
                vec4 finalColor;
                
                if (uViewMode == 0) {
                    finalColor = vec4(vColor, 1.0); // RGB mode
                } 
                else if (uViewMode == 1) {
                    finalColor = vec4(depthToColor(vDepth), 1.0); // Enhanced depth mode
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
                        finalColor = vec4(vec3(1.0 - edgeStrength * 10.0), 1.0);
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
    `},

    splat: {
        vertex: ``,

        fragment: ``
    }
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
