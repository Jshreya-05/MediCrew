import { useRef, useEffect } from "react";

// Infinite ECG sample generator — yields one sample at a time, never loops
function createECGStream(beatLength = 210) {
  let phase = 0;
  const cycleLength = beatLength + Math.floor(beatLength * 0.35);

  function nextSample() {
    const t = phase / beatLength;
    let v = (Math.random() - 0.5) * 0.012;

    if (phase < beatLength) {
      // P wave
      if (t > 0.05 && t < 0.20) {
        const pt = (t - 0.125) / 0.07;
        v += 0.12 * Math.exp(-pt * pt * 2);
      }
      // Q dip
      if (t > 0.28 && t < 0.31) {
        const qt = (t - 0.295) / 0.012;
        v -= 0.08 * Math.exp(-qt * qt * 3);
      }
      // R spike
      if (t > 0.30 && t < 0.40) {
        const rt = (t - 0.345) / 0.022;
        v += 1.0 * Math.exp(-rt * rt * 4);
      }
      // S wave
      if (t > 0.37 && t < 0.45) {
        const st = (t - 0.40) / 0.022;
        v -= 0.22 * Math.exp(-st * st * 3);
      }
      // T wave
      if (t > 0.46 && t < 0.72) {
        const tt = (t - 0.59) / 0.09;
        v += 0.18 * Math.exp(-tt * tt * 2);
      }
    }
    // else: isoelectric gap (just baseline noise)

    phase = (phase + 1) % cycleLength;
    return v;
  }

  return { nextSample };
}

export default function ECGChart({ color = "#00ff66", speed = 2.2 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const HEAD_ERASE = 44;

    let animId;
    let lastTime = 0;
    let accumPx = 0;
    let W = canvas.offsetWidth;
    let H = canvas.offsetHeight;

    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const stream = createECGStream(210);

    // ring[i] = y value at screen x = i
    // We write new samples into ring at position (absX % W)
    // and always render the full ring as a scrolling trace
    const ring = new Float32Array(W);
    let absX = 0;

    function sampleToY(v) {
      const pad = 24;
      return H / 2 - v * (H - pad * 2) * 0.45;
    }

    // Pre-fill
    for (let i = 0; i < W; i++) {
      ring[i] = sampleToY(stream.nextSample());
    }
    absX = W;

    function advance(px) {
      for (let i = 0; i < px; i++) {
        ring[absX % W] = sampleToY(stream.nextSample());
        absX++;
      }
    }

    function drawGrid() {
      for (let x = 0; x < W; x += 20) {
        const big = x % 100 === 0;
        ctx.strokeStyle = big ? "rgba(0,200,60,0.13)" : "rgba(0,200,60,0.05)";
        ctx.lineWidth = big ? 0.8 : 0.4;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H; y += 20) {
        const big = y % 100 === 0;
        ctx.strokeStyle = big ? "rgba(0,200,60,0.13)" : "rgba(0,200,60,0.05)";
        ctx.lineWidth = big ? 0.8 : 0.4;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
    }

    function drawTrace(startX, endX) {
      // Draw from startX to endX (screen coords), reading from ring
      // This handles the two segments around the head cleanly
      const n = endX - startX;
      if (n < 2) return;

      const layers = [
        { lw: 7,   alpha: 0.05, blur: 0  },
        { lw: 3,   alpha: 0.15, blur: 0  },
        { lw: 1.5, alpha: 1.0,  blur: 10 },
      ];

      for (const { lw, alpha, blur } of layers) {
        ctx.beginPath();
        ctx.moveTo(startX, ring[startX % W]);

        for (let i = 1; i < n - 2; i++) {
          const x0 = startX + i;
          const x1 = startX + i + 1;
          const xmid = (x0 + x1) / 2;
          const ymid = (ring[x0 % W] + ring[x1 % W]) / 2;
          ctx.quadraticCurveTo(x0, ring[x0 % W], xmid, ymid);
        }
        ctx.quadraticCurveTo(
          startX + n - 2, ring[(startX + n - 2) % W],
          startX + n - 1, ring[(startX + n - 1) % W]
        );

        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = lw;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
        ctx.stroke();
      }

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    function render() {
      ctx.fillStyle = "#060a08";
      ctx.fillRect(0, 0, W, H);
      drawGrid();

      // headSX = screen position currently being written
      const headSX = absX % W;

      // Erase band just ahead of head
      ctx.fillStyle = "#060a08";
      if (headSX + HEAD_ERASE <= W) {
        ctx.fillRect(headSX, 0, HEAD_ERASE, H);
      } else {
        ctx.fillRect(headSX, 0, W - headSX, H);
        ctx.fillRect(0, 0, HEAD_ERASE - (W - headSX), H);
      }

      // Draw trace in two segments to avoid crossing the erase band
      // Segment 1: from (headSX + HEAD_ERASE) to W  (the "old" left side)
      // Segment 2: from 0 to headSX                 (the "new" right side)
      // We do this by passing virtual X coords that map through ring[] via % W

      const traceStart = absX - W + HEAD_ERASE; // oldest visible sample (absolute)
      const traceEnd   = absX;                   // newest sample (absolute)

      // Draw as one continuous path using absolute X, canvas X = absX % W
      // But we need to split at the wrap point to avoid diagonal lines
      const wrapAt = traceStart + (W - (traceStart % W)); // first wrap boundary

      // Before wrap
      if (wrapAt < traceEnd) {
        // segment before wrap: traceStart..wrapAt
        const seg1Len = wrapAt - traceStart;
        if (seg1Len > 1) {
          // map to screen: screen x = absX % W, but since these are pre-wrap, screen x increments normally
          // We'll remap to [0..W-1] using offset
          const offset = traceStart % W;
          // draw from screen offset to offset+seg1Len (which equals W)
          drawTrace(offset, offset + seg1Len);
        }
        // segment after wrap: wrapAt..traceEnd
        const seg2Len = traceEnd - wrapAt;
        if (seg2Len > 1) {
          drawTrace(W, W + seg2Len); // drawTrace handles % W internally
        }
      } else {
        const offset = traceStart % W;
        drawTrace(offset, offset + (traceEnd - traceStart));
      }
    }

    function loop(ts) {
      const dt = Math.min(ts - lastTime, 50);
      lastTime = ts;
      accumPx += speed * (dt / 16.667);
      const steps = Math.floor(accumPx);
      accumPx -= steps;
      if (steps > 0) advance(steps);
      render();
      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame((ts) => { lastTime = ts; loop(ts); });

    const ro = new ResizeObserver(() => {
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
    });
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, [color, speed]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: "100%",
        height: "220px",
        display: "block",
        borderRadius: "6px",
        background: "#060a08",
      }}
    />
  );
}
