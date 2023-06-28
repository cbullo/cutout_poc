/**
 * @license
 * Copyright 2022 Google LLC. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * =============================================================================
 */

import { VIDEO_SIZE } from "./shared/params";
import { drawResults, isMobile } from "./shared/util";
import { TRIANGULATION } from "./shared/triangulation";

export class Camera {
  constructor() {
    this.video = document.getElementById("video");
    this.canvas = document.getElementById("output");
    this.canvasGl = document.getElementById("output-gl");
    this.ctx = this.canvas.getContext("2d");
    this.gl = this.canvasGl.getContext("webgl2");
  }

  createTexture() {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);

    // Because video has to be download over the internet
    // they might take a moment until it's ready so
    // put a single pixel in the texture so we can
    // // use it immediately.
    // const level = 0;
    // const internalFormat = this.gl.RGBA;
    // const width = 640;
    // const height = 480;
    // const border = 0;
    // const srcFormat = this.gl.RGBA;
    // const srcType = this.gl.UNSIGNED_BYTE;
    // const pixel = new Uint8Array([0, 0, 255, 255]); // opaque blue
    // this.gl.texImage2D(
    //   this.gl.TEXTURE_2D,
    //   level,
    //   internalFormat,
    //   width,
    //   height,
    //   border,
    //   srcFormat,
    //   srcType,
    //   pixel
    // );

