
export class Octree {
    constructor(center, size) {
        this.center = center;  // {x, y, z}
        this.size = size;      // Half-length of the cube
        this.points = [];      // Points stored in this node
        this.children = null;  // Octants when subdivided
        this.maxPoints = 100;  // Maximum points before subdivision
    }

    // Calculate boundaries of the octree node
    getBounds() {
        return {
            min: {
                x: this.center.x - this.size,
                y: this.center.y - this.size,
                z: this.center.z - this.size
            },
            max: {
                x: this.center.x + this.size,
                y: this.center.y + this.size,
                z: this.center.z + this.size
            }
        };
    }

    // Check if a point is within this octree node's bounds
    containsPoint(point) {
        const bounds = this.getBounds();
        return (
            point.x >= bounds.min.x && point.x <= bounds.max.x &&
            point.y >= bounds.min.y && point.y <= bounds.max.y &&
            point.z >= bounds.min.z && point.z <= bounds.max.z
        );
    }

    // Subdivide node into 8 children
    subdivide() {
        const halfSize = this.size / 2;
        const children = [];

        // Create 8 octants
        for (let x = -1; x <= 1; x += 2) {
            for (let y = -1; y <= 1; y += 2) {
                for (let z = -1; z <= 1; z += 2) {
                    children.push(new Octree(
                        {
                            x: this.center.x + x * halfSize/2,
                            y: this.center.y + y * halfSize/2,
                            z: this.center.z + z * halfSize/2
                        },
                        halfSize/2
                    ));
                }
            }
        }

        this.children = children;

        // Redistribute existing points to children
        for (const point of this.points) {
            this.addToChildren(point);
        }
        this.points = []; // Clear points from parent
    }

    // Add point to appropriate child node
    addToChildren(point) {
        for (const child of this.children) {
            if (child.containsPoint(point)) {
                child.insert(point);
                break;
            }
        }
    }

    // Insert a point into the octree
    insert(point) {
        if (!this.containsPoint(point)) {
            return false;
        }

        if (this.children === null) {
            this.points.push(point);
            
            // Subdivide if we exceed maximum points
            if (this.points.length > this.maxPoints) {
                this.subdivide();
            }
        } else {
            this.addToChildren(point);
        }
        return true;
    }

    // Query points within a given radius of a position
    queryRadius(position, radius) {
        const points = [];
        this.queryRadiusRecursive(position, radius, points);
        return points;
    }

    // Recursive helper for radius query
    queryRadiusRecursive(position, radius, result) {
        // Early exit if this node is too far from the query sphere
        if (!this.intersectsSphere(position, radius)) {
            return;
        }

        // Check points in this node
        for (const point of this.points) {
            if (this.distanceSquared(position, point) <= radius * radius) {
                result.push(point);
            }
        }

        // Recurse into children if they exist
        if (this.children) {
            for (const child of this.children) {
                child.queryRadiusRecursive(position, radius, result);
            }
        }
    }

    // Check if node intersects with a sphere
    intersectsSphere(position, radius) {
        const bounds = this.getBounds();
        let closestPoint = {
            x: Math.max(bounds.min.x, Math.min(position.x, bounds.max.x)),
            y: Math.max(bounds.min.y, Math.min(position.y, bounds.max.y)),
            z: Math.max(bounds.min.z, Math.min(position.z, bounds.max.z))
        };
        
        return this.distanceSquared(position, closestPoint) <= radius * radius;
    }

    // Calculate squared distance between two points
    distanceSquared(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dz = a.z - b.z;
        return dx * dx + dy * dy + dz * dz;
    }

    // In Octree class, add distance check
    queryFrustum(frustum, cameraPosition) {
        const points = [];
        this.queryFrustumRecursive(frustum, points, cameraPosition);
        return points;
    }

    queryFrustumRecursive(frustum, result, cameraPosition) {
        // Early exit if node is outside frustum
        if (!frustum.intersectsBox(this.getBounds())) {
            return;
        }

        // Calculate distance to camera
        const dx = this.center.x - cameraPosition[0];
        const dy = this.center.y - cameraPosition[1];
        const dz = this.center.z - cameraPosition[2];
        const distanceToCamera = Math.sqrt(dx*dx + dy*dy + dz*dz);
        
        // LOD threshold based on distance and node size
        const lodThreshold = this.size * 1000; // Adjust this multiplier to tune LOD
        
        // If node is far away and has children, only add some points
        if (distanceToCamera > lodThreshold && this.children) {
            // Add a subset of points from this node
            const stride = Math.max(1, Math.floor(distanceToCamera / lodThreshold));
            for (let i = 0; i < this.points.length; i += stride) {
                result.push(this.points[i]);
            }
        } else {
            // Add all points from this node
            result.push(...this.points);
            
            // Recurse into children if they exist
            if (this.children) {
                for (const child of this.children) {
                    child.queryFrustumRecursive(frustum, result, cameraPosition);
                }
            }
        }
    }
}