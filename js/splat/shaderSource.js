export const vertexShaderSource = `
#version 300 es
precision highp float;
precision highp int;

// Existing uniforms
uniform highp usampler2D u_texture;
uniform mat4 projection, view;
uniform vec2 focal;
uniform vec2 viewport;
uniform sampler2D u_depthTexture;

// New uniforms for controls
uniform float u_uniformScale;  // Controls overall size of splats
uniform float u_pointScale;    // Multiplier for point size

in vec2 position;
in int index;
out vec4 vColor;
out vec2 vPosition;
out float vDepth;
out float vDepthDiff;

void main () {
    // Fetch center point data
    uvec4 cen = texelFetch(u_texture, ivec2((uint(index) & 0x3ffu) << 1, uint(index) >> 10), 0);
    
    // Apply uniform scale to position
    vec3 scaledPos = uintBitsToFloat(cen.xyz) * u_uniformScale;
    vec4 cam = view * vec4(scaledPos, 1);
    
    vec4 pos2d = projection * cam;
    float clip = 1.2 * pos2d.w;
    
    // Clipping check
    vec4 clipBounds = abs(pos2d / pos2d.w);
    if (max(max(clipBounds.x, clipBounds.y), clipBounds.z) > 1.2) {
        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
        return;
    }

    // Covariance matrix calculation
    uvec4 cov = texelFetch(u_texture, ivec2(((uint(index) & 0x3ffu) << 1) | 1u, uint(index) >> 10), 0);
    vec2 u1 = unpackHalf2x16(cov.x), u2 = unpackHalf2x16(cov.y), u3 = unpackHalf2x16(cov.z);
    mat3 Vrk = mat3(u1.x, u1.y, u2.x, u1.y, u2.y, u3.x, u2.x, u3.x, u3.y);

    // Jacobian calculation
    mat3 J = mat3(
        focal.x / cam.z, 0., -(focal.x * cam.x) / (cam.z * cam.z),
        0., -focal.y / cam.z, (focal.y * cam.y) / (cam.z * cam.z),
        0., 0., 0.
    );
    
    mat3 T = transpose(mat3(view)) * J;
    mat3 cov2d = transpose(T) * Vrk * T;

    // Calculate eigenvalues
    float mid = (cov2d[0][0] + cov2d[1][1]) / 2.0;
    float radius = length(vec2((cov2d[0][0] - cov2d[1][1]) / 2.0, cov2d[0][1]));
    float lambda1 = mid + radius, lambda2 = mid - radius;
    
    if(lambda2 < 0.0) return;

    // Calculate axes with point size scaling
    vec2 diagonalVector = normalize(vec2(cov2d[0][1], lambda1 - cov2d[0][0]));
    vec2 majorAxis = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector * u_pointScale;
    vec2 minorAxis = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x) * u_pointScale;

    // Pass color to fragment shader
    vColor = clamp(pos2d.z/pos2d.w+1.0, 0.0, 1.0) * vec4((cov.w) & 0xffu, (cov.w >> 8) & 0xffu, (cov.w >> 16) & 0xffu, (cov.w >> 24) & 0xffu) / 255.0;
    vPosition = position;

    // Final position calculation
    vec2 vCenter = vec2(pos2d) / pos2d.w;
    gl_Position = vec4(
        vCenter
        + position.x * majorAxis / viewport
        + position.y * minorAxis / viewport, 
        0.0, 
        1.0
    );
}
`.trim();

export const fragmentShaderSource = `
#version 300 es
precision highp float;

uniform float u_opacity;

in vec4 vColor;
in vec2 vPosition;
out vec4 fragColor;

void main () {
    float A = -dot(vPosition, vPosition);
    if (A < -4.0) discard;
    
    // Apply opacity to the gaussian falloff
    float B = exp(A) * vColor.a * u_opacity;
    fragColor = vec4(B * vColor.rgb, B);
}

`.trim();