    // Turn off mips and set wrapping to clamp to edge so it
    // will work regardless of the dimensions of the video.
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_S,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_WRAP_T,
      this.gl.CLAMP_TO_EDGE
    );
    this.gl.texParameteri(
      this.gl.TEXTURE_2D,
      this.gl.TEXTURE_MIN_FILTER,
      this.gl.LINEAR
    );

    return texture;
  }

  createShader(sourceCode, type) {
    // Compiles either a shader of type gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
    const shader = this.gl.createShader(type);
    this.gl.shaderSource(shader, sourceCode);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      throw `Could not compile WebGL program. \n\n${info}`;
    }
    return shader;
  }

  updateNormals(vertices, indices, outNormals) {
    for (let i = 0; i < outNormals.length; i ++) {
      outNormals[i] = 0.0;
    }
    
    for (let i = 0; i < indices.length; i += 3) {
      const idx1 = indices[i];
      const idx2 = indices[i + 1];
      const idx3 = indices[i + 2];
  
      // Calculate the triangle's normal
      const v1 = Array.from(vertices.subarray(3 * idx1, 3 * idx1 + 3));
      const v2 = Array.from(vertices.subarray(3 * idx2, 3 * idx2 + 3));
      const v3 = Array.from(vertices.subarray(3 * idx3, 3 * idx3 + 3));

      const edge1 = math.subtract(v2, v1);
      const edge2 = math.subtract(v3, v1);
      const normal = math.cross(edge1, edge2);
    
      outNormals[3 * idx1 + 0] += normal[0];
      outNormals[3 * idx1 + 1] += normal[1];
      outNormals[3 * idx1 + 2] += normal[2];

      outNormals[3 * idx2 + 0] += normal[0];
      outNormals[3 * idx2 + 1] += normal[1];
      outNormals[3 * idx2 + 2] += normal[2];

      outNormals[3 * idx3 + 0] += normal[0];
      outNormals[3 * idx3 + 1] += normal[1];
      outNormals[3 * idx3 + 2] += normal[2];
    }

    for (let i = 0; i < outNormals.length; i += 3) {
      let n = math.norm(Array.from(outNormals.subarray(i, i + 3)));
      if (n < 1e-6) {
        continue;
      }
      outNormals[i + 0] /= n;
      outNormals[i + 1] /= n;
      outNormals[i + 2] /= n;
    }
  }

  compileShaders() {
    const vertexShaderSource = `
      attribute vec3 position;
      attribute vec3 normal;

      varying highp vec3 worldPos;
      varying highp vec3 worldNormal;
      void main() {
        vec3 p = vec3(2.0 * (position.x / 640.0) - 1.0, -2.0 * (position.y / 480.0) + 1.0, 2.0 * (position.z / 640.0));
        gl_Position = vec4(p, 1.0);
        worldPos = vec3(position.x / 640.0, position.y / 480.0, position.z / 640.0);
        worldNormal = normal;
      }`;

    //Use the createShader function from the example above
    const vertexShader = this.createShader(
      vertexShaderSource,
      this.gl.VERTEX_SHADER
    );

    const fragmentShaderSource = `
    uniform sampler2D videoTexture;
    uniform highp vec3 lightPos;
    varying highp vec3 worldPos; 
    varying highp vec3 worldNormal;
    
    //const highp vec3 lightPos = vec3(0.7, 0.7, 0.0);
    void main() {
        highp vec3 normal = normalize(worldNormal);
        highp vec3 dir = normalize(lightPos - worldPos);
                
        //highp float lightVal = abs(dot(normal, vec3(0.7, 0.7, 0.0)));
        highp float lightVal = dot(normal, dir);
        highp vec4 texelColor = texture2D(videoTexture, worldPos.xy);
        //gl_FragColor = vec4(texelColor.rgb, 1.0);
        gl_FragColor = vec4(texelColor.rgb * (0.7 + 0.3 * lightVal), 1.0);
      }`;

    //Use the createShader function from the example above
    const fragmentShader = this.createShader(
      fragmentShaderSource,
      this.gl.FRAGMENT_SHADER
    );

    const program = this.gl.createProgram();

    // Attach pre-existing shaders
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);

    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      throw `Could not compile WebGL program. \n\n${info}`;
    }

    return program;
  }
  /**
   * Initiate a Camera instance and wait for the camera stream to be ready.
   * @param cameraParam From app `STATE.camera`.
   */
  static async setupCamera(cameraParam) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Browser API navigator.mediaDevices.getUserMedia not available"
      );
    }

    const { targetFPS, sizeOption } = cameraParam;
    const $size = VIDEO_SIZE[sizeOption];
    const videoConfig = {
      audio: false,
      video: {
        facingMode: "user",
        // Only setting the video to a specified size for large screen, on
        // mobile devices accept the default size.
        width: isMobile() ? VIDEO_SIZE["360 X 270"].width : $size.width,
        height: isMobile() ? VIDEO_SIZE["360 X 270"].height : $size.height,
        frameRate: {
          ideal: targetFPS,
        },
      },
    };

    const stream = await navigator.mediaDevices.getUserMedia(videoConfig);

    const camera = new Camera();
    camera.video.srcObject = stream;

    await new Promise((resolve) => {
      camera.video.onloadedmetadata = () => {
        resolve(video);
      };
    });

    camera.video.play();

    const videoWidth = camera.video.videoWidth;
    const videoHeight = camera.video.videoHeight;
    // Must set below two lines, otherwise video element doesn't show.
    camera.video.width = videoWidth;
    camera.video.height = videoHeight;

    camera.canvas.width = videoWidth;
    camera.canvas.height = videoHeight;
    camera.canvasGl.width = videoWidth;
    camera.canvasGl.height = videoHeight;
    const canvasContainer = document.querySelector(".canvas-wrapper");
    const canvasContainerGl = document.querySelector(".canvas-wrapper-gl");
    canvasContainer.style = `width: ${videoWidth}px; height: ${videoHeight}px`;
    canvasContainerGl.style = `width: ${videoWidth}px; height: ${videoHeight}px`;

    camera.gl.viewport(0, 0, camera.canvasGl.width, camera.canvasGl.height);

    // Because the image from camera is mirrored, need to flip horizontally.
    //camera.ctx.translate(camera.video.videoWidth, 0);
    //camera.ctx.scale(-1, 1);

    camera.faceBuffer = camera.gl.createBuffer();
    camera.gl.bindBuffer(camera.gl.ARRAY_BUFFER, camera.faceBuffer);
    camera.gl.bufferData(
      camera.gl.ARRAY_BUFFER,
      3 * 4 * 478,
      camera.gl.STREAM_DRAW
    );

    camera.faceNormalsBuffer = camera.gl.createBuffer();
    camera.gl.bindBuffer(camera.gl.ARRAY_BUFFER, camera.faceNormalsBuffer);
    camera.gl.bufferData(
      camera.gl.ARRAY_BUFFER,
      3 * 4 * 478,
      camera.gl.STREAM_DRAW
    );

    //camera.testBuffer = camera.gl.createBuffer();
    //camera.gl.bindBuffer(camera.gl.ARRAY_BUFFER, camera.testBuffer);
    // camera.gl.bufferData(
    //   camera.gl.ARRAY_BUFFER,
    //   3 * 4 * 3,
    //   camera.gl.STATIC_DRAW
    // );
    // camera.gl.bufferData(
    //   camera.gl.ARRAY_BUFFER,
    //   new Float32Array([0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0]),
    //   camera.gl.STATIC_DRAW
    // );

    camera.faceIndexBuffer = camera.gl.createBuffer();
    camera.gl.bindBuffer(
      camera.gl.ELEMENT_ARRAY_BUFFER,
      camera.faceIndexBuffer
    );
    camera.gl.bufferData(
      camera.gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(TRIANGULATION),
      camera.gl.STATIC_DRAW
    );

    camera.program = camera.compileShaders();

    camera.positionLocation = camera.gl.getAttribLocation(
      camera.program,
      "position"
    );

    camera.normalLocation = camera.gl.getAttribLocation(
      camera.program,
      "normal"
    );

    camera.videoTextureLocation = camera.gl.getUniformLocation(camera.program, "videoTexture");
    camera.videoTexture = camera.createTexture();

    camera.lightPosLocation = camera.gl.getUniformLocation(camera.program, "lightPos");

    camera.faceNormals = new Float32Array(3 * 478);

    return camera;
  }

  drawCtx() {
    this.ctx.drawImage(
      this.video,
      0,
      0,
      this.video.videoWidth,
      this.video.videoHeight
    );
  }

  drawResults(faces, triangulateMesh, boundingBox) {
    //drawResults(this.ctx, faces, triangulateMesh, boundingBox);
    // Use the program

    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);

    this.gl.clearColor(0, 0, 0, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

    this.gl.useProgram(this.program);

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.faceIndexBuffer);

    // Bind existing attribute data
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.faceBuffer);

    if (faces.length > 0) {
      const keypoints = faces[0].keypoints;
      let keypointsBuffer = keypoints.map((k) => [k.x, k.y, k.z]).flat();
      let arrBufKey = new Float32Array(keypointsBuffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, arrBufKey);
    
      this.updateNormals(arrBufKey, TRIANGULATION, this.faceNormals);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.faceNormalsBuffer);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, this.faceNormals);
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.faceBuffer);
    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(
      this.positionLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );




    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.faceNormalsBuffer);
    this.gl.enableVertexAttribArray(this.normalLocation);
    this.gl.vertexAttribPointer(
      this.normalLocation,
      3,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    const level = 0;
    const internalFormat = this.gl.RGBA;
    const srcFormat = this.gl.RGBA;
    const srcType = this.gl.UNSIGNED_BYTE;
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      level,
      internalFormat,
      srcFormat,
      srcType,
      this.video
    );

    this.gl.uniform1i(this.videoTextureLocation, 0);

    let time = performance.now() / 1000.0;
    let x = 4.0 * Math.sin(3.0 * time);
    let y = 4.0 * Math.cos(3.0 * time);
    let z = 1.5;
    this.gl.uniform3f(this.lightPosLocation, x, y, z);

    this.gl.drawElements(
      this.gl.TRIANGLES,
      TRIANGULATION.length,
      this.gl.UNSIGNED_SHORT,
      0
    );

    //this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
  }
}
