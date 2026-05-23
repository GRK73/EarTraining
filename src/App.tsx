import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AudioLines,
  BarChart3,
  CircleGauge,
  FastForward,
  Gauge,
  ListMusic,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
  Volume2,
  Waves,
} from "lucide-react";
import { categories, tracks, type Track, type TrackCategory } from "./data/tracks";
import { loadWaveform, type Waveform } from "./audio/waveform";

type Bus = "A" | "B";
type Difficulty = "Easy" | "Medium" | "Hard";
type EffectKey = "eq" | "compression" | "stereo" | "limiting" | "tonal";

type AudioGraph = {
  context: AudioContext;
  originalSource: MediaElementAudioSourceNode;
  processedSource: MediaElementAudioSourceNode;
  originalGain: GainNode;
  processedGain: GainNode;
  lowShelf: BiquadFilterNode;
  presence: BiquadFilterNode;
  air: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  widthDelay: DelayNode;
  limiter: DynamicsCompressorNode;
};

const modeLabels: Record<EffectKey, string> = {
  eq: "EQ",
  compression: "Compression",
  stereo: "Stereo",
  limiting: "Limiting",
  tonal: "Tonal Balance",
};

const modeIcons = {
  eq: SlidersHorizontal,
  compression: Activity,
  stereo: Waves,
  limiting: Gauge,
  tonal: BarChart3,
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
};

