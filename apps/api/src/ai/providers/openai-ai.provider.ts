import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider } from '../ai.provider.interface.js';
import { buildAiSummaryPrompt, parseAiSummaryJson } from '../ai-prompt.util.js';
import { AiProviderResult, AiSummaryRequest } from '../ai.types.js';

@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly name = 'OPENAI' as const;

  constructor(private readonly configService: ConfigService) {}

  isAvailable(): boolean {
    return Boolean(this.configService.get<string>('OPENAI_API_KEY'));
  }

  async summarizeReport(request: AiSummaryRequest): Promise<AiProviderResult> {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const model =
      this.configService.get<string>('OPENAI_MODEL') ??
      (request.grade === 'REASONING' ? 'gpt-5.1' : 'gpt-5.1-mini');
    const timeoutMs = Number(
      this.configService.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 20000,
    );

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You produce concise advisory JSON for relocation readiness reports. Output JSON only.',
          },
          {
            role: 'user',
            content: buildAiSummaryPrompt(request.snapshot, request.locale),
          },
        ],
      },
      {
        timeout: Number.isFinite(timeoutMs) ? timeoutMs : 20000,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const raw = String(
      response.data?.choices?.[0]?.message?.content ?? '',
    ).trim();
    if (!raw) {
      throw new Error('OpenAI returned empty response');
    }

    return {
      summary: parseAiSummaryJson(raw, request.locale),
      model,
    };
  }
}
