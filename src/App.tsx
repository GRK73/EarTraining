import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Award,
  BarChart3,
  Check,
  ChevronLeft,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Trophy,
  Volume2,
  X,
} from "lucide-react";
import { tracks, type Track } from "./data/tracks";

type Difficulty = "beginner" | "intermediate" | "advanced" | "expert";
type EffectId = "lowBoost" | "highBoost" | "midCut" | "compression" | "stereo" | "limiter";
type PlaybackTarget = "original" | "processed" | null;

type EffectDefinition = {
  id: EffectId;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  neutral: number;
  beginnerTolerance: number;
  intermediateTolerance: number;
};

type EffectSetting = {
  id: EffectId;
  amount: number;
};

type Question = {
  id: number;
  track: Track;
  clipStart: number | null;
  effects: EffectSetting[];
};

type AudioGraph = {
  context: AudioContext;
  originalSource: MediaElementAudioSourceNode;
  processedSource: MediaElementAudioSourceNode;
  originalGain: GainNode;
  processedGain: GainNode;
  lowShelf: BiquadFilterNode;
  highShelf: BiquadFilterNode;
  midCut: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  stereoDelay: DelayNode;
  limiter: DynamicsCompressorNode;
};

type SingleAnswer = {
  effectId: EffectId;
  amount: number;
};

const clipLength = 20;

const difficulties: Record<
  Difficulty,
  {
    label: string;
    subtitle: string;
    rule: string;
    multiplier: number;
  }
> = {
  beginner: {
    label: "초보자",
    subtitle: "효과 이름을 보고 양을 맞추기",
    rule: "효과를 딱 하나만 넣고, 어떤 효과인지 한국어 설명과 함께 알려줍니다.",
    multiplier: 100,
  },
  intermediate: {
    label: "중급자",
    subtitle: "효과 종류와 양을 함께 맞추기",
    rule: "효과 하나를 듣고, 무슨 효과인지와 얼마나 들어갔는지 맞춥니다.",
    multiplier: 160,
  },
  advanced: {
    label: "상급자",
    subtitle: "2-3개 효과 조합 맞추기",
    rule: "효과의 양은 묻지 않고, 들어간 효과 종류만 맞춥니다.",
    multiplier: 220,
  },
  expert: {
    label: "전문가",
    subtitle: "직접 효과 체인을 만들어 통과하기",
    rule: "최대 4개 효과를 듣고 직접 체인을 맞춥니다. 정확도 75% 이상이면 통과입니다.",
    multiplier: 350,
  },
};

const effects: EffectDefinition[] = [
  {
    id: "lowBoost",
    label: "저역 부스트",
    description: "킥, 베이스, 바디감이 더 앞으로 나오도록 낮은 주파수를 올립니다.",
    min: 1,
    max: 9,
    step: 0.5,
    unit: "dB",
    neutral: 0,
    beginnerTolerance: 1.5,
    intermediateTolerance: 1,
  },
  {
    id: "highBoost",
    label: "고역 부스트",
    description: "심벌, 보컬 공기감, 선명도가 더 밝게 들리도록 높은 주파수를 올립니다.",
    min: 1,
    max: 9,
    step: 0.5,
    unit: "dB",
    neutral: 0,
    beginnerTolerance: 1.5,
    intermediateTolerance: 1,
  },
  {
    id: "midCut",
    label: "중역 컷",
    description: "답답하거나 박스처럼 들리는 중역대를 깎아 공간을 만듭니다.",
    min: 1,
    max: 9,
    step: 0.5,
    unit: "dB",
    neutral: 0,
    beginnerTolerance: 1.5,
    intermediateTolerance: 1,
  },
  {
    id: "compression",
    label: "컴프레션",
    description: "다이내믹 레인지를 줄여 소리를 더 단단하고 일정하게 만듭니다.",
    min: 2,
    max: 10,
    step: 0.5,
    unit: ":1",
    neutral: 1,
    beginnerTolerance: 1.5,
    intermediateTolerance: 1,
  },
  {
    id: "stereo",
    label: "스테레오 확장",
    description: "좌우 폭이 넓어진 것처럼 들리도록 시간차를 더합니다.",
    min: 4,
    max: 24,
    step: 1,
    unit: "ms",
    neutral: 0,
    beginnerTolerance: 4,
    intermediateTolerance: 3,
  },
  {
    id: "limiter",
    label: "리미팅",
    description: "피크를 강하게 눌러 전체 음압이 더 조여진 느낌을 만듭니다.",
    min: -18,
    max: -4,
    step: 1,
    unit: "dB",
    neutral: 0,
    beginnerTolerance: 3,
    intermediateTolerance: 2,
  },
];