function App() {
  const [selectedCategory, setSelectedCategory] = useState<TrackCategory | "All">("All");
  const [originalTrackId, setOriginalTrackId] = useState(tracks[0].id);
  const [processedTrackId, setProcessedTrackId] = useState(tracks[0].id);
  const [activeBus, setActiveBus] = useState<Bus>("A");
  const [isPlaying, setIsPlaying] = useState(false);
  const [levelMatch, setLevelMatch] = useState(true);
  const [blindMode, setBlindMode] = useState(false);
  const [blindAnswer, setBlindAnswer] = useState<Bus | null>(null);
  const [blindTarget, setBlindTarget] = useState<Bus>("B");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.82);
  const [difficulty, setDifficulty] = useState<Difficulty>("Medium");
  const [effects, setEffects] = useState<Record<EffectKey, boolean>>({
    eq: true,
    compression: true,
    stereo: true,
    limiting: true,
    tonal: false,
  });
  const [originalWaveform, setOriginalWaveform] = useState<Waveform | null>(null);
  const [processedWaveform, setProcessedWaveform] = useState<Waveform | null>(null);

  const originalAudio = useRef<HTMLAudioElement | null>(null);
  const processedAudio = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);

  const originalTrack = tracks.find((track) => track.id === originalTrackId) ?? tracks[0];
  const processedTrack = tracks.find((track) => track.id === processedTrackId) ?? originalTrack;
  const filteredTracks = selectedCategory === "All" ? tracks : tracks.filter((track) => track.category === selectedCategory);

  const categoryCounts = useMemo(
    () => categories.map((category) => ({ category, count: tracks.filter((track) => track.category === category).length })),
    [],
  );

  const ensureGraph = useCallback(() => {
    if (graphRef.current || !originalAudio.current || !processedAudio.current) {
      return graphRef.current;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContextClass();
    const originalSource = context.createMediaElementSource(originalAudio.current);
    const processedSource = context.createMediaElementSource(processedAudio.current);
    const originalGain = context.createGain();
    const processedGain = context.createGain();
    const lowShelf = context.createBiquadFilter();
    const presence = context.createBiquadFilter();
    const air = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const widthDelay = context.createDelay(0.04);
    const limiter = context.createDynamicsCompressor();

    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 110;
    presence.type = "peaking";
    presence.frequency.value = 2800;
    presence.Q.value = 0.9;
    air.type = "highshelf";
    air.frequency.value = 9200;

    originalSource.connect(originalGain).connect(context.destination);
    processedSource
      .connect(lowShelf)
      .connect(presence)
      .connect(air)
      .connect(compressor)
      .connect(widthDelay)
      .connect(limiter)
      .connect(processedGain)
      .connect(context.destination);

    graphRef.current = {
      context,
      originalSource,
      processedSource,
      originalGain,
      processedGain,
      lowShelf,
      presence,
      air,
      compressor,
      widthDelay,
      limiter,
    };

    return graphRef.current;
  }, []);

  const syncBusGains = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const now = graph.context.currentTime;
    const heardBus = blindMode ? blindTarget : activeBus;
    const processedTrim = levelMatch ? 0.76 : 1;

    graph.originalGain.gain.setTargetAtTime(heardBus === "A" ? volume : 0, now, 0.012);
    graph.processedGain.gain.setTargetAtTime(heardBus === "B" ? volume * processedTrim : 0, now, 0.012);
  }, [activeBus, blindMode, blindTarget, levelMatch, volume]);

  const updateEffects = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const settings = {
      Easy: { low: 3.2, mid: 2.8, air: 2.6, threshold: -18, ratio: 3, width: 0.006, limit: -7 },
      Medium: { low: 4.8, mid: 4.2, air: 3.8, threshold: -23, ratio: 5, width: 0.01, limit: -10 },
      Hard: { low: 6.5, mid: 5.8, air: 5.4, threshold: -28, ratio: 8, width: 0.015, limit: -13 },
    }[difficulty];

    graph.lowShelf.gain.value = effects.eq || effects.tonal ? settings.low : 0;
    graph.presence.gain.value = effects.eq ? -settings.mid : 0;
    graph.air.gain.value = effects.eq || effects.tonal ? settings.air : 0;

    graph.compressor.threshold.value = effects.compression ? settings.threshold : 0;
    graph.compressor.knee.value = 18;
    graph.compressor.ratio.value = effects.compression ? settings.ratio : 1;
    graph.compressor.attack.value = effects.compression ? 0.008 : 0.003;
    graph.compressor.release.value = effects.compression ? 0.16 : 0.05;

    graph.widthDelay.delayTime.value = effects.stereo ? settings.width : 0;

    graph.limiter.threshold.value = effects.limiting ? settings.limit : 0;
    graph.limiter.knee.value = 2;
    graph.limiter.ratio.value = effects.limiting ? 16 : 1;
    graph.limiter.attack.value = 0.002;
    graph.limiter.release.value = 0.055;
  }, [difficulty, effects]);

  useEffect(() => {
    syncBusGains();
  }, [syncBusGains]);

  useEffect(() => {
    updateEffects();
  }, [updateEffects]);

  useEffect(() => {
    let cancelled = false;
    setOriginalWaveform(null);
    loadWaveform(originalTrack.src).then((waveform) => {
      if (!cancelled) {
        setOriginalWaveform(waveform);
        setDuration(waveform.duration);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [originalTrack.src]);

  useEffect(() => {
    let cancelled = false;
    setProcessedWaveform(null);
    loadWaveform(processedTrack.src).then((waveform) => {
      if (!cancelled) setProcessedWaveform(waveform);
    });
    return () => {
      cancelled = true;
    };
  }, [processedTrack.src]);

  useEffect(() => {
    if (!originalAudio.current || !processedAudio.current) return;

    originalAudio.current.src = originalTrack.src;
    processedAudio.current.src = processedTrack.src;
    originalAudio.current.currentTime = 0;
    processedAudio.current.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);
  }, [originalTrack.src, processedTrack.src]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const original = originalAudio.current;
      const processed = processedAudio.current;
      if (!original || !processed) return;

      setCurrentTime(original.currentTime);
      const delta = Math.abs(original.currentTime - processed.currentTime);
      if (isPlaying && delta > 0.08) {
        processed.currentTime = original.currentTime;
      }
    }, 120);

    return () => window.clearInterval(interval);
  }, [isPlaying]);

  const play = async () => {
    const graph = ensureGraph();
    if (!graph || !originalAudio.current || !processedAudio.current) return;
    await graph.context.resume();
    updateEffects();
    syncBusGains();

    processedAudio.current.currentTime = originalAudio.current.currentTime;
    await Promise.all([originalAudio.current.play(), processedAudio.current.play()]);
    setIsPlaying(true);
  };

  const pause = () => {
    originalAudio.current?.pause();
    processedAudio.current?.pause();
    setIsPlaying(false);
  };

  const seek = (nextTime: number) => {
    const safeTime = Math.max(0, Math.min(nextTime, duration || 0));
    if (originalAudio.current) originalAudio.current.currentTime = safeTime;
    if (processedAudio.current) processedAudio.current.currentTime = safeTime;
    setCurrentTime(safeTime);
  };

  const selectTrackForBoth = (track: Track) => {
    setOriginalTrackId(track.id);
    setProcessedTrackId(track.id);
  };

  const toggleBlindMode = () => {
    const nextTarget: Bus = Math.random() > 0.5 ? "A" : "B";
    setBlindTarget(nextTarget);
    setBlindAnswer(null);
    setBlindMode((value) => !value);
  };

  const submitBlindAnswer = (answer: Bus) => {
    setBlindAnswer(answer);
    setBlindMode(false);
    setActiveBus(answer);
  };

  const progress = duration ? currentTime / duration : 0;
  const score = blindAnswer ? (blindAnswer === blindTarget ? 84 : 68) : 82;
  const correctLabel = blindAnswer ? (blindAnswer === blindTarget ? "Correct" : "Missed") : "Ready";

  return (
    <div className="app-shell">
      <audio ref={originalAudio} preload="metadata" crossOrigin="anonymous" />
      <audio ref={processedAudio} preload="metadata" crossOrigin="anonymous" />

      <aside className="library-panel">
        <div className="brand">
          <AudioLines aria-hidden="true" />
          <span>EarTraining</span>
        </div>

        <section className="library-section">
          <h2>Library</h2>
          <button
            className={`category-row ${selectedCategory === "All" ? "is-selected" : ""}`}
            onClick={() => setSelectedCategory("All")}
          >
            <ListMusic size={17} />
            <span>All Tracks</span>
            <b>{tracks.length}</b>
          </button>
          {categoryCounts.map(({ category, count }) => (
            <button
              className={`category-row ${selectedCategory === category ? "is-selected" : ""}`}
              key={category}
              onClick={() => setSelectedCategory(category)}
            >
              <Waves size={17} />
              <span>{category}</span>
              <b>{count}</b>
            </button>
          ))}
        </section>

        <section className="track-section">
          <h2>Tracks</h2>
          <div className="track-list">
            {filteredTracks.map((track) => (
              <button
                className={`track-row ${originalTrackId === track.id && processedTrackId === track.id ? "is-active" : ""}`}
                key={track.id}
                onClick={() => selectTrackForBoth(track)}
              >
                <span className="track-mark">♪</span>
                <span>
                  <strong>{track.title}</strong>
                  <small>{track.category}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="comparison-workspace">
        <header className="topbar">
          <div>
            <h1>A/B Reference Trainer</h1>
            <p>원본과 처리본을 같은 타임라인에서 자유롭게 비교합니다.</p>
          </div>
          <div className="status-cluster">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
        </header>

        <div className="wave-stack">
          <WaveformPanel
            accent="cyan"
            bus="A"
            label="Original"
            activeBus={activeBus}
            track={originalTrack}
            waveform={originalWaveform}
            currentTime={currentTime}
            duration={duration}
            onActivate={() => setActiveBus("A")}
            onTrackChange={setOriginalTrackId}
          />
          <WaveformPanel
            accent="amber"
            bus="B"
            label="Processed"
            activeBus={activeBus}
            track={processedTrack}
            waveform={processedWaveform}
            currentTime={currentTime}
            duration={duration}
            onActivate={() => setActiveBus("B")}
            onTrackChange={setProcessedTrackId}
          />
        </div>

        <section className="transport-strip" aria-label="Transport controls">
          <button className={`ab-button ${activeBus === "A" ? "is-a" : "is-b"}`} onClick={() => setActiveBus(activeBus === "A" ? "B" : "A")}>
            <strong>A / B</strong>
            <span>{blindMode ? "Hidden" : activeBus}</span>
          </button>
          <button className={`tool-button ${levelMatch ? "is-on" : ""}`} onClick={() => setLevelMatch((value) => !value)}>
            <BarChart3 size={21} />
            <span>Level Match</span>
          </button>
          <button className={`tool-button ${blindMode ? "is-on" : ""}`} onClick={toggleBlindMode}>
            <Shuffle size={21} />
            <span>Blind Test</span>
          </button>

          <div className="transport-buttons">
            <button onClick={() => seek(0)} aria-label="Restart">
              <RotateCcw size={21} />
            </button>
            <button onClick={() => seek(currentTime - 5)} aria-label="Rewind 5 seconds">
              <Rewind size={21} />
            </button>
            <button className="play-button" onClick={isPlaying ? pause : play} aria-label={isPlaying ? "Pause" : "Play"}>
              {isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}
            </button>
            <button onClick={() => seek(currentTime + 5)} aria-label="Forward 5 seconds">
              <FastForward size={21} />
            </button>
          </div>

          <label className="volume-control">
            <Volume2 size={21} />
            <input
              aria-label="Volume"
              max="1"
              min="0"
              step="0.01"
              type="range"
              value={volume}
              onChange={(event) => setVolume(Number(event.currentTarget.value))}
            />
          </label>
        </section>

        <section className="timeline-panel">
          <div className="timeline-header">
            <span>Progress</span>
            <strong>
              {formatTime(currentTime)} / {formatTime(duration)}
            </strong>
          </div>
          <input
            aria-label="Seek position"
            className="seek-slider"
            max={duration || 0}
            min="0"
            step="0.01"
            type="range"
            value={currentTime}
            onChange={(event) => seek(Number(event.currentTarget.value))}
          />
          <div className="blind-actions">
            <button disabled={!blindMode} onClick={() => submitBlindAnswer("A")}>Guess A</button>
            <button disabled={!blindMode} onClick={() => submitBlindAnswer("B")}>Guess B</button>
            <span className={blindAnswer === blindTarget ? "is-correct" : blindAnswer ? "is-wrong" : ""}>
              {blindAnswer ? `${correctLabel}: hidden bus was ${blindTarget}` : "Blind result waits here"}
            </span>
          </div>
        </section>

        <section className="score-grid">
          <div className="score-panel">
            <h2>Score</h2>
            <div className="score-ring" style={{ "--score": `${score}%` } as React.CSSProperties}>
              <span>{score}%</span>
            </div>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{blindMode ? "Blind" : "Free A/B"}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{correctLabel}</dd>
              </div>
              <div>
                <dt>Track Pair</dt>
                <dd>{originalTrack.id === processedTrack.id ? "Same Source" : "Dual Source"}</dd>
              </div>
            </dl>
          </div>

          <div className="result-panel">
            <h2>Recent Results</h2>
            <div className="result-chart" aria-hidden="true">
              {Array.from({ length: 36 }).map((_, index) => (
                <i
                  key={index}
                  style={{
                    height: `${38 + ((index * 17) % 47)}%`,
                    opacity: index % 5 === 0 ? 1 : 0.72,
                  }}
                />
              ))}
            </div>
          </div>
        </section>
      </main>

      <aside className="training-panel">
        <h2>Training</h2>
        <div className="mode-list">
          {(Object.keys(modeLabels) as EffectKey[]).map((key) => {
            const Icon = modeIcons[key];
            return (
              <button className="mode-row" key={key} onClick={() => setEffects((value) => ({ ...value, [key]: !value[key] }))}>
                <span className="mode-icon">
                  <Icon size={20} />
                </span>
                <span>{modeLabels[key]}</span>
                <i className={effects[key] ? "is-on" : ""} />
              </button>
            );
          })}
        </div>

        <label className="select-field">
          <span>Difficulty</span>
          <select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as Difficulty)}>
            <option>Easy</option>
            <option>Medium</option>
            <option>Hard</option>
          </select>
        </label>

        <section className="preset-panel">
          <h2>Processed Chain</h2>
          <div className="chain-meter">
            <span>EQ</span>
            <span>Comp</span>
            <span>Stereo</span>
            <span>Limit</span>
          </div>
          <p>Processed 슬롯은 선택한 트랙에 현재 체인을 적용합니다. 별도 처리본 파일이 생기면 Processed 드롭다운에서 바로 비교할 수 있습니다.</p>
        </section>

        <section className="history-panel">
          <h2>Score History</h2>
          {[82, 76, 88, 72, 91, 69, 84, 79].map((item, index) => (
            <div className="history-row" key={index}>
              <span>{item}%</span>
              <small>Session {index + 1}</small>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

type WaveformPanelProps = {
  accent: "cyan" | "amber";
  activeBus: Bus;
  bus: Bus;
  currentTime: number;
  duration: number;
  label: string;
  onActivate: () => void;
  onTrackChange: (id: string) => void;
  track: Track;
  waveform: Waveform | null;
};

function WaveformPanel({
  accent,
  activeBus,
  bus,
  currentTime,
  duration,
  label,
  onActivate,
  onTrackChange,
  track,
  waveform,
}: WaveformPanelProps) {
  const progress = duration ? currentTime / duration : 0;

  return (
    <section className={`wave-panel ${accent} ${activeBus === bus ? "is-auditioning" : ""}`}>
      <div className="wave-header">
        <button onClick={onActivate}>
          <strong>{label}</strong>
          <span>Bus {bus}</span>
        </button>
        <select aria-label={`${label} track`} value={track.id} onChange={(event) => onTrackChange(event.currentTarget.value)}>
          {tracks.map((option) => (
            <option key={option.id} value={option.id}>
              {option.title}
            </option>
          ))}
        </select>
        <div className="lufs">
          <span>L</span>
          <b>{accent === "cyan" ? "-14.2" : "-13.7"} LUFS</b>
          <span>R</span>
          <b>{accent === "cyan" ? "-14.1" : "-13.8"} LUFS</b>
        </div>
      </div>
      <div className="wave-canvas">
        {waveform ? (
          <div className="wave-bars">
            {waveform.peaks.map((peak, index) => (
              <i
                key={index}
                style={{
                  height: `${Math.max(4, peak * 100)}%`,
                  opacity: index / waveform.peaks.length <= progress ? 1 : 0.32,
                }}
              />
            ))}
          </div>
        ) : (
          <span className="loading-wave">Loading waveform</span>
        )}
        <div className="playhead" style={{ left: `${Math.max(0, Math.min(progress * 100, 100))}%` }} />
      </div>
      <div className="time-row">
        <span>0:00</span>
        <span>{formatTime(duration || waveform?.duration || 0)}</span>
      </div>
    </section>
  );
}

export default App;
