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

    const primaryModel =
      this.configService.get<string>('OPENROUTER_MODEL') ??
      'openai/gpt-5.1-mini';
    const fallbackModel = this.configService.get<string>(
      'OPENROUTER_FALLBACK_MODEL',
    );
    const baseUrl =
      this.configService.get<string>('OPENROUTER_BASE_URL') ??
      'https://openrouter.ai/api/v1/chat/completions';
    const timeoutMs = Number(
      this.configService.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 20000,
    );
    const timeout = Number.isFinite(timeoutMs) ? timeoutMs : 20000;

    const modelChain = [primaryModel, fallbackModel].filter(
      (model, idx, arr): model is string =>
        Boolean(model && arr.indexOf(model) === idx),
    );
    let lastError: unknown;

    for (const model of modelChain) {
      try {
        const response = await axios.post(
          baseUrl,
          {
            model,
            temperature: 0.2,
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
            timeout,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        );

        const raw = this.extractTextPayload(response.data);
        if (!raw) {
          throw new Error(
            `OpenRouter returned empty response for model "${model}"`,
          );
        }

        return {
          summary: parseAiSummaryJson(raw),
          model,
        };
      } catch (error: unknown) {
        lastError = error;
      }
    }

    const reason =
      lastError instanceof Error ? lastError.message : 'unknown error';
    throw new Error(`OpenRouter failed across model chain: ${reason}`);
  }

  private extractTextPayload(data: unknown): string {
    const choice = (data as { choices?: unknown[] } | null)?.choices?.[0] as
      | {
          text?: unknown;
          message?: { content?: unknown };
        }
      | undefined;
    if (!choice) return '';

    if (typeof choice.text === 'string') {
      return choice.text.trim();
    }

    const content = choice.message?.content;
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      const joined = content
        .map((part) => {
          if (typeof part === 'string') return part;
          if (part && typeof part === 'object' && 'text' in part) {
            const text = (part as { text?: unknown }).text;
            return typeof text === 'string' ? text : '';
          }
          return '';
        })
        .join('\n')
        .trim();
      return joined;
    }

    return '';
  }
}
