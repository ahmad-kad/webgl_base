import { createWorker } from "./splat/worker.js";
import { vertexShaderSource, fragmentShaderSource } from "./splat/shaderSource.js";
import { getProjectionMatrix } from "./splat/utils.js";
import { mat4 } from 'https://cdn.skypack.dev/gl-matrix';
import { Camera } from './camera.js';
import { Controls } from './controls.js';
import { Grid } from './grid.js';
import { ViewerControls } from './viewer-controls.js';

export class GaussianSplatApp {
    ROW_LENGTH = 3 * 4 + 3 * 4 + 4 + 4;

    constructor() {
        console.log('GaussianSplatApp constructor');
        this.initializeWebGL();
        this.initComponents();
        this.initShader();
        this.setupWorker();
        this.setupWindowEventListeners();
        this.viewerControls = new ViewerControls(this);

        this.uniformScale = 1.0;
        this.pointScale = 1.0;
        this.opacity = 1.0;
        this.splatSize = 1.0;
        this.useAlphaBlending = true;
        
        // Initialize these values after shader compilation
        this.initializeUniforms();

        const frame = (now) => {
            now *= 0.001;
            const deltaTime = now - this.lastFrame;
            this.lastFrame = now;
            
            this.controls.update(deltaTime);
            let actualViewMatrix = this.camera.getViewMatrix();
            const viewProj = mat4.create();
            mat4.multiply(viewProj, this.projectionMatrix, actualViewMatrix);
            this.worker.postMessage({ view: viewProj });

            //this.grid.draw(this.projectionMatrix, actualViewMatrix);

            if (this.vertexCount > 0) {
                this.draw();
            }
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
            fr.onload = () => {
                const splatData = new Uint8Array(fr.result);
                console.log("Loaded", Math.floor(splatData.length / this.ROW_LENGTH));

                if (isPly(splatData)) {
                    this.worker.postMessage({ ply: splatData.buffer });
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
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        gl.disable(gl.DEPTH_TEST);

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

    initComponents() {
        this.camera = new Camera();
        this.camera.position = [
            -3.0089893469241797, -0.11086489695181866, -3.7527640949141428,
        ];
        this.camera.front = [0.876134201218856, 0.06925962026449776, 0.47706599800804744];
        this.camera.up = [-0.04747421839895102, 0.9972110940209488, -0.057586739349882114];
        this.camera.right = [-0.4797239414934443, 0.027805376500959853, 0.8769787916452908];

        this.controls = new Controls(this.camera, this.canvas);

        this.grid = new Grid(this.gl);
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
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, triangleVertices, gl.STATIC_DRAW);
        this.a_position = gl.getAttribLocation(program, "position");
        gl.enableVertexAttribArray(this.a_position);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.vertexAttribPointer(this.a_position, 2, gl.FLOAT, false, 0, 0);

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

        this.program = program;
    }

    initializeUniforms() {
        const gl = this.gl;
        gl.useProgram(this.program);
        
        // Store uniform locations
        this.u_uniformScale = gl.getUniformLocation(this.program, "u_uniformScale");
        this.u_pointScale = gl.getUniformLocation(this.program, "u_pointScale");
        this.u_opacity = gl.getUniformLocation(this.program, "u_opacity");
        this.u_splatSize = gl.getUniformLocation(this.program, "u_splatSize");
        this.u_useAlphaBlending = gl.getUniformLocation(this.program, "u_useAlphaBlending");
        
        // Set initial values
        gl.uniform1f(this.u_splatSize, this.splatSize);
        gl.uniform1i(this.u_useAlphaBlending, this.useAlphaBlending);
        gl.uniform1f(this.u_uniformScale, this.uniformScale);
        gl.uniform1f(this.u_pointScale, this.pointScale);
        gl.uniform1f(this.u_opacity, this.opacity);
    }

    // Add setter methods for the controls
    setUniformScale(scale) {
        this.uniformScale = Math.max(0.1, scale);
        this.gl.useProgram(this.program);
        this.gl.uniform1f(this.u_uniformScale, this.uniformScale);
    }

    setPointScale(scale) {
        this.pointScale = Math.max(0.1, scale);
        this.gl.useProgram(this.program);
        this.gl.uniform1f(this.u_pointScale, this.pointScale);
    }

    setOpacity(opacity) {
        this.opacity = Math.max(0.0, Math.min(1.0, opacity));
        this.gl.useProgram(this.program);
        this.gl.uniform1f(this.u_opacity, this.opacity);
    }
    
    setSplatSize(size) {
        this.splatSize = Math.max(0.1, size);
        this.gl.useProgram(this.program);
        this.gl.uniform1f(this.u_splatSize, this.splatSize);
    }

    setAlphaBlending(enabled) {
        this.useAlphaBlending = enabled;
        this.gl.useProgram(this.program);
        this.gl.uniform1i(this.u_useAlphaBlending, enabled);
        
        // Update GL blending state
        if (enabled) {
            this.gl.enable(this.gl.BLEND);
            this.gl.blendFunc(
                this.gl.ONE_MINUS_DST_ALPHA,
                this.gl.ONE,
                this.gl.ONE_MINUS_DST_ALPHA,
                this.gl.ONE
            );
        } else {
            this.gl.disable(this.gl.BLEND);
        }
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
                //console.log("Depth index changed", e.data);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.indexBuffer);
                gl.bufferData(gl.ARRAY_BUFFER, depthIndex, gl.DYNAMIC_DRAW);
                this.vertexCount = e.data.vertexCount;
            }
        };
    }

    draw() {
        this.gl.useProgram(this.program);

        // Set uniforms
        this.gl.uniformMatrix4fv(this.u_projection, false, this.projectionMatrix);
        this.gl.uniform2fv(this.u_viewport, new Float32Array([innerWidth, innerHeight]));
        this.gl.uniform2fv(this.u_focal, new Float32Array([this.camera.fx, this.camera.fy]));

        this.gl.uniform1f(this.u_uniformScale, this.uniformScale);
        this.gl.uniform1f(this.u_pointScale, this.pointScale);
        this.gl.uniform1f(this.u_opacity, this.opacity);

        this.gl.uniformMatrix4fv(this.u_view, false, this.camera.getViewMatrix());

        // Set vertices
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(this.a_position, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.a_position);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.indexBuffer);
        this.gl.vertexAttribIPointer(this.a_index, 1, this.gl.INT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.a_index);

        // Draw
                this.gl.uniform1f(this.u_uniformScale, this.uniformScale);
        this.gl.uniform1f(this.u_pointScale, this.pointScale);
        this.gl.uniform1f(this.u_opacity, this.opacity);
        this.gl.drawArraysInstanced(this.gl.TRIANGLE_FAN, 0, 4, this.vertexCount);


        // Clean up
        this.gl.disableVertexAttribArray(this.a_position);
        this.gl.disableVertexAttribArray(this.a_index);
    }

    setupWindowEventListeners() {
        const gl = this.gl;

        const resize = () => {
            gl.uniform2fv(this.u_focal, new Float32Array([this.camera.fx, this.camera.fy])); // update the focal length in the shader

            this.projectionMatrix = getProjectionMatrix( // update the projection matrix
                this.camera.fx,
                this.camera.fy,
                innerWidth,
                innerHeight,
            );

            gl.uniform2fv(this.u_viewport, new Float32Array([innerWidth, innerHeight])); // update the viewport size in the shader

            gl.canvas.width = Math.round(innerWidth);
            gl.canvas.height = Math.round(innerHeight);
            gl.viewport(0, 0, gl.canvas.width, gl.canvas.height); // update the viewport size in the WebGL context

            gl.uniformMatrix4fv(this.u_projection, false, this.projectionMatrix); // update the projection matrix in the shader
        };

        window.addEventListener("resize", resize);
        resize();
    }

}


