export type TrackCategory =
  | "Acoustic Jazz"
  | "EDM Pop"
  | "Synth Bass"
  | "Trap Boombap"
  | "Woman Vocal";

export type Track = {
  id: string;
  title: string;
  category: TrackCategory;
  src: string;
};

const trackUrl = (fileName: string) => new URL(`../../music/${fileName}`, import.meta.url).href;

export const tracks: Track[] = [
  { id: "acoustic-jazz-1", title: "AcusticJazz 1", category: "Acoustic Jazz", src: trackUrl("AcusticJazz1.mp3") },
  { id: "acoustic-jazz-2", title: "AcusticJazz 2", category: "Acoustic Jazz", src: trackUrl("AcusticJazz2.mp3") },
  { id: "acoustic-jazz-3", title: "AcusticJazz 3", category: "Acoustic Jazz", src: trackUrl("AcusticJazz3.mp3") },
  { id: "edm-pop-1", title: "EDMPOP 1", category: "EDM Pop", src: trackUrl("EDMPOP1.mp3") },
  { id: "edm-pop-2", title: "EDMPOP 2", category: "EDM Pop", src: trackUrl("EDMPOP2.mp3") },
  { id: "edm-pop-3", title: "EDMPOP 3", category: "EDM Pop", src: trackUrl("EDMPOP3.mp3") },
  { id: "synth-bass-1", title: "SynthBass 1", category: "Synth Bass", src: trackUrl("SynthBass1.mp3") },
  { id: "synth-bass-2", title: "SynthBass 2", category: "Synth Bass", src: trackUrl("SynthBass2.mp3") },
  { id: "synth-bass-3", title: "SynthBass 3", category: "Synth Bass", src: trackUrl("SynthBass3.mp3") },
  { id: "trap-boombap-1", title: "TrapBoombap 1", category: "Trap Boombap", src: trackUrl("TrapBoombap1.mp3") },
  { id: "trap-boombap-2", title: "TrapBoombap 2", category: "Trap Boombap", src: trackUrl("TrapBoombap2.mp3") },
  { id: "trap-boombap-3", title: "TrapBoombap 3", category: "Trap Boombap", src: trackUrl("TrapBoombap3.mp3") },
  { id: "woman-vocal-1", title: "WomanVocal 1", category: "Woman Vocal", src: trackUrl("WomanVocal1.mp3") },
  { id: "woman-vocal-2", title: "WomanVocal 2", category: "Woman Vocal", src: trackUrl("WomanVocal2.mp3") },
  { id: "woman-vocal-3", title: "WomanVocal 3", category: "Woman Vocal", src: trackUrl("WomanVocal3.mp3") },
];

export const categories: TrackCategory[] = [
  "Acoustic Jazz",
  "EDM Pop",
  "Synth Bass",
  "Trap Boombap",
  "Woman Vocal",
];
