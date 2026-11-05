import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, modelsIn } from '../../lib/models.ts';

test('the model list matches the spec table', () => {
  assert.deepEqual(
    MODELS.map((m) => [m.key, m.name, m.exp1, m.exp2]),
    [
      ['elevenlabs', 'ElevenLabs eleven_v3', true, true],
      ['elevenlabs_v4', 'ElevenLabs eleven_v4', true, false],
      ['gemini_tts', 'Gemini 3.1 Flash TTS', true, true],
      ['gemini_live', 'Gemini 3.1 Flash Live', true, true],
      ['openai_tts', 'OpenAI gpt-4o-mini-tts', true, true],
      ['openai_sts', 'OpenAI gpt-realtime-2', true, true],
      ['hume', 'Hume Octave', true, true],
      ['grok_tts', 'Grok TTS', true, true],
      ['grok_sts', 'Grok Voice', true, true],
      ['nova_sts', 'Amazon Nova 2 Sonic', true, true],
      ['human', 'Human', false, true],
    ]
  );
  assert.equal(modelsIn(1).length, 10);
  assert.equal(modelsIn(2).length, 10);
});
