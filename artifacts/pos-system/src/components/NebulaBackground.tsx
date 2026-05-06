import { useEffect, useRef } from "react";

export default function NebulaBackground() {
  const canvasNebulaRef = useRef<HTMLCanvasElement>(null);
  const canvasStarsRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasNebulaRef.current;
    if (!canvas) return;
    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#04070a';
      ctx.fillRect(0, 0, w, h);
      const g1 = ctx.createRadialGradient(w*0.15, h*0.22, 0, w*0.15, h*0.22, w*0.48);
      g1.addColorStop(0, 'rgba(0,78,68,0.055)');
      g1.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const g2 = ctx.createRadialGradient(w*0.84, h*0.76, 0, w*0.84, h*0.76, w*0.42);
      g2.addColorStop(0, 'rgba(55,28,8,0.042)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);
      const g3 = ctx.createRadialGradient(w*0.5, h*0.44, 0, w*0.5, h*0.44, w*0.36);
      g3.addColorStop(0, 'rgba(8,18,58,0.044)');
      g3.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g3;
      ctx.fillRect(0, 0, w, h);
      const vg = ctx.createRadialGradient(w/2, h/2, h*0.28, w/2, h/2, w*0.72);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.48)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  useEffect(() => {
    const canvas = canvasStarsRef.current;
    if (!canvas) return;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const getCount = () => w >= 1400 ? 200 : w >= 1024 ? 150 : w >= 768 ? 100 : 60;
    type Star = { x: number; y: number; bx: number; by: number; size: number; tier: number; phase: number; speed: number; vx: number; vy: number; };
    let stars: Star[] = [];
    const init = () => {
      stars = Array.from({ length: getCount() }, () => {
        const tier = Math.random() < 0.60 ? 0 : Math.random() < 0.72 ? 1 : 2;
        const size = tier === 0 ? 0.35 + Math.random()*0.55 : tier === 1 ? 0.9 + Math.random()*1.0 : 2.0 + Math.random()*1.8;
        const x = Math.random() * w;
        const y = Math.random() * h;
        return { x, y, bx: x, by: y, size, tier, phase: Math.random()*Math.PI*2, speed: 0.3+Math.random()*0.8, vx: 0, vy: 0 };
      });
    };
    init();
    const mouse = { x: -999, y: -999 };
    const onMove = (e: MouseEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
    const onLeave = () => { mouse.x = -999; mouse.y = -999; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    const onResize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; init(); };
    window.addEventListener('resize', onResize);
    let rafId = 0;
    let last = 0;
    const drawFrame = (t: number) => {
      const dt = Math.min((t - last) / 16, 3);
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (const s of stars) {
        const twinkle = 0.42 + 0.58 * Math.sin(t * 0.001 * s.speed + s.phase);
        const dx = mouse.x - s.x;
        const dy = mouse.y - s.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        let glow = 0;
        if (dist < 100) {
          const pull = (1 - dist/100) * 0.044 * dt;
          s.vx += dx * pull;
          s.vy += dy * pull;
          if (dist < 60) glow = (1 - dist/60) * 0.85;
        }
        s.vx += (s.bx - s.x) * 0.075 * dt;
        s.vy += (s.by - s.y) * 0.075 * dt;
        s.vx *= 0.87;
        s.vy *= 0.87;
        s.x = Math.max(18, Math.min(w-18, s.x + s.vx));
        s.y = Math.max(18, Math.min(h-18, s.y + s.vy));
        const alpha = Math.min(1, twinkle + glow * 0.5);
        if (s.tier === 2) {
          const sk = s.size * 5.5;
          ctx.save();
          ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.22})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(s.x-sk, s.y); ctx.lineTo(s.x+sk, s.y);
          ctx.moveTo(s.x, s.y-sk); ctx.lineTo(s.x, s.y+sk);
          const sd = sk * 0.55;
          ctx.moveTo(s.x-sd, s.y-sd); ctx.lineTo(s.x+sd, s.y+sd);
          ctx.moveTo(s.x+sd, s.y-sd); ctx.lineTo(s.x-sd, s.y+sd);
          ctx.stroke();
          ctx.restore();
        }
        if (glow > 0) {
          const gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.size*9);
          gr.addColorStop(0, `rgba(200,228,255,${glow*0.28})`);
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.size*9, 0, Math.PI*2);
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI*2);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fill();
      }
      rafId = requestAnimationFrame(drawFrame);
    };
    rafId = requestAnimationFrame(drawFrame);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <>
      <canvas ref={canvasNebulaRef} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
      <canvas ref={canvasStarsRef} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 1 }} />
    </>
  );
}
