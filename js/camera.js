import { vec3, mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export class Camera {
    constructor() {
        // Initialize vectors using gl-matrix
        this.position = vec3.fromValues(0, 5, 10);
        this.front = vec3.fromValues(0, 0, -1);
        this.up = vec3.fromValues(0, 1, 0);
        this.right = vec3.create();
        this.worldUp = vec3.fromValues(0, 1, 0);

        // Euler angles
        this.yaw = -90;
        this.pitch = 0;

        // Camera options
        this.movementSpeed = 10.0;
        this.mouseSensitivity = 0.1;

        this.updateCameraVectors();
        this.fy = 1164.6601287484507;
        this.fx = 1159.5880733038064;
    }

    updateCameraVectors() {
        // Calculate new front vector
        const front = vec3.create();
        front[0] = Math.cos(this.yaw * Math.PI / 180) * Math.cos(this.pitch * Math.PI / 180);
        front[1] = Math.sin(this.pitch * Math.PI / 180);
        front[2] = Math.sin(this.yaw * Math.PI / 180) * Math.cos(this.pitch * Math.PI / 180);
        vec3.normalize(this.front, front);

        // Recalculate right and up vectors
        vec3.cross(this.right, this.front, this.worldUp);
        vec3.normalize(this.right, this.right);
        vec3.cross(this.up, this.right, this.front);
        vec3.normalize(this.up, this.up);
    }

    processScreenSpaceRotation(angle) {
        // Rotate the up vector around the front vector
        const rotationMatrix = mat4.create();
        mat4.rotate(rotationMatrix, rotationMatrix, angle, this.front);
        
        // Apply rotation to up vector
        vec3.transformMat4(this.up, this.up, rotationMatrix);
        
        // Ensure up vector stays normalized
        vec3.normalize(this.up, this.up);
        
        // Update right vector
        vec3.cross(this.right, this.front, this.up);
        vec3.normalize(this.right, this.right);
    }

    lookAt(target) {
        if (Array.isArray(target)) {
            const targetVec = vec3.fromValues(target[0], target[1], target[2]);
            vec3.subtract(this.front, targetVec, this.position);
            vec3.normalize(this.front, this.front);
        } else {
            vec3.subtract(this.front, target, this.position);
            vec3.normalize(this.front, this.front);
        }
        this.updateCameraVectors();
    }

    processKeyboard(direction, deltaTime) {
        const velocity = this.movementSpeed * deltaTime;
        const moveVector = vec3.create();

        switch (direction) {
            case 'FORWARD':
                vec3.scaleAndAdd(this.position, this.position, this.front, velocity);
                break;
            case 'BACKWARD':
                vec3.scaleAndAdd(this.position, this.position, this.front, -velocity);
                break;
            case 'LEFT':
                vec3.scaleAndAdd(this.position, this.position, this.right, -velocity);
                break;
            case 'RIGHT':
                vec3.scaleAndAdd(this.position, this.position, this.right, velocity);
                break;
            case 'UP':
                // Use the camera's up vector instead of world up
                vec3.scaleAndAdd(this.position, this.position, this.up, velocity);
                break;
            case 'DOWN':
                vec3.scaleAndAdd(this.position, this.position, this.up, -velocity);
                break;
        }
    }

    processMouseMovement(xoffset, yoffset, constrainPitch = true) {
        xoffset *= this.mouseSensitivity;
        yoffset *= this.mouseSensitivity;

        this.yaw += xoffset;
        this.pitch += yoffset;

        // Constrain pitch
        if (constrainPitch) {
            this.pitch = Math.max(-89.0, Math.min(89.0, this.pitch));
        }

        this.updateCameraVectors();
    }

    getViewMatrix() {
        const viewMatrix = mat4.create();
        const target = vec3.create();
        vec3.add(target, this.position, this.front);
        mat4.lookAt(viewMatrix, this.position, target, this.up);
        return viewMatrix;
    }
}