import { createWorker } from "./splat/worker.js";
import { vertexShaderSource, fragmentShaderSource } from "./splat/shaderSource.js";
import { getProjectionMatrix, invert4, multiply4, rotate4, translate4 } from "./splat/utils.js";

export class GaussianSplatApp {
    ROW_LENGTH = 3 * 4 + 3 * 4 + 4 + 4;

    constructor() {
        console.log('GaussianSplatApp constructor');
        this.initializeWebGL();
        this.carousel = true;

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
            let inv = invert4(this.viewMatrix);
            let shiftKey =
                activeKeys.includes("Shift") ||
                activeKeys.includes("ShiftLeft") ||
                activeKeys.includes("ShiftRight");

            if (activeKeys.includes("ArrowUp")) {
                if (shiftKey) {
                    inv = translate4(inv, 0, -0.03, 0);
                } else {
                    inv = translate4(inv, 0, 0, 0.1);
                }
            }
            if (activeKeys.includes("ArrowDown")) {
                if (shiftKey) {
                    inv = translate4(inv, 0, 0.03, 0);
                } else {
                    inv = translate4(inv, 0, 0, -0.1);
                }
            }
            if (activeKeys.includes("ArrowLeft"))
                inv = translate4(inv, -0.03, 0, 0);
            //
            if (activeKeys.includes("ArrowRight"))
                inv = translate4(inv, 0.03, 0, 0);
            // inv = rotate4(inv, 0.01, 0, 1, 0);
            if (activeKeys.includes("KeyA")) inv = rotate4(inv, -0.01, 0, 1, 0);
            if (activeKeys.includes("KeyD")) inv = rotate4(inv, 0.01, 0, 1, 0);
            if (activeKeys.includes("KeyQ")) inv = rotate4(inv, 0.01, 0, 0, 1);
            if (activeKeys.includes("KeyE")) inv = rotate4(inv, -0.01, 0, 0, 1);
            if (activeKeys.includes("KeyW")) inv = rotate4(inv, 0.005, 1, 0, 0);
            if (activeKeys.includes("KeyS")) inv = rotate4(inv, -0.005, 1, 0, 0);

            if (
                ["KeyJ", "KeyK", "KeyL", "KeyI"].some((k) => activeKeys.includes(k))
            ) {
                let d = 4;
                inv = translate4(inv, 0, 0, d);
                inv = rotate4(
                    inv,
                    activeKeys.includes("KeyJ")
                        ? -0.05
                        : activeKeys.includes("KeyL")
                            ? 0.05
                            : 0,
                    0,
                    1,
                    0,
                );
                inv = rotate4(
                    inv,
                    activeKeys.includes("KeyI")
                        ? 0.05
                        : activeKeys.includes("KeyK")
                            ? -0.05
                            : 0,
                    1,
                    0,
                    0,
                );
                inv = translate4(inv, 0, 0, -d);
            }

            this.viewMatrix = invert4(inv);

            if (this.carousel) {
                let inv = invert4(defaultViewMatrix);

                const t = Math.sin((Date.now() - start) / 5000);
                inv = translate4(inv, 2.5 * t, 0, 6 * (1 - Math.cos(t)));
                inv = rotate4(inv, -0.6 * t, 0, 1, 0);

                this.viewMatrix = invert4(inv);
            }

            jumpDelta = Math.max(0, jumpDelta - 0.05);

            let inv2 = invert4(this.viewMatrix);
            inv2 = translate4(inv2, 0, -jumpDelta, 0);
            inv2 = rotate4(inv2, -0.1 * jumpDelta, 1, 0, 0);
            let actualViewMatrix = invert4(inv2);

            const viewProj = multiply4(this.projectionMatrix, actualViewMatrix);
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
            this.carousel = false;
            if (!this.activeKeys.includes(e.code)) this.activeKeys.push(e.code);

            if (e.code == "KeyV") { // save the current view matrix to the URL hash
                location.hash =
                    "#" +
                    JSON.stringify(
                        this.viewMatrix.map((k) => Math.round(k * 100) / 100),
                    );
            } else if (e.code === "KeyP") { // start carousel mode
                this.carousel = true;
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
                this.carousel = false;
                e.preventDefault();
                const lineHeight = 10;
                const scale =
                    e.deltaMode == 1
                        ? lineHeight
                        : e.deltaMode == 2
                            ? innerHeight
                            : 1;
                let inv = invert4(this.viewMatrix);
                if (e.shiftKey) {
                    inv = translate4(
                        inv,
                        (e.deltaX * scale) / innerWidth,
                        (e.deltaY * scale) / innerHeight,
                        0,
                    );
                } else if (e.ctrlKey || e.metaKey) {
                    // inv = rotate4(inv,  (e.deltaX * scale) / innerWidth,  0, 0, 1);
                    // inv = translate4(inv,  0, (e.deltaY * scale) / innerHeight, 0);
                    // let preY = inv[13];
                    inv = translate4(
                        inv,
                        0,
                        0,
                        (-10 * (e.deltaY * scale)) / innerHeight,
                    );
                    // inv[13] = preY;
                } else {
                    let d = 4;
                    inv = translate4(inv, 0, 0, d);
                    inv = rotate4(inv, -(e.deltaX * scale) / innerWidth, 0, 1, 0);
                    inv = rotate4(inv, (e.deltaY * scale) / innerHeight, 1, 0, 0);
                    inv = translate4(inv, 0, 0, -d);
                }

                this.viewMatrix = invert4(inv);
            },
            { passive: false },
        );

        const canvas = this.canvas;
        let startX, startY, down;
        canvas.addEventListener("mousedown", (e) => {
            this.carousel = false;
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            down = e.ctrlKey || e.metaKey ? 2 : 1;
        });
        canvas.addEventListener("contextmenu", (e) => {
            this.carousel = false;
            e.preventDefault();
            startX = e.clientX;
            startY = e.clientY;
            down = 2;
        });

        canvas.addEventListener("mousemove", (e) => {
            e.preventDefault();
            if (down == 1) {
                let inv = invert4(this.viewMatrix);
                let dx = (5 * (e.clientX - startX)) / innerWidth;
                let dy = (5 * (e.clientY - startY)) / innerHeight;
                let d = 4;

                inv = translate4(inv, 0, 0, d);
                inv = rotate4(inv, dx, 0, 1, 0);
                inv = rotate4(inv, -dy, 1, 0, 0);
                inv = translate4(inv, 0, 0, -d);
                // let postAngle = Math.atan2(inv[0], inv[10])
                // inv = rotate4(inv, postAngle - preAngle, 0, 0, 1)
                // console.log(postAngle)
                this.viewMatrix = invert4(inv);

                startX = e.clientX;
                startY = e.clientY;
            } else if (down == 2) {
                let inv = invert4(this.viewMatrix);
                // inv = rotateY(inv, );
                // let preY = inv[13];
                inv = translate4(
                    inv,
                    (-10 * (e.clientX - startX)) / innerWidth,
                    0,
                    (10 * (e.clientY - startY)) / innerHeight,
                );
                // inv[13] = preY;
                this.viewMatrix = invert4(inv);

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
