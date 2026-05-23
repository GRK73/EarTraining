export type Waveform = {
  peaks: number[];
  duration: number;
};

const cache = new Map<string, Promise<Waveform>>();

export function loadWaveform(src: string, points = 420): Promise<Waveform> {
  const key = `${src}:${points}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const promise = fetch(src)
    .then((response) => response.arrayBuffer())
    .then(async (arrayBuffer) => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextClass();
      const buffer = await context.decodeAudioData(arrayBuffer.slice(0));
      const channel = buffer.getChannelData(0);
      const blockSize = Math.max(1, Math.floor(channel.length / points));
      const peaks: number[] = [];

      for (let point = 0; point < points; point += 1) {
        let sum = 0;
        const start = point * blockSize;
        const end = Math.min(start + blockSize, channel.length);

        for (let i = start; i < end; i += 1) {
          sum += channel[i] * channel[i];
        }

        peaks.push(Math.sqrt(sum / Math.max(1, end - start)));
      }

      const max = Math.max(...peaks, 0.001);
      await context.close();

      return {
        peaks: peaks.map((peak) => peak / max),
        duration: buffer.duration,
      };
    });

  cache.set(key, promise);
  return promise;
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
