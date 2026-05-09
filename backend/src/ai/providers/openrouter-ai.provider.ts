import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider } from '../ai.provider.interface.js';
import { buildAiSummaryPrompt, parseAiSummaryJson } from '../ai-prompt.util.js';
import { AiProviderResult, AiSummaryRequest } from '../ai.types.js';

@Injectable()
export class OpenRouterProvider implements AiProvider {
  readonly name = 'OPENROUTER' as const;

  constructor(private readonly configService: ConfigService) {}

  isAvailable(): boolean {
    return Boolean(this.configService.get<string>('OPENROUTER_API_KEY'));
  }

  async summarizeReport(request: AiSummaryRequest): Promise<AiProviderResult> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }

    const model =
      this.configService.get<string>('OPENROUTER_MODEL') ?? 'openai/gpt-5.1-mini';
    const baseUrl =
      this.configService.get<string>('OPENROUTER_BASE_URL') ??
      'https://openrouter.ai/api/v1/chat/completions';
    const timeoutMs = Number(this.configService.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 20000);

    const response = await axios.post(
      baseUrl,
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
          { role: 'user', content: buildAiSummaryPrompt(request.snapshot) },
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

    const raw = String(response.data?.choices?.[0]?.message?.content ?? '').trim();
    if (!raw) {
      throw new Error('OpenRouter returned empty response');
    }

    return {
      summary: parseAiSummaryJson(raw),
      model,
    };
  }
}
