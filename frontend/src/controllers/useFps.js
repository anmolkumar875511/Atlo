import { useEffect, useState } from 'react';

// Counts frames per second with requestAnimationFrame. Only runs when enabled (?debug in the URL).
export function useFps(enabled) {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let frames = 0;
    let last = performance.now();
    let id;

    const tick = (now) => {
      frames += 1;
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [enabled]);

  return fps;
}
