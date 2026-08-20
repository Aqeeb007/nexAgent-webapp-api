import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';

export const OPENAI_CLIENT = Symbol('OPENAI_CLIENT');

export const openAiClientProvider = {
  provide: OPENAI_CLIENT,
  useFactory: (configService: ConfigService) =>
    new OpenAI({ apiKey: configService.getOrThrow<string>('openai.apiKey') }),
  inject: [ConfigService],
};

interface CreateChatCompletionInput {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  configuration?: Record<string, unknown>;
}

@Injectable()
export class OpenAiService {
  constructor(@Inject(OPENAI_CLIENT) private readonly client: OpenAI) {}

  async createChatCompletion({
    model,
    messages,
    tools,
    configuration,
  }: CreateChatCompletionInput): Promise<ChatCompletionMessage> {
    const completion = await this.client.chat.completions.create({
      model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      // Unvalidated jsonb (temperature, max_tokens, etc.) — a garbage value
      // here is just another OpenAI API error, caught by the same generic
      // handling as an invalid model string.
      ...(configuration ?? {}),
    });

    return completion.choices[0].message;
  }
}