const effectMap = Object.fromEntries(effects.map((effect) => [effect.id, effect])) as Record<EffectId, EffectDefinition>;

const randomItem = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const shuffle = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

const formatAmount = (setting: EffectSetting) => {
  const definition = effectMap[setting.id];
  return `${setting.amount}${definition.unit}`;
};

const randomAmount = (definition: EffectDefinition) => {
  const steps = Math.round((definition.max - definition.min) / definition.step);
  return Number((definition.min + Math.floor(Math.random() * (steps + 1)) * definition.step).toFixed(2));
};

const chooseClipStart = (duration: number) => {
  if (!Number.isFinite(duration)) return 0;
  const maxStart = Math.max(0, duration - clipLength - 1);
  return maxStart > 0 ? Math.round(Math.random() * maxStart) : 0;
};

const createQuestion = (difficulty: Difficulty, id: number): Question => {
  const track = randomItem(tracks);
  const count =
    difficulty === "advanced"
      ? Math.random() > 0.48
        ? 3
        : 2
      : difficulty === "expert"
        ? 1 + Math.floor(Math.random() * 4)
        : 1;

  const selected = shuffle(effects).slice(0, count);
  return {
    id,
    track,
    clipStart: null,
    effects: selected.map((effect) => ({
      id: effect.id,
      amount: randomAmount(effect),
    })),
  };
};

const createDefaultSingleAnswer = (effectId: EffectId = effects[0].id): SingleAnswer => ({
  effectId,
  amount: effectMap[effectId].min,
});

const createExpertAnswer = () =>
  Object.fromEntries(effects.map((effect) => [effect.id, { enabled: false, amount: effect.min }])) as Record<
    EffectId,
    { enabled: boolean; amount: number }
  >;

