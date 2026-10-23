// STATUS: PLATIN — Writer dictation adapter tests
import { describe, expect, it } from 'vitest';
import {
  processVoiceCommands,
  WriterDictationEngine,
  registerWriterLocalTranscriptionProvider,
  getWriterLocalTranscriptionProvider,
  transcribeWriterAudioLocally,
  type DictationResult,
  type DictationStatus,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
} from '../../../../media/audio/dictation/writerDictation';

class FakeRecognition implements SpeechRecognitionLike {
  public static latest: FakeRecognition | null = null;
  public continuous = false;
  public interimResults = false;
  public lang = '';
  public onstart: (() => void) | null = null;
  public onresult: ((event: SpeechRecognitionEventLike) => void) | null = null;
  public onerror: ((event: { error?: string; message?: string }) => void) | null = null;
  public onend: (() => void) | null = null;
  constructor() { FakeRecognition.latest = this; }
  public start(): void { this.onstart?.(); }
  public stop(): void { this.onend?.(); }
  public abort(): void { this.onend?.(); }
}

function fake(): FakeRecognition {
  const recognition = FakeRecognition.latest;
  if (!recognition) throw new Error('Fake recognition was not created.');
  return recognition;
}

describe('Writer dictation', () => {
  it('processes repeated voice commands deterministically across calls', () => {
    expect(processVoiceCommands('Hallo komma Welt punkt')).toEqual({ processedText: 'Hallo, Welt.', commandUsed: true });
    expect(processVoiceCommands('Noch ein punkt')).toEqual({ processedText: 'Noch ein.', commandUsed: true });
    expect(processVoiceCommands('plain text').commandUsed).toBe(false);
  });

  it('reports unsupported environments without pretending to be local', () => {
    const statuses: Array<[DictationStatus, string | undefined]> = [];
    const engine = new WriterDictationEngine({}, () => undefined);
    engine.onStatusChange((status, error) => statuses.push([status, error]));
    engine.start();
    expect(engine.isAvailable()).toBe(false);
    expect(engine.getPrivacyModel()).toBe('browser-managed');
    expect(statuses[0]?.[0]).toBe('unsupported');
  });

  it('emits typed final recognition results', () => {
    const received: DictationResult[] = [];
    const engine = new WriterDictationEngine({}, () => FakeRecognition);
    engine.onResult((result) => received.push(result));
    fake().onresult?.({
      resultIndex: 0,
      results: {
        0: { 0: { transcript: 'Test punkt', confidence: 0.92 }, isFinal: true, length: 1 },
        1: { 0: { transcript: 'Zwischenstand', confidence: 0.4 }, isFinal: false, length: 1 },
        length: 2,
      },
    });
    expect(received[0]).toMatchObject({ transcript: 'Test.', confidence: 0.92, isFinal: true });
  });


  it('uses an explicitly registered local transcription provider without cloud fallback', async () => {
    const requests: Array<{ mimeType: string; language: string; byteLength: number }> = [];
    registerWriterLocalTranscriptionProvider({
      id: 'local-test', label: 'Local Test STT', transport: 'local',
      async transcribe(request) {
        requests.push({ mimeType: request.mimeType, language: request.language, byteLength: request.audioBytes.length });
        return '  Lokales Transkript.  ';
      },
    });
    const file = new File([Uint8Array.from([0x49, 0x44, 0x33, 0x04, 0, 0, 0, 0])], 'voice.mp3', { type: 'audio/mpeg' });
    expect(getWriterLocalTranscriptionProvider()?.transport).toBe('local');
    await expect(transcribeWriterAudioLocally(file, 'de-DE')).resolves.toBe('Lokales Transkript.');
    expect(requests).toEqual([{ mimeType: 'audio/mpeg', language: 'de-DE', byteLength: 8 }]);
    registerWriterLocalTranscriptionProvider(null);
  });

  it('fails closed when no local provider is configured', async () => {
    registerWriterLocalTranscriptionProvider(null);
    const file = new File([Uint8Array.from([0x49, 0x44, 0x33, 0x04])], 'voice.mp3', { type: 'audio/mpeg' });
    await expect(transcribeWriterAudioLocally(file, 'de-DE')).rejects.toThrow('Kein lokaler Transkriptionsprovider');
  });

  it('propagates provider errors through the explicit status channel', () => {
    const statuses: Array<[DictationStatus, string | undefined]> = [];
    const engine = new WriterDictationEngine({}, () => FakeRecognition);
    engine.onStatusChange((status, error) => statuses.push([status, error]));
    fake().onerror?.({ error: 'not-allowed' });
    expect(engine.getStatus()).toBe('error');
    expect(statuses).toContainEqual(['error', 'not-allowed']);
  });
});
