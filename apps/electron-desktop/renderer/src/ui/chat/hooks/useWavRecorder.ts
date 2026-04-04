import { useCallback, useRef, useState } from "react";
import { errorToMessage } from "@shared/toast";

const SAMPLE_RATE = 16_000;
const NUM_CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

function encodeWav(samples: Float32Array): Uint8Array {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataLength = samples.length * bytesPerSample;
  const headerLength = 44;
  const buffer = new ArrayBuffer(headerLength + dataLength);
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, "WAVE");

  // fmt sub-chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, NUM_CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * NUM_CHANNELS * bytesPerSample, true);
  view.setUint16(32, NUM_CHANNELS * bytesPerSample, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);

  // data sub-chunk
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Convert float32 samples to int16
  let offset = headerLength;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]!));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(offset, val, true);
    offset += 2;
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

export type WavRecorderResult = {
  startRecording: () => void;
  stopRecording: () => Promise<Uint8Array | null>;
  cancelRecording: () => void;
  isRecording: boolean;
  error: string | null;
};

export function useWavRecorder(): WavRecorderResult {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    audioContextRef.current?.close().catch((err) => console.warn("[wav-recorder] AudioContext.close (cleanup):", err));
    processorRef.current = null;
    sourceRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    chunksRef.current = [];
  }, []);

  const startRecording = useCallback(() => {
    setError(null);
    chunksRef.current = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        // ScriptProcessorNode is deprecated but universally supported in Electron's Chromium.
        // AudioWorklet requires a separate file which adds complexity; ScriptProcessorNode
        // is simpler and perfectly adequate for short voice recordings.
        const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
        const source = ctx.createMediaStreamSource(stream);
        const processor = ctx.createScriptProcessor(4096, 1, 1);

        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          chunksRef.current.push(new Float32Array(input));
        };

        source.connect(processor);
        processor.connect(ctx.destination);

        audioContextRef.current = ctx;
        mediaStreamRef.current = stream;
        sourceRef.current = source;
        processorRef.current = processor;
        setIsRecording(true);
      })
      .catch((err) => {
        setError(`Microphone access denied: ${errorToMessage(err)}`);
      });
  }, []);

  const stopRecording = useCallback(async (): Promise<Uint8Array | null> => {
    if (!audioContextRef.current) {
      setIsRecording(false);
      return null;
    }

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());

    const chunks = chunksRef.current;
    chunksRef.current = [];

    await audioContextRef.current
      .close()
      .catch((err) => console.warn("[wav-recorder] AudioContext.close (stop):", err));
    audioContextRef.current = null;
    mediaStreamRef.current = null;
    sourceRef.current = null;
    processorRef.current = null;
    setIsRecording(false);

    if (chunks.length === 0) {
      return null;
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    return encodeWav(merged);
  }, []);

  const cancelRecording = useCallback(() => {
    cleanup();
    setIsRecording(false);
  }, [cleanup]);

  return { startRecording, stopRecording, cancelRecording, isRecording, error };
}