function App() {
  const [screen, setScreen] = useState<"home" | "quiz" | "gameover">("home");
  const [difficulty, setDifficulty] = useState<Difficulty>("beginner");
  const [question, setQuestion] = useState<Question>(() => createQuestion("beginner", 1));
  const [round, setRound] = useState(1);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [playback, setPlayback] = useState<PlaybackTarget>(null);
  const [rankingOpen, setRankingOpen] = useState(false);
  const [singleAnswer, setSingleAnswer] = useState<SingleAnswer>(() => createDefaultSingleAnswer());
  const [advancedAnswer, setAdvancedAnswer] = useState<Set<EffectId>>(() => new Set());
  const [expertAnswer, setExpertAnswer] = useState(createExpertAnswer);

  const originalAudio = useRef<HTMLAudioElement | null>(null);
  const processedAudio = useRef<HTMLAudioElement | null>(null);
  const graphRef = useRef<AudioGraph | null>(null);

  const currentDifficulty = difficulties[difficulty];
  const targetEffect = question.effects[0];
  const targetDefinition = effectMap[targetEffect.id];
  const clipStart = question.clipStart ?? 0;
  const clipEnd = clipStart + clipLength;

  const answerLocked = feedback !== null;

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
    const highShelf = context.createBiquadFilter();
    const midCut = context.createBiquadFilter();
    const compressor = context.createDynamicsCompressor();
    const stereoDelay = context.createDelay(0.05);
    const limiter = context.createDynamicsCompressor();

    lowShelf.type = "lowshelf";
    lowShelf.frequency.value = 120;
    highShelf.type = "highshelf";
    highShelf.frequency.value = 7600;
    midCut.type = "peaking";
    midCut.frequency.value = 520;
    midCut.Q.value = 1.05;

    originalSource.connect(originalGain).connect(context.destination);
    processedSource
      .connect(lowShelf)
      .connect(highShelf)
      .connect(midCut)
      .connect(compressor)
      .connect(stereoDelay)
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
      highShelf,
      midCut,
      compressor,
      stereoDelay,
      limiter,
    };

    return graphRef.current;
  }, []);

  const applyEffects = useCallback(() => {
    const graph = graphRef.current;
    if (!graph) return;

    const amount = (id: EffectId) => question.effects.find((effect) => effect.id === id)?.amount;
    graph.lowShelf.gain.value = amount("lowBoost") ?? 0;
    graph.highShelf.gain.value = amount("highBoost") ?? 0;
    graph.midCut.gain.value = -(amount("midCut") ?? 0);

    const compression = amount("compression");
    graph.compressor.threshold.value = compression ? -18 - compression : 0;
    graph.compressor.ratio.value = compression ?? 1;
    graph.compressor.attack.value = compression ? 0.008 : 0.003;
    graph.compressor.release.value = compression ? 0.16 : 0.05;

    const stereo = amount("stereo");
    graph.stereoDelay.delayTime.value = stereo ? stereo / 1000 : 0;

    const limiter = amount("limiter");
    graph.limiter.threshold.value = limiter ?? 0;
    graph.limiter.knee.value = 1;
    graph.limiter.ratio.value = limiter ? 18 : 1;
    graph.limiter.attack.value = 0.001;
    graph.limiter.release.value = 0.05;
  }, [question.effects]);

  const stopPlayback = useCallback(() => {
    originalAudio.current?.pause();
    processedAudio.current?.pause();
    setPlayback(null);
  }, []);

  const startPlayback = async (target: Exclude<PlaybackTarget, null>) => {
    const graph = ensureGraph();
    const original = originalAudio.current;
    const processed = processedAudio.current;
    if (!graph || !original || !processed) return;

    await graph.context.resume();
    applyEffects();
    stopPlayback();

    graph.originalGain.gain.value = target === "original" ? 0.92 : 0;
    graph.processedGain.gain.value = target === "processed" ? 0.8 : 0;

    const audio = target === "original" ? original : processed;
    const resolvedClipStart = question.clipStart ?? chooseClipStart(audio.duration || original.duration || processed.duration);
    if (question.clipStart === null) {
      setQuestion((current) => ({ ...current, clipStart: resolvedClipStart }));
    }

    audio.currentTime = resolvedClipStart;
    await audio.play();
    setPlayback(target);
  };

  useEffect(() => {
    applyEffects();
  }, [applyEffects]);

  useEffect(() => {
    const original = originalAudio.current;
    const processed = processedAudio.current;
    if (!original || !processed) return;

    original.src = question.track.src;
    processed.src = question.track.src;
    original.load();
    processed.load();
    stopPlayback();
  }, [question.track.src, stopPlayback]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const active = playback === "original" ? originalAudio.current : playback === "processed" ? processedAudio.current : null;
      if (active && active.currentTime >= clipEnd) {
        active.pause();
        active.currentTime = clipStart;
        setPlayback(null);
      }
    }, 120);
    return () => window.clearInterval(interval);
  }, [clipEnd, clipStart, playback]);

  const resetAnswers = (nextDifficulty: Difficulty, nextQuestion: Question) => {
    const firstEffect = nextQuestion.effects[0].id;
    setSingleAnswer(createDefaultSingleAnswer(nextDifficulty === "beginner" ? firstEffect : effects[0].id));
    setAdvancedAnswer(new Set());
    setExpertAnswer(createExpertAnswer());
  };

  const startGame = (nextDifficulty: Difficulty) => {
    const nextQuestion = createQuestion(nextDifficulty, 1);
    window.scrollTo({ top: 0, left: 0 });
    setDifficulty(nextDifficulty);
    setQuestion(nextQuestion);
    setRound(1);
    setLives(3);
    setScore(0);
    setFeedback(null);
    setIsCorrect(null);
    resetAnswers(nextDifficulty, nextQuestion);
    setScreen("quiz");
  };

  const nextQuestion = () => {
    const nextRound = round + 1;
    const generated = createQuestion(difficulty, nextRound);
    window.scrollTo({ top: 0, left: 0 });
    setQuestion(generated);
    setRound(nextRound);
    setFeedback(null);
    setIsCorrect(null);
    resetAnswers(difficulty, generated);
  };

  const updateClipStart = (duration: number) => {
    setQuestion((current) => {
      if (current.clipStart !== null || !Number.isFinite(duration)) return current;
      return {
        ...current,
        clipStart: chooseClipStart(duration),
      };
    });
  };

  const resolveAnswer = (correct: boolean, detail: string, accuracy = correct ? 1 : 0) => {
    stopPlayback();
    setIsCorrect(correct);
    setFeedback(detail);

    if (correct) {
      setScore((value) => value + Math.round(currentDifficulty.multiplier * Math.max(0.4, accuracy)));
      return;
    }

    setLives((value) => {
      const next = value - 1;
      if (next <= 0) {
        window.setTimeout(() => setScreen("gameover"), 650);
      }
      return Math.max(0, next);
    });
  };

  const submitBeginner = () => {
    const tolerance = targetDefinition.beginnerTolerance;
    const correct = Math.abs(singleAnswer.amount - targetEffect.amount) <= tolerance;
    resolveAnswer(
      correct,
      correct
        ? `정답입니다. ${targetDefinition.label} ${formatAmount(targetEffect)}`
        : `오답입니다. 정답은 ${targetDefinition.label} ${formatAmount(targetEffect)} 입니다.`,
    );
  };

  const submitIntermediate = () => {
    const selectedDefinition = effectMap[singleAnswer.effectId];
    const sameEffect = singleAnswer.effectId === targetEffect.id;
    const inRange = Math.abs(singleAnswer.amount - targetEffect.amount) <= targetDefinition.intermediateTolerance;
    resolveAnswer(
      sameEffect && inRange,
      sameEffect && inRange
        ? `정답입니다. ${targetDefinition.label} ${formatAmount(targetEffect)}`
        : `오답입니다. 정답은 ${targetDefinition.label} ${formatAmount(targetEffect)} 입니다. 선택: ${selectedDefinition.label} ${singleAnswer.amount}${selectedDefinition.unit}`,
    );
  };

  const submitAdvanced = () => {
    const targetIds = new Set(question.effects.map((effect) => effect.id));
    const selectedIds = advancedAnswer;
    const correct = targetIds.size === selectedIds.size && [...targetIds].every((id) => selectedIds.has(id));
    const answerText = question.effects.map((effect) => effectMap[effect.id].label).join(", ");
    resolveAnswer(correct, correct ? `정답입니다. 효과 조합: ${answerText}` : `오답입니다. 정답 조합은 ${answerText} 입니다.`);
  };

  const submitExpert = () => {
    const targetIds = new Set(question.effects.map((effect) => effect.id));
    const selected = Object.entries(expertAnswer).filter(([, value]) => value.enabled) as [EffectId, { enabled: boolean; amount: number }][];
    const extras = selected.filter(([id]) => !targetIds.has(id)).length;

    const targetScore = question.effects.reduce((sum, target) => {
      const answer = expertAnswer[target.id];
      if (!answer.enabled) return sum;
      const definition = effectMap[target.id];
      const range = definition.max - definition.min;
      const distance = Math.abs(answer.amount - target.amount) / range;
      return sum + Math.max(0, 1 - distance / 0.35);
    }, 0);

    const accuracy = Math.max(0, (targetScore / question.effects.length) - extras * 0.18);
    const correct = accuracy >= 0.75;
    const targetText = question.effects.map((effect) => `${effectMap[effect.id].label} ${formatAmount(effect)}`).join(", ");
    resolveAnswer(
      correct,
      correct ? `통과입니다. 정확도 ${Math.round(accuracy * 100)}%` : `실패입니다. 정확도 ${Math.round(accuracy * 100)}%. 정답 체인: ${targetText}`,
      accuracy,
    );
  };

  const submitAnswer = () => {
    if (difficulty === "beginner") submitBeginner();
    if (difficulty === "intermediate") submitIntermediate();
    if (difficulty === "advanced") submitAdvanced();
    if (difficulty === "expert") submitExpert();
  };

  const menuCards = useMemo(() => Object.entries(difficulties) as [Difficulty, (typeof difficulties)[Difficulty]][], []);

  if (screen === "home") {
    return (
      <main className="home-screen">
        <section className="home-hero">
          <div className="brand-row">
            <Volume2 />
            <span>EarTraining</span>
          </div>
          <div className="home-title">
            <h1>믹싱·마스터링 퀴즈</h1>
            <p>랜덤 음원의 랜덤한 20초 구간을 듣고, 들어간 효과를 맞춥니다.</p>
          </div>
          <button className="ranking-button" onClick={() => setRankingOpen(true)}>
            <Trophy size={20} />
            랭킹 순위
          </button>
        </section>

        <section className="difficulty-grid" aria-label="난이도 선택">
          {menuCards.map(([key, item], index) => (
            <button className="difficulty-card" key={key} onClick={() => startGame(key)}>
              <span className="difficulty-index">0{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{item.subtitle}</small>
              <em>{item.rule}</em>
            </button>
          ))}
        </section>

        {rankingOpen ? <RankingModal onClose={() => setRankingOpen(false)} /> : null}
      </main>
    );
  }

  if (screen === "gameover") {
    return (
      <main className="end-screen">
        <section className="end-panel">
          <Award size={44} />
          <h1>게임 종료</h1>
          <p>{currentDifficulty.label} 모드 점수 집계가 완료되었습니다.</p>
          <strong>{score}점</strong>
          <div className="end-actions">
            <button onClick={() => startGame(difficulty)}>다시 시작</button>
            <button onClick={() => setScreen("home")}>메인화면</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="quiz-screen">
      <audio ref={originalAudio} preload="metadata" onLoadedMetadata={(event) => updateClipStart(event.currentTarget.duration)} />
      <audio ref={processedAudio} preload="metadata" />

      <header className="quiz-header">
        <button className="back-button" onClick={() => setScreen("home")}>
          <ChevronLeft size={20} />
          메인화면
        </button>
        <div>
          <span>{currentDifficulty.label}</span>
          <h1>문제 {round}</h1>
        </div>
        <div className="game-stats">
          <div>
            <small>목숨</small>
            <span className="lives">
              {Array.from({ length: 3 }).map((_, index) => (
                <Heart key={index} size={18} fill={index < lives ? "currentColor" : "none"} />
              ))}
            </span>
          </div>
          <div>
            <small>점수</small>
            <strong>{score}</strong>
          </div>
        </div>
      </header>

      <section className="audio-duel">
        <AudioDeck
          accent="cyan"
          active={playback === "original"}
          title="원본 음원"
          track={question.track.title}
          onPause={stopPlayback}
          onPlay={() => startPlayback("original")}
        />
        <AudioDeck
          accent="amber"
          active={playback === "processed"}
          title="효과 적용 음원"
          track={`${clipStart}s - ${clipEnd}s`}
          onPause={stopPlayback}
          onPlay={() => startPlayback("processed")}
        />
      </section>

      <section className="prompt-panel">
        <div>
          <span>20초 랜덤 구간</span>
          <h2>{getPromptTitle(difficulty, question)}</h2>
          <p>{getPromptBody(difficulty, question)}</p>
        </div>
        <div className="round-pill">{question.track.category}</div>
      </section>

      <section className="answer-panel">
        {difficulty === "beginner" ? (
          <SingleAmountAnswer
            answer={singleAnswer}
            fixedEffectId={targetEffect.id}
            onChange={setSingleAnswer}
          />
        ) : null}

        {difficulty === "intermediate" ? (
          <EffectAndAmountAnswer answer={singleAnswer} onChange={setSingleAnswer} />
        ) : null}

        {difficulty === "advanced" ? (
          <AdvancedAnswer selected={advancedAnswer} onChange={setAdvancedAnswer} />
        ) : null}

        {difficulty === "expert" ? (
          <ExpertAnswer answer={expertAnswer} onChange={setExpertAnswer} />
        ) : null}

        <div className="submit-row">
          <button className="submit-button" disabled={answerLocked} onClick={submitAnswer}>
            <Check size={20} />
            정답 제출
          </button>
          <button className="next-button" disabled={!answerLocked || lives <= 0} onClick={nextQuestion}>
            다음 문제
          </button>
        </div>

        {feedback ? (
          <div className={`feedback ${isCorrect ? "correct" : "wrong"}`}>
            {isCorrect ? <Check size={21} /> : <X size={21} />}
            <span>{feedback}</span>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function AudioDeck({
  accent,
  active,
  onPause,
  onPlay,
  title,
  track,
}: {
  accent: "cyan" | "amber";
  active: boolean;
  onPause: () => void;
  onPlay: () => void;
  title: string;
  track: string;
}) {
  return (
    <article className={`audio-deck ${accent}`}>
      <div>
        <span>{title}</span>
        <strong>{track}</strong>
      </div>
      <button onClick={active ? onPause : onPlay}>
        {active ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
        {active ? "멈춤" : "재생"}
      </button>
    </article>
  );
}

function SingleAmountAnswer({
  answer,
  fixedEffectId,
  onChange,
}: {
  answer: SingleAnswer;
  fixedEffectId: EffectId;
  onChange: (answer: SingleAnswer) => void;
}) {
  const definition = effectMap[fixedEffectId];
  return (
    <div className="answer-block">
      <div className="effect-banner">
        <Settings2 size={22} />
        <div>
          <strong>{definition.label}</strong>
          <p>{definition.description}</p>
        </div>
      </div>
      <AmountSlider
        amount={answer.amount}
        effectId={fixedEffectId}
        onChange={(amount) => onChange({ effectId: fixedEffectId, amount })}
      />
    </div>
  );
}

function EffectAndAmountAnswer({
  answer,
  onChange,
}: {
  answer: SingleAnswer;
  onChange: (answer: SingleAnswer) => void;
}) {
  return (
    <div className="answer-block two-column">
      <label className="select-card">
        <span>효과 선택</span>
        <select
          value={answer.effectId}
          onChange={(event) => {
            const effectId = event.currentTarget.value as EffectId;
            onChange({ effectId, amount: effectMap[effectId].min });
          }}
        >
          {effects.map((effect) => (
            <option key={effect.id} value={effect.id}>
              {effect.label}
            </option>
          ))}
        </select>
      </label>
      <AmountSlider amount={answer.amount} effectId={answer.effectId} onChange={(amount) => onChange({ ...answer, amount })} />
    </div>
  );
}

function AdvancedAnswer({
  selected,
  onChange,
}: {
  selected: Set<EffectId>;
  onChange: (selected: Set<EffectId>) => void;
}) {
  return (
    <div className="choice-grid">
      {effects.map((effect) => (
        <button
          className={selected.has(effect.id) ? "selected" : ""}
          key={effect.id}
          onClick={() => {
            const next = new Set(selected);
            if (next.has(effect.id)) next.delete(effect.id);
            else next.add(effect.id);
            onChange(next);
          }}
        >
          <SlidersHorizontal size={19} />
          <span>{effect.label}</span>
        </button>
      ))}
    </div>
  );
}

function ExpertAnswer({
  answer,
  onChange,
}: {
  answer: Record<EffectId, { enabled: boolean; amount: number }>;
  onChange: (answer: Record<EffectId, { enabled: boolean; amount: number }>) => void;
}) {
  const enabledCount = Object.values(answer).filter((value) => value.enabled).length;
  return (
    <div className="expert-grid">
      {effects.map((effect) => {
        const value = answer[effect.id];
        const disabled = !value.enabled && enabledCount >= 4;
        return (
          <div className={`expert-row ${value.enabled ? "enabled" : ""}`} key={effect.id}>
            <button
              disabled={disabled}
              onClick={() =>
                onChange({
                  ...answer,
                  [effect.id]: { ...value, enabled: !value.enabled },
                })
              }
            >
              {value.enabled ? <Check size={17} /> : <Settings2 size={17} />}
              {effect.label}
            </button>
            <AmountSlider
              amount={value.amount}
              compact
              disabled={!value.enabled}
              effectId={effect.id}
              onChange={(amount) =>
                onChange({
                  ...answer,
                  [effect.id]: { ...value, amount },
                })
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function AmountSlider({
  amount,
  compact = false,
  disabled = false,
  effectId,
  onChange,
}: {
  amount: number;
  compact?: boolean;
  disabled?: boolean;
  effectId: EffectId;
  onChange: (amount: number) => void;
}) {
  const definition = effectMap[effectId];
  return (
    <label className={`amount-slider ${compact ? "compact" : ""}`}>
      <span>
        들어간 양
        <strong>
          {amount}
          {definition.unit}
        </strong>
      </span>
      <input
        disabled={disabled}
        max={definition.max}
        min={definition.min}
        step={definition.step}
        type="range"
        value={amount}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function RankingModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="ranking-modal" role="dialog" aria-modal="true" aria-label="랭킹 순위">
        <button className="modal-close" onClick={onClose}>
          <X size={19} />
        </button>
        <Trophy size={36} />
        <h2>랭킹 순위</h2>
        <p>랭킹 집계 방식은 다음 단계에서 연결할 수 있도록 버튼과 화면만 준비했습니다.</p>
      </section>
    </div>
  );
}

function getPromptTitle(difficulty: Difficulty, question: Question) {
  if (difficulty === "beginner") return `${effectMap[question.effects[0].id].label}가 얼마나 들어갔을까요?`;
  if (difficulty === "intermediate") return "어떤 효과가 얼마나 들어갔을까요?";
  if (difficulty === "advanced") return "들어간 효과 2-3개를 모두 고르세요.";
  return "직접 효과 체인을 만들어 정확도 75% 이상을 넘기세요.";
}

function getPromptBody(difficulty: Difficulty, question: Question) {
  if (difficulty === "beginner") return effectMap[question.effects[0].id].description;
  if (difficulty === "intermediate") return "효과는 하나만 들어갔습니다. 원본과 효과 적용 음원을 번갈아 들어보세요.";
  if (difficulty === "advanced") return "효과 양은 채점하지 않습니다. 들어간 효과 종류만 정확히 맞추면 됩니다.";
  return "최대 4개까지 선택할 수 있습니다. 선택한 효과와 양을 정답 체인에 최대한 가깝게 맞추세요.";
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

export default App;
