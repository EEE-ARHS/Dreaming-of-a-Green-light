import * as THREE from "three";

function makeTexture(paint: (ctx: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable for Nick's House textures");
  paint(ctx, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

export function wallpaperTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#7b7157";
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 4) {
      ctx.fillStyle = `rgba(52,48,36,${0.03 + (y % 8 === 0 ? 0.03 : 0)})`;
      ctx.fillRect(0, y, size, 1);
    }
    const step = 64;
    for (let gy = 0; gy < size; gy += step) {
      for (let gx = 0; gx < size; gx += step) {
        const cx = gx + step / 2;
        const cy = gy + step / 2;
        ctx.fillStyle = "rgba(104,94,68,0.55)";
        ctx.beginPath();
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + 14, cy);
        ctx.lineTo(cx, cy + 20);
        ctx.lineTo(cx - 14, cy);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(186,168,126,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = "rgba(196,178,134,0.5)";
        for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          ctx.beginPath();
          ctx.ellipse(cx + Math.cos(angle) * 22, cy + Math.sin(angle) * 22, 4, 2.2, angle, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(64,56,40,0.5)";
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
    }
  });
  texture.repeat.set(2, 1);
  return texture;
}

export function floorTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#5b4028";
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 42) {
      ctx.fillStyle = "rgba(26,17,10,0.55)";
      ctx.fillRect(x, 0, 2, size);
      for (let i = 0; i < 22; i++) {
        ctx.fillStyle = `rgba(${60 + Math.random() * 40},${40 + Math.random() * 26},${22 + Math.random() * 16},0.35)`;
        const y = Math.random() * size;
        ctx.fillRect(x + 3, y, 34 + Math.random() * 5, 1);
      }
    }
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = `rgba(28,18,10,${0.08 + Math.random() * 0.18})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1);
    }
  });
  texture.repeat.set(2.5, 2.5);
  return texture;
}

export function rugTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#5f2c2f";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#a8885a";
    ctx.lineWidth = 6;
    ctx.strokeRect(12, 12, size - 24, size - 24);
    ctx.strokeStyle = "rgba(168,136,90,0.55)";
    ctx.lineWidth = 2;
    ctx.strokeRect(26, 26, size - 52, size - 52);
    ctx.fillStyle = "rgba(196,168,116,0.6)";
    for (let i = 0; i < 4; i++) {
      const cx = size / 2 + (i % 2 === 0 ? -44 : 44);
      const cy = size / 2 + (i < 2 ? -40 : 40);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 22);
      ctx.lineTo(cx + 18, cy);
      ctx.lineTo(cx, cy + 22);
      ctx.lineTo(cx - 18, cy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "rgba(90,40,42,0.85)";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 16, 0, Math.PI * 2);
    ctx.fill();
  });
  texture.repeat.set(1, 1);
  return texture;
}

export function crateTexture(): THREE.CanvasTexture {
  const texture = makeTexture((ctx, size) => {
    ctx.fillStyle = "#8a6437";
    ctx.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 52) {
      ctx.fillStyle = "rgba(46,28,13,0.5)";
      ctx.fillRect(x, 0, 3, size);
      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = `rgba(${120 + Math.random() * 40},${88 + Math.random() * 30},${52 + Math.random() * 20},0.35)`;
        ctx.fillRect(x + 5, Math.random() * size, 44, 1.5);
      }
    }
    ctx.fillStyle = "rgba(40,26,14,0.8)";
    ctx.fillRect(0, 0, size, 6);
    ctx.fillRect(0, size - 6, size, 6);
    ctx.fillRect(0, 0, 6, size);
    ctx.fillRect(size - 6, 0, 6, size);
    ctx.fillStyle = "rgba(52,36,20,0.85)";
    for (const [x, y] of [[16, 16], [size - 22, 16], [16, size - 22], [size - 22, size - 22]] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  texture.repeat.set(1, 1);
  return texture;
}
