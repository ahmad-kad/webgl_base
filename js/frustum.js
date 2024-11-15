import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export class Frustum {
    constructor() {
        this.planes = new Array(6);  // Near, Far, Left, Right, Top, Bottom
    }

    // Update frustum planes from projection and view matrices
    update(projectionMatrix, viewMatrix) {
        // Combine projection and view matrices
        const clip = mat4.multiply(mat4.create(), projectionMatrix, viewMatrix);
        
        // Extract frustum planes
        // Left plane
        this.planes[0] = {
            x: clip[3] + clip[0],
            y: clip[7] + clip[4],
            z: clip[11] + clip[8],
            w: clip[15] + clip[12]
        };
        
        // Right plane
        this.planes[1] = {
            x: clip[3] - clip[0],
            y: clip[7] - clip[4],
            z: clip[11] - clip[8],
            w: clip[15] - clip[12]
        };
        
        // Bottom plane
        this.planes[2] = {
            x: clip[3] + clip[1],
            y: clip[7] + clip[5],
            z: clip[11] + clip[9],
            w: clip[15] + clip[13]
        };
        
        // Top plane
        this.planes[3] = {
            x: clip[3] - clip[1],
            y: clip[7] - clip[5],
            z: clip[11] - clip[9],
            w: clip[15] - clip[13]
        };
        
        // Near plane
        this.planes[4] = {
            x: clip[3] + clip[2],
            y: clip[7] + clip[6],
            z: clip[11] + clip[10],
            w: clip[15] + clip[14]
        };
        
        // Far plane
        this.planes[5] = {
            x: clip[3] - clip[2],
            y: clip[7] - clip[6],
            z: clip[11] - clip[10],
            w: clip[15] - clip[14]
        };

        // Normalize planes
        for (const plane of this.planes) {
            const len = Math.sqrt(plane.x * plane.x + plane.y * plane.y + plane.z * plane.z);
            plane.x /= len;
            plane.y /= len;
            plane.z /= len;
            plane.w /= len;
        }
    }

    // Test if a point is inside the frustum
    containsPoint(point) {
        for (const plane of this.planes) {
            if (plane.x * point.x + plane.y * point.y + plane.z * point.z + plane.w <= 0) {
                return false;
            }
        }
        return true;
    }

    // Test if a box intersects or is inside the frustum
    intersectsBox(bounds) {
        for (const plane of this.planes) {
            let px = bounds.min.x, py = bounds.min.y, pz = bounds.min.z;
            if (plane.x >= 0) px = bounds.max.x;
            if (plane.y >= 0) py = bounds.max.y;
            if (plane.z >= 0) pz = bounds.max.z;
            
            if (plane.x * px + plane.y * py + plane.z * pz + plane.w < 0) {
                return false;
            }
        }
        return true;
    }
}