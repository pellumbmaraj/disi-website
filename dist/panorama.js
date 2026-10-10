// Equirectangular image -> perspective view. No third-party runtime or continuous render loop.
export async function createPanorama(canvas, onExit) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    preserveDrawingBuffer: false,
  });
  if (!gl) throw new Error("WebGL is not supported.");
  const resources = [];
  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error("Unable to create panorama shader.");
    }
    resources.push(shader);
    return shader;
  }
  const program = gl.createProgram();
  try {
    gl.attachShader(
      program,
      compile(
        gl.VERTEX_SHADER,
        `attribute vec2 position; varying vec2 point; void main(){ point=position; gl_Position=vec4(position,0.0,1.0); }`,
      ),
    );
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        `precision mediump float; varying vec2 point; uniform sampler2D photo; uniform float aspect; uniform float field; uniform float yaw; uniform float pitch;
    void main(){
      vec3 d=normalize(vec3(point.x*aspect*field,point.y*field,1.0));
      float cp=cos(pitch),sp=sin(pitch),cy=cos(yaw),sy=sin(yaw);
      d=vec3(d.x,d.y*cp+d.z*sp,-d.y*sp+d.z*cp);
      d=vec3(d.x*cy+d.z*sy,d.y,-d.x*sy+d.z*cy);
      vec2 uv=vec2(fract(atan(d.x,d.z)/6.2831853+0.5),0.5-asin(clamp(d.y,-1.0,1.0))/3.14159265);
      gl_FragColor=texture2D(photo,uv);
    }`,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Unable to initialize panorama.");
    const image = new Image();
    image.src = new URL("./assets/panorama-4096.webp", import.meta.url).href;
    await image.decode();
    if (gl.isContextLost()) throw new Error("Graphics context unavailable.");
    const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let source = image;
    if (image.width > max) {
      const scaled = document.createElement("canvas");
      scaled.width = max;
      scaled.height = Math.round((image.height * max) / image.width);
      scaled
        .getContext("2d")
        .drawImage(image, 0, 0, scaled.width, scaled.height);
      source = scaled;
    }
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
    const uniforms = Object.fromEntries(
      ["aspect", "field", "yaw", "pitch"].map((key) => [
        key,
        gl.getUniformLocation(program, key),
      ]),
    );
    let yaw = 0.55,
      pitch = 0,
      fov = 85,
      frame = 0;
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const draw = () => {
      frame = 0;
      if (disposed || gl.isContextLost() || !canvas.clientWidth || !canvas.clientHeight)
        return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniforms.aspect, canvas.width / canvas.height);
      gl.uniform1f(uniforms.field, Math.tan((fov * Math.PI) / 360));
      gl.uniform1f(uniforms.yaw, yaw);
      gl.uniform1f(uniforms.pitch, pitch);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      const ratio = Math.min(
        window.devicePixelRatio || 1,
        1.5,
        2400 / canvas.clientWidth,
        1600 / canvas.clientHeight,
      );
      const width = Math.round(canvas.clientWidth * ratio);
      const height = Math.round(canvas.clientHeight * ratio);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      schedule();
    };
    let disposed = false;
    const controller = new AbortController();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const listen = (name, callback) => canvas.addEventListener(name, callback, { signal: controller.signal });
    const dispose = () => {
      disposed = true;
      controller.abort();
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    };
    const panBy = (dx, dy, pointerType) => {
      yaw -= dx * 0.004;
      // Touch keeps vertical movement available for page scrolling.
      if (pointerType !== "touch")
        pitch = clamp(pitch + dy * 0.004, -1.2, 1.2);
      schedule();
    };
    listen("keydown", (event) => {
      const actions = {
        ArrowLeft: () => {
          yaw -= 0.12;
        },
        ArrowRight: () => {
          yaw += 0.12;
        },
        ArrowUp: () => {
          pitch = clamp(pitch + 0.1, -1.2, 1.2);
        },
        ArrowDown: () => {
          pitch = clamp(pitch - 0.1, -1.2, 1.2);
        },
        "+": () => {
          fov = clamp(fov - 5, 45, 105);
        },
        "=": () => {
          fov = clamp(fov - 5, 45, 105);
        },
        "-": () => {
          fov = clamp(fov + 5, 45, 105);
        },
        Home: () => {
          yaw = 0.55;
          pitch = 0;
          fov = 85;
        },
        Escape: onExit,
      };
      if (actions[event.key]) {
        event.preventDefault();
        actions[event.key]();
        schedule();
      }
    });
    listen("webglcontextlost", (event) => {
      event.preventDefault();
      dispose();
      onExit();
    });
    resources.forEach((shader) => gl.deleteShader(shader));
    return { resize, panBy, isContextLost: () => disposed || gl.isContextLost() };
  } catch (error) {
    resources.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    throw error;
  }
}
