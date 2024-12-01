import { createWorker } from "./splat/worker.js";
import { vertexShaderSource, fragmentShaderSource } from "./splat/shaderSource.js";
import { getProjectionMatrix } from "./splat/utils.js";
import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';

export class GaussianSplatApp {
    ROW_LENGTH = 3 * 4 + 3 * 4 + 4 + 4;

    constructor() {
        console.log('GaussianSplatApp constructor');
        this.initializeWebGL();

        let defaultViewMatrix = [
            0.47, 0.04, 0.88, 0, -0.11, 0.99, 0.02, 0, -0.88, -0.11, 0.47, 0, 0.07,
            0.03, 6.55, 1,
        ];
        this.viewMatrix = defaultViewMatrix;

        this.canvas;
        const gl = this.gl;
        this.projectionMatrix;
        this.activeKeys = [];

        this.initShader();
        this.setupWorker();
        this.setupWindowEventListeners();
        this.setupControlEventListeners();

        let jumpDelta = 0;
        this.vertexCount = 0;

        let lastFrame = 0;
        let start = 0;

        const frame = (now) => {
            const activeKeys = this.activeKeys;
            let inv = mat4.invert(mat4.create(), this.viewMatrix);
            let shiftKey =
                activeKeys.includes("Shift") ||
                activeKeys.includes("ShiftLeft") ||
                activeKeys.includes("ShiftRight");

            if (activeKeys.includes("ArrowUp")) {
                if (shiftKey) {
                    mat4.translate(inv, inv, [0, -0.03, 0]); // Translate downwards (Y axis)
                } else {
                    mat4.translate(inv, inv, [0, 0, 0.1]); // Translate forward (Z axis)
                }
            }
            if (activeKeys.includes("ArrowDown")) {
                if (shiftKey) {
                    mat4.translate(inv, inv, [0, 0.03, 0]); // Translate upwards (Y axis)
                } else {
                    mat4.translate(inv, inv, [0, 0, -0.1]); // Translate backward (Z axis)
                }
            }
            if (activeKeys.includes("ArrowLeft")) {
                mat4.translate(inv, inv, [-0.03, 0, 0]); // Translate left (X axis)
            }
            if (activeKeys.includes("ArrowRight")) {
                mat4.translate(inv, inv, [0.03, 0, 0]); // Translate right (X axis)
            }

            if (activeKeys.includes("KeyA")) {
                mat4.rotateY(inv, inv, -0.01); // Rotate around Y-axis (left)
            }
            if (activeKeys.includes("KeyD")) {
                mat4.rotateY(inv, inv, 0.01); // Rotate around Y-axis (right)
            }
            if (activeKeys.includes("KeyQ")) {
                mat4.rotateZ(inv, inv, 0.01); // Rotate around Z-axis (counterclockwise)
            }
            if (activeKeys.includes("KeyE")) {
                mat4.rotateZ(inv, inv, -0.01); // Rotate around Z-axis (clockwise)
            }
            if (activeKeys.includes("KeyW")) {
                mat4.rotateX(inv, inv, 0.005); // Rotate around X-axis (up)
            }
            if (activeKeys.includes("KeyS")) {
                mat4.rotateX(inv, inv, -0.005); // Rotate around X-axis (down)
            }

            if (
                ["KeyJ", "KeyK", "KeyL", "KeyI"].some((k) => activeKeys.includes(k))
            ) {
                let d = 4;
                mat4.translate(inv, inv, [0, 0, d]); // Translate along Z axis

                // Rotate around Y-axis if "KeyJ" or "KeyL" is pressed
                if (activeKeys.includes("KeyJ")) {
                    mat4.rotateY(inv, inv, -0.05); // Rotate left (counterclockwise)
                } else if (activeKeys.includes("KeyL")) {
                    mat4.rotateY(inv, inv, 0.05); // Rotate right (clockwise)
                }

                // Rotate around X-axis if "KeyI" or "KeyK" is pressed
                if (activeKeys.includes("KeyI")) {
                    mat4.rotateX(inv, inv, 0.05); // Rotate up (counterclockwise)
                } else if (activeKeys.includes("KeyK")) {
                    mat4.rotateX(inv, inv, -0.05); // Rotate down (clockwise)
                }

                mat4.translate(inv, inv, [0, 0, -d]); // Translate back along Z axis
            }

            mat4.invert(this.viewMatrix, inv);

            jumpDelta = Math.max(0, jumpDelta - 0.05);

            let inv2 = mat4.create();
            mat4.invert(inv2, this.viewMatrix);
            mat4.translate(inv2, inv2, [0, 0, jumpDelta]);
            mat4.rotateX(inv2, inv2, 0.1 * jumpDelta);
            let actualViewMatrix = mat4.invert(mat4.create(), inv2);

            //const viewProj = multiply4(this.projectionMatrix, actualViewMatrix);
            const viewProj = mat4.create();
            mat4.multiply(viewProj, this.projectionMatrix, actualViewMatrix);
            this.worker.postMessage({ view: viewProj });


            if (this.vertexCount > 0) {
                gl.uniformMatrix4fv(this.u_view, false, actualViewMatrix);
                gl.clear(gl.COLOR_BUFFER_BIT);
                gl.drawArraysInstanced(gl.TRIANGLE_FAN, 0, 4, this.vertexCount);
            } else {
                gl.clear(gl.COLOR_BUFFER_BIT);
                start = Date.now() + 2000;
            }
            lastFrame = now;
            requestAnimationFrame(frame);
        };

        frame();

        const isPly = (splatData) =>
            splatData[0] == 112 &&
            splatData[1] == 108 &&
            splatData[2] == 121 &&
            splatData[3] == 10;

        const selectFile = (file) => {
            const fr = new FileReader();
            stopLoading = true;
            fr.onload = () => {
                const splatData = new Uint8Array(fr.result);
                console.log("Loaded", Math.floor(splatData.length / this.ROW_LENGTH));

                if (isPly(splatData)) {
                    // ply file magic header means it should be handled differently
                    this.worker.postMessage({ ply: splatData.buffer, save: true });
                } else {
                    this.worker.postMessage({
                        buffer: splatData.buffer,
                        vertexCount: Math.floor(splatData.length / this.ROW_LENGTH),
                    });
                }
            };
            fr.readAsArrayBuffer(file);
        };

        const preventDefault = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        document.addEventListener("dragenter", preventDefault);
        document.addEventListener("dragover", preventDefault);
        document.addEventListener("dragleave", preventDefault);
        document.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            selectFile(e.dataTransfer.files[0]);
        });

        let stopLoading = false;
    }

    initializeWebGL() {
        this.canvas = document.getElementById('glCanvas');
        if (!this.canvas) {
            console.error('Canvas element not found');
            return;
        }

        this.gl = this.canvas.getContext("webgl2", {
            antialias: false,
        });

        const gl = this.gl;
        gl.disable(gl.DEPTH_TEST); // Disable depth testing

        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(
            gl.ONE_MINUS_DST_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_DST_ALPHA,
            gl.ONE,
        );
        gl.blendEquationSeparate(gl.FUNC_ADD, gl.FUNC_ADD);
    }

    initShader() {
        const gl = this.gl;

        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS))
            console.error(gl.getShaderInfoLog(vertexShader));

        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS))
            console.error(gl.getShaderInfoLog(fragmentShader));

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.useProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS))
            console.error(gl.getProgramInfoLog(program));

        this.u_projection = gl.getUniformLocation(program, "projection");
        this.u_viewport = gl.getUniformLocation(program, "viewport");
        this.u_focal = gl.getUniformLocation(program, "focal");
        this.u_view = gl.getUniformLocation(program, "view");

        // positions
        const triangleVertices = new Float32Array([-2, -2, 2, -2, 2, 2, -2, 2]);
        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
        const a_position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(a_position);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.vertexAttribPointer(a_position, 2, gl.FLOAT, false, 0, 0);

        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);

        var u_textureLocation = gl.getUniformLocation(program, "u_texture");
        gl.uniform1i(u_textureLocation, 0);

        this.indexBuffer = gl.createBuffer();
        this.a_index = gl.getAttribLocation(program, "index");
        gl.enableVertexAttribArray(this.a_index);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
        gl.vertexAttribIPointer(this.a_index, 1, gl.INT, false, 0, 0);
        gl.vertexAttribDivisor(this.a_index, 1);
    }

    setupWorker() {
        //console.log(createWorker.toString());
        this.worker = new Worker(
            URL.createObjectURL(
                new Blob(["(", createWorker.toString(), ")(self)"], {
                    type: "application/javascript",
                }),
            ),
        );

        const gl = this.gl;

        this.worker.onmessage = (e) => {
            if (e.data.buffer) {
                this.splatData = new Uint8Array(e.data.buffer);
            } else if (e.data.texdata) {
                const { texdata, texwidth, texheight } = e.data;
                // console.log("Texture data changed", e.data);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_S,
                    gl.CLAMP_TO_EDGE,
                );
                gl.texParameteri(
                    gl.TEXTURE_2D,
                    gl.TEXTURE_WRAP_T,
                    gl.CLAMP_TO_EDGE,
                );
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    gl.RGBA32UI,
                    texwidth,
                    texheight,
                    0,
                    gl.RGBA_INTEGER,
                    gl.UNSIGNED_INT,
                    texdata,
                );
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, this.texture);
            } else if (e.data.depthIndex) {
                const { depthIndex, viewProj } = e.data;
                // console.log("Depth index changed", e.data);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
                this.vertexCount = e.data.vertexCount;
            }
        };
    }

    setupWindowEventListeners() {
        const gl = this.gl;
        const camera = {
            id: 0,
            img_name: "00001",
            width: 1959,
            height: 1090,
            position: [
                -3.0089893469241797, -0.11086489695181866, -3.7527640949141428,
            ],
            rotation: [
                [0.876134201218856, 0.06925962026449776, 0.47706599800804744],
                [-0.04747421839895102, 0.9972110940209488, -0.057586739349882114],
                [-0.4797239414934443, 0.027805376500959853, 0.8769787916452908],
            ],
            fy: 1164.6601287484507,
            fx: 1159.5880733038064,
        }
        const downsample = 1;

        const resize = () => {
            gl.uniform2fv(this.u_focal, new Float32Array([camera.fx, camera.fy])); // update the focal length in the shader

            this.projectionMatrix = getProjectionMatrix( // update the projection matrix
                camera.fx,
                camera.fy,
                innerWidth,
                innerHeight,
            );

            gl.uniform2fv(this.u_viewport, new Float32Array([innerWidth, innerHeight])); // update the viewport size in the shader

            gl.canvas.width = Math.round(innerWidth / downsample);
            gl.canvas.height = Math.round(innerHeight / downsample);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); // update the viewport size in the WebGL context

            gl.uniformMatrix4fv(this.u_projection, false, this.projectionMatrix); // update the projection matrix in the shader
        };

        window.addEventListener("resize", resize);
        resize();
    }

    setupControlEventListeners() {
        window.addEventListener("keydown", (e) => {
            // if (document.activeElement != document.body) return;
            if (!this.activeKeys.includes(e.code)) this.activeKeys.push(e.code);

            if (e.code == "KeyV") { // save the current view matrix to the URL hash
                location.hash =
                    "#" +
                    JSON.stringify(
                        this.viewMatrix.map((k) => Math.round(k * 100) / 100),
                    );
            }
        });

        window.addEventListener("keyup", (e) => { // remove the key from the active keys list
            this.activeKeys = this.activeKeys.filter((k) => k !== e.code);
        });
        window.addEventListener("blur", () => { // clear the active keys list when the window loses focus
            this.activeKeys = [];
        });

        window.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const lineHeight = 10;
                const scale =
                    e.deltaMode == 1
                        ? lineHeight
                        : e.deltaMode == 2
                            ? innerHeight
                            : 1;
                let inv = mat4.invert(mat4.create(), this.viewMatrix);
                if (e.shiftKey) {
                    mat4.translate(
                        inv,
                        inv,
                        [
                            (e.deltaX * scale) / innerWidth,  // X translation
                            (e.deltaY * scale) / innerHeight, // Y translation
                            0                                // Z translation (no change)
                        ]
                    );
                } else if (e.ctrlKey || e.metaKey) {
                    mat4.translate(
                        inv,
                        inv,
                        [
                            0,                                // X translation (no change)
                            0,                                // Y translation (no change)
                            (-10 * (e.deltaY * scale)) / innerHeight // Z translation
                        ]
                    );
                } else {
                    let d = 4;
                    mat4.translate(inv, inv, [0, 0, d]);

                    // Apply rotation around the Y-axis (based on horizontal mouse movement)
                    mat4.rotateY(inv, inv, -(e.deltaX * scale) / innerWidth);

                    // Apply rotation around the X-axis (based on vertical mouse movement)
                    mat4.rotateX(inv, inv, (e.deltaY * scale) / innerHeight);

                    // Apply translation back along the Z-axis
                    mat4.translate(inv, inv, [0, 0, -d]);
                }

                mat4.invert(this.viewMatrix, inv);
            },
            { passive: false },
        );

        const canvas = this.canvas;
        let startX, startY, down;
        canvas.addEventListener("mousedown", (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            down = e.ctrlKey || e.metaKey ? 2 : 1;
        });
        canvas.addEventListener("contextmenu", (e) => {
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            down = 2;
        });

        canvas.addEventListener("mousemove", (e) => {
            e.preventDefault();
            if (down == 1) {
                let inv = mat4.invert(mat4.create(), this.viewMatrix);
                let dx = (5 * (e.clientX - startX)) / innerWidth;
                let dy = (5 * (e.clientY - startY)) / innerHeight;
                let d = 4;

                // Apply translation along Z-axis
                mat4.translate(inv, inv, [0, 0, d]);

                // Apply rotation around Y-axis (dx controls rotation)
                mat4.rotateY(inv, inv, dx);

                // Apply rotation around X-axis (-dy controls rotation)
                mat4.rotateX(inv, inv, -dy);

                // Apply translation back along Z-axis
                mat4.translate(inv, inv, [0, 0, -d]);

                mat4.invert(this.viewMatrix, inv);

                startX = e.clientX;
                startY = e.clientY;
            } else if (down == 2) {
                let inv = mat4.invert(mat4.create(), this.viewMatrix);

                inv = mat4.translate(
                    inv,
                    inv,
                    [
                        (-10 * (e.clientX - startX)) / innerWidth,  // X translation
                        0,  // Y translation (no change)
                        (10 * (e.clientY - startY)) / innerHeight   // Z translation
                    ]
                );
                this.viewMatrix = mat4.invert(mat4.create(), inv);

                startX = e.clientX;
                startY = e.clientY;
            }
        });
        canvas.addEventListener("mouseup", (e) => {
            e.preventDefault();
            down = false;
            startX = 0;
            startY = 0;
        });
    }
}
