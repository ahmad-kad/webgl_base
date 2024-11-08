class Camera {
    constructor(gl) {
        // Camera position and orientation
        this.position = glMatrix.vec3.fromValues(0, 5, 10);
        this.front = glMatrix.vec3.fromValues(0, 0, -1);
        this.up = glMatrix.vec3.fromValues(0, 1, 0);
        this.right = glMatrix.vec3.create();
        this.worldUp = glMatrix.vec3.fromValues(0, 1, 0);

        // Euler angles
        this.yaw = -90;
        this.pitch = 0;

        // Camera options
        this.movementSpeed = 10.0;
        this.mouseSensitivity = 0.1;

        this.updateCameraVectors();
    }

    updateCameraVectors() {
        // Calculate new front vector
        const front = glMatrix.vec3.create();
        front[0] = Math.cos(glMatrix.glMatrix.toRadian(this.yaw)) * Math.cos(glMatrix.glMatrix.toRadian(this.pitch));
        front[1] = Math.sin(glMatrix.glMatrix.toRadian(this.pitch));
        front[2] = Math.sin(glMatrix.glMatrix.toRadian(this.yaw)) * Math.cos(glMatrix.glMatrix.toRadian(this.pitch));
        glMatrix.vec3.normalize(this.front, front);

        // Re-calculate right and up vectors
        glMatrix.vec3.cross(this.right, this.front, this.worldUp);
        glMatrix.vec3.normalize(this.right, this.right);
        
        glMatrix.vec3.cross(this.up, this.right, this.front);
        glMatrix.vec3.normalize(this.up, this.up);
    }

    processKeyboard(direction, deltaTime) {
        const velocity = this.movementSpeed * deltaTime;

        switch(direction) {
            case 'FORWARD':
                glMatrix.vec3.scaleAndAdd(this.position, this.position, this.front, velocity);
                break;
            case 'BACKWARD':
                glMatrix.vec3.scaleAndAdd(this.position, this.position, this.front, -velocity);
                break;
            case 'LEFT':
                glMatrix.vec3.scaleAndAdd(this.position, this.position, this.right, -velocity);
                break;
            case 'RIGHT':
                glMatrix.vec3.scaleAndAdd(this.position, this.position, this.right, velocity);
                break;
            case 'UP':
                this.position[1] += velocity;
                break;
            case 'DOWN':
                this.position[1] -= velocity;
                break;
        }
    }

    processMouseMovement(xoffset, yoffset, constrainPitch = true) {
        xoffset *= this.mouseSensitivity;
        yoffset *= this.mouseSensitivity;

        this.yaw += xoffset;
        this.pitch += yoffset;

        if (constrainPitch) {
            if (this.pitch > 89.0) this.pitch = 89.0;
            if (this.pitch < -89.0) this.pitch = -89.0;
        }

        this.updateCameraVectors();
    }

    getViewMatrix() {
        const target = glMatrix.vec3.create();
        glMatrix.vec3.add(target, this.position, this.front);
        const viewMatrix = glMatrix.mat4.create();
        glMatrix.mat4.lookAt(viewMatrix, this.position, target, this.up);
        return viewMatrix;
    }
}