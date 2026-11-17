import React, { useEffect, useRef, useState } from 'react';

interface IntroScreenProps {
  onComplete: () => void;
}

interface Particle {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  baseY: number;
  phase: number;
  size: number;
  color: string;
}

export const IntroScreen: React.FC<IntroScreenProps> = ({ onComplete }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    const startTime = performance.now();
    const TOTAL_DURATION = 10000; // 10 seconds

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 1. Sample target pixel coordinates for "BEAT N BOX"
    const getTextTargets = (): { x: number; y: number }[] => {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const offCtx = offscreen.getContext('2d');
      if (!offCtx) return [];

      const fontSize = Math.min(canvas.width * 0.11, 110);
      offCtx.font = `900 ${fontSize}px system-ui, -apple-system, sans-serif`;
      offCtx.fillStyle = '#ffffff';
      offCtx.textAlign = 'center';
      offCtx.textBaseline = 'middle';
      offCtx.fillText('BEAT N BOX', canvas.width / 2, canvas.height / 2 + 50);

      const imageData = offCtx.getImageData(0, 0, canvas.width, canvas.height).data;
      const targets: { x: number; y: number }[] = [];
      const step = 5; // Particle density (lower number = more particles)

      for (let y = 0; y < canvas.height; y += step) {
        for (let x = 0; x < canvas.width; x += step) {
          const alpha = imageData[(y * canvas.width + x) * 4 + 3];
          if (alpha > 128) {
            targets.push({ x, y });
          }
        }
      }
      return targets;
    };

    const targets = getTextTargets();
    const palette = ['#ef4444', '#f97316', '#f43f5e', '#ffffff'];

    // 2. Initialize particles distributed across horizontal wave bands
    const particles: Particle[] = targets.map((target, i) => ({
      x: (i / targets.length) * canvas.width,
      y: canvas.height / 2,
      targetX: target.x,
      targetY: target.y,
      baseY: canvas.height / 2,
      phase: (i / targets.length) * Math.PI * 8,
      size: Math.random() * 2 + 1.2,
      color: palette[i % palette.length],
    }));

    // Helper to draw the central glowing microphone
    const drawMicrophone = (alpha: number, pulse: number) => {
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 - 65;

      // Audio aura gradient
      const gradient = ctx.createRadialGradient(cx, cy, 5, cx, cy, 45 + pulse * 15);
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.45)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, 45 + pulse * 15, 0, Math.PI * 2);
      ctx.fill();

      // Mic capsule & stand lines
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      // Capsule body
      ctx.beginPath();
      ctx.roundRect(cx - 10, cy - 22, 20, 32, 10);
      ctx.stroke();

      // Grille slots
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 12);
      ctx.lineTo(cx + 5, cy - 12);
      ctx.moveTo(cx - 5, cy - 6);
      ctx.lineTo(cx + 5, cy - 6);
      ctx.stroke();

      // Cradle arc
      ctx.beginPath();
      ctx.arc(cx, cy - 2, 17, 0, Math.PI, false);
      ctx.stroke();

      // Stem & base
      ctx.beginPath();
      ctx.moveTo(cx, cy + 15);
      ctx.lineTo(cx, cy + 26);
      ctx.moveTo(cx - 11, cy + 26);
      ctx.lineTo(cx + 11, cy + 26);
      ctx.stroke();

      ctx.restore();
    };

    // 3. Main 10-second animation loop
    const render = (now: number) => {
      const elapsed = now - startTime;

      // Clear screen with pure black
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Phase 1: 0.0s - 1.5s -> Pitch-black pause
      if (elapsed < 1500) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      // Phase 2: 1.5s - 5.0s -> Microphone & wave oscillation
      if (elapsed >= 1500 && elapsed < 5000) {
        const waveProgress = (elapsed - 1500) / 3500;
        const micAlpha = Math.min(1, waveProgress * 2.5);
        const pulse = Math.sin(elapsed * 0.01) * 0.5 + 0.5;

        drawMicrophone(micAlpha, pulse);

        particles.forEach((p) => {
          const distFromCenter = Math.abs(p.x - canvas.width / 2) / (canvas.width / 2);
          const envelope = Math.max(0, 1 - distFromCenter * 1.15);
          const amplitude = (35 + pulse * 25) * envelope * micAlpha;

          p.y = p.baseY + Math.sin(p.phase + elapsed * 0.008) * amplitude;

          ctx.fillStyle = p.color;
          ctx.globalAlpha = micAlpha * (0.4 + envelope * 0.6);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Phase 3: 5.0s - 8.5s -> Waves morph and lock into typography
      if (elapsed >= 5000 && elapsed < 8500) {
        const morphProgress = (elapsed - 5000) / 3500;
        const micAlpha = Math.max(0, 1 - morphProgress * 2.5);
        drawMicrophone(micAlpha, 0);

        particles.forEach((p) => {
          p.x += (p.targetX - p.x) * 0.085;
          p.y += (p.targetY - p.y) * 0.085;

          ctx.fillStyle = p.color;
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Phase 4: 8.5s - 10.0s -> Hold logo and fade out
      if (elapsed >= 8500) {
        const fadeProgress = Math.min(1, (elapsed - 8500) / 1500);
        setOpacity(1 - fadeProgress);

        particles.forEach((p) => {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      if (elapsed < TOTAL_DURATION) {
        animationFrameId = requestAnimationFrame(render);
      } else {
        onComplete();
      }
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
    };
  }, [onComplete]);

  return (
    <div
      style={{ opacity }}
      className="fixed inset-0 z-50 bg-black flex items-center justify-center transition-opacity duration-300 pointer-events-auto"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <button
        onClick={onComplete}
        className="absolute bottom-6 right-6 text-xs tracking-widest uppercase text-zinc-500 hover:text-white transition-colors"
      >
        Skip Intro
      </button>
    </div>
  );
};