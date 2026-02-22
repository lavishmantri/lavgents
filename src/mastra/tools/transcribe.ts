import { isOfflineMode } from '../config/model';

/**
 * Transcribe an audio buffer using Whisper API.
 * Supports both OpenAI cloud and local Whisper (offline mode).
 */
export async function transcribeAudioBuffer(buffer: Buffer, fileName: string): Promise<string> {
  const blob = new Blob([buffer]);
  const formData = new FormData();
  formData.append('file', blob, fileName);

  let transcriptionUrl: string;
  const headers: Record<string, string> = {};

  if (isOfflineMode) {
    const whisperBase = process.env.WHISPER_BASE_URL || 'http://localhost:8080/v1';
    transcriptionUrl = `${whisperBase}/audio/transcriptions`;
    formData.append('model', 'Systran/faster-whisper-base.en');
  } else {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for transcription');
    }
    transcriptionUrl = 'https://api.openai.com/v1/audio/transcriptions';
    headers['Authorization'] = `Bearer ${apiKey}`;
    formData.append('model', 'whisper-1');
  }

  formData.append('language', 'en');

  const response = await fetch(transcriptionUrl, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Whisper API error (${response.status}): ${errorBody}`);
  }

  const result = await response.json() as { text?: string };
  if (!result.text) {
    throw new Error('Whisper returned empty transcription');
  }

  return result.text;
}
