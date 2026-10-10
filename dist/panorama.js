// Bound GPU work, including on high-DPI phones and in fullscreen.
export function panoramaSize(width, height, dpr = 1, quality = 1) {
  if (!width || !height) return [0, 0];
  const ratio = Math.min(dpr, 1.25, Math.sqrt(1000000 / (width * height))) * quality;
  return [Math.max(1, Math.floor(width * ratio)), Math.max(1, Math.floor(height * ratio))];
}

// Time-based smoothing stays consistent on 30, 60 and 120 Hz screens.
export function followAngle(value, target, elapsed, reducedMotion = false) {
  if (reducedMotion || Math.abs(target - value) < 0.0002) return target;
  return value + (target - value) * (1 - Math.exp(-elapsed / 18));
}

export function createRenderBudget() {
  let quality = 1, samples = 0, duration = 0;
  return {
    get quality() { return quality; },
    observe(elapsed) {
      // Ignore idle time and background-tab pauses, not sustained slow frames.
      if (elapsed <= 0 || elapsed >= 100) return false;
      samples++;
      duration += elapsed;
      if (samples < 12) return false;
      const slow = duration / samples > 24;
      samples = duration = 0;
      if (!slow || quality <= 0.5) return false;
      quality = Math.max(0.5, quality * 0.8);
      return true;
    },
  };
}

// Equirectangular image -> perspective view. Animation stops as soon as the view settles.
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
        `attribute vec2 position; varying mediump vec3 direction; uniform float aspect; uniform float field; uniform vec4 rotation;
        void main(){
          vec3 d=vec3(position.x*aspect*field,position.y*field,1.0);
          d=vec3(d.x,d.y*rotation.z+d.z*rotation.w,-d.y*rotation.w+d.z*rotation.z);
          direction=vec3(d.x*rotation.x+d.z*rotation.y,d.y,-d.x*rotation.y+d.z*rotation.x);
          gl_Position=vec4(position,0.0,1.0);
        }`,
      ),
    );
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        `precision mediump float; varying mediump vec3 direction; uniform sampler2D photo;
    void main(){
      vec3 d=normalize(direction);
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
      ["aspect", "field", "rotation"].map((key) => [
        key,
        gl.getUniformLocation(program, key),
      ]),
    );
    let yaw = 0.55,
      pitch = 0,
      fov = 85,
      frame = 0,
      lastFrame = 0;
    let targetYaw = yaw, targetPitch = pitch;
    const budget = createRenderBudget();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const draw = (timestamp) => {
      frame = 0;
      if (disposed || gl.isContextLost() || !canvas.clientWidth || !canvas.clientHeight)
        return;
      const elapsed = lastFrame ? timestamp - lastFrame : 1000 / 60;
      if (lastFrame && budget.observe(elapsed)) sizeCanvas();
      yaw = followAngle(yaw, targetYaw, elapsed, reducedMotion.matches);
      pitch = followAngle(pitch, targetPitch, elapsed, reducedMotion.matches);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(uniforms.aspect, canvas.clientWidth / canvas.clientHeight);
      gl.uniform1f(uniforms.field, Math.tan((fov * Math.PI) / 360));
      gl.uniform4f(uniforms.rotation, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      if (yaw !== targetYaw || pitch !== targetPitch) {
        lastFrame = timestamp;
        schedule();
      } else lastFrame = 0;
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(draw);
    };
    const sizeCanvas = () => {
      const [width, height] = panoramaSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1, budget.quality);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    };
    const resize = () => { sizeCanvas(); schedule(); };
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
      targetYaw -= dx * 0.004;
      // Touch keeps vertical movement available for page scrolling.
      if (pointerType !== "touch")
        targetPitch = clamp(targetPitch + dy * 0.004, -1.2, 1.2);
      schedule();
    };
    listen("keydown", (event) => {
      const actions = {
        ArrowLeft: () => {
          targetYaw -= 0.12;
        },
        ArrowRight: () => {
          targetYaw += 0.12;
        },
        ArrowUp: () => {
          targetPitch = clamp(targetPitch + 0.1, -1.2, 1.2);
        },
        ArrowDown: () => {
          targetPitch = clamp(targetPitch - 0.1, -1.2, 1.2);
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
          yaw = targetYaw = 0.55;
          pitch = targetPitch = 0;
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
