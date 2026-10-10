// Bound GPU work, including on high-DPI phones and in fullscreen.
export function panoramaSize(width, height, dpr = 1, quality = 1, mobile = false) {
  if (!width || !height) return [0, 0];
  const ratio = Math.min(dpr, mobile ? 1 : 1.25, Math.sqrt((mobile ? 450000 : 1000000) / (width * height))) * quality;
  return [Math.max(1, Math.floor(width * ratio)), Math.max(1, Math.floor(height * ratio))];
}

export function panSensitivity(width, pointerType) {
  // A full-width finger swipe turns half a revolution on any phone size.
  return pointerType === "touch" ? Math.PI / Math.max(width, 1) : 0.004;
}

// A textured sphere moves projection work off the fragment shader. Each screen
// pixel only samples the image; no per-pixel atan/asin is needed during a swipe.
export function panoramaMesh(columns = 128, rows = 64) {
  const vertices = new Float32Array((columns + 1) * (rows + 1) * 5);
  const indices = new Uint16Array(columns * rows * 6);
  let vertex = 0, index = 0;
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, latitude = (0.5 - v) * Math.PI;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, longitude = (u - 0.5) * Math.PI * 2;
      vertices.set([Math.sin(longitude) * Math.cos(latitude), Math.sin(latitude),
        Math.cos(longitude) * Math.cos(latitude), u, v], vertex);
      vertex += 5;
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column, b = a + columns + 1;
        indices.set([a, b, a + 1, a + 1, b, b + 1], index);
        index += 6;
      }
    }
  }
  return { vertices, indices };
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
      if (elapsed <= 0 || elapsed >= 250) return false;
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
  const mobile = matchMedia("(pointer: coarse)").matches || matchMedia("(max-width: 699px)").matches;
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
        `attribute vec3 position; attribute vec2 texcoord; varying mediump vec2 uv; uniform float aspect; uniform float field; uniform vec4 rotation;
        void main(){
          vec3 d=vec3(position.x*rotation.x-position.z*rotation.y,position.y,position.x*rotation.y+position.z*rotation.x);
          d=vec3(d.x,d.y*rotation.z-d.z*rotation.w,d.y*rotation.w+d.z*rotation.z);
          uv=texcoord;
          gl_Position=vec4(d.x/(aspect*field),d.y/field,1.01*d.z-0.02,d.z);
        }`,
      ),
    );
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        `precision mediump float; varying mediump vec2 uv; uniform sampler2D photo;
        void main(){ gl_FragColor=texture2D(photo,uv); }`,
      ),
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Unable to initialize panorama.");
    const image = new Image();
    image.src = new URL("./assets/panorama-4096.webp", import.meta.url).href;
    await image.decode();
    if (gl.isContextLost()) throw new Error("Graphics context unavailable.");
    const max = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), mobile ? 2048 : 4096);
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
    const mesh = panoramaMesh();
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      mesh.vertices,
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
    const texcoord = gl.getAttribLocation(program, "texcoord");
    gl.enableVertexAttribArray(texcoord);
    gl.vertexAttribPointer(texcoord, 2, gl.FLOAT, false, 20, 12);
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
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
      lastFrame = 0,
      dirty = true;
    let targetYaw = yaw, targetPitch = pitch, dragging = false, directTouch = false;
    const budget = createRenderBudget();
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const draw = (timestamp) => {
      frame = 0;
      if (disposed || gl.isContextLost() || !canvas.clientWidth || !canvas.clientHeight)
        return;
      const elapsed = lastFrame ? timestamp - lastFrame : 1000 / 60;
      if (lastFrame && budget.observe(elapsed)) sizeCanvas();
      const previousYaw = yaw, previousPitch = pitch;
      yaw = followAngle(yaw, targetYaw, elapsed, reducedMotion.matches || directTouch);
      pitch = followAngle(pitch, targetPitch, elapsed, reducedMotion.matches || directTouch);
      if (dirty || yaw !== previousYaw || pitch !== previousPitch) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform1f(uniforms.aspect, canvas.clientWidth / canvas.clientHeight);
        gl.uniform1f(uniforms.field, Math.tan((fov * Math.PI) / 360));
        gl.uniform4f(uniforms.rotation, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch));
        gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);
        dirty = false;
      }
      // Measure display cadence while dragging, not the pointer event rate.
      if (dragging || yaw !== targetYaw || pitch !== targetPitch) {
        schedule();
      }
      lastFrame = dragging || yaw !== targetYaw || pitch !== targetPitch ? timestamp : 0;
    };
    const schedule = () => {
      if (!disposed && !frame) frame = requestAnimationFrame(draw);
    };
    const sizeCanvas = () => {
      const [width, height] = panoramaSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1, budget.quality, mobile);
      if (!width || !height) return;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        dirty = true;
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
      gl.deleteBuffer(indexBuffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    };
    const panBy = (dx, dy, pointerType) => {
      directTouch = pointerType === "touch";
      const sensitivity = panSensitivity(canvas.clientWidth, pointerType);
      targetYaw -= dx * sensitivity;
      targetPitch = clamp(targetPitch + dy * sensitivity, -1.2, 1.2);
      schedule();
    };
    const beginPan = (pointerType) => {
      dragging = true;
      directTouch = pointerType === "touch";
      lastFrame = 0;
      schedule();
    };
    const endPan = () => { dragging = false; lastFrame = 0; };
    listen("keydown", (event) => {
      directTouch = false;
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
        dirty = true;
        schedule();
      }
    });
    listen("webglcontextlost", (event) => {
      event.preventDefault();
      dispose();
      onExit();
    });
    resources.forEach((shader) => gl.deleteShader(shader));
    return { resize, panBy, beginPan, endPan, isContextLost: () => disposed || gl.isContextLost() };
  } catch (error) {
    resources.forEach((shader) => gl.deleteShader(shader));
    gl.deleteProgram(program);
    throw error;
  }
}
