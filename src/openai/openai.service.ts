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

// The fields an agent is allowed to configure. Kept in sync with
// AgentConfigurationDto, which is what actually validates and shapes this
// data on the way into the database — this is just the read-side mirror.
export interface AgentConfiguration {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

interface CreateChatCompletionInput {
  model: string;
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  configuration?: AgentConfiguration;
}

// The rest of this API is camelCase, but OpenAI's own params are
// snake_case (max_tokens, top_p, ...). This is an explicit whitelist, not a
// spread: only fields AgentConfigurationDto actually validated are ever
// forwarded, so no stray/legacy key can reach OpenAI as a surprise 400.
function toOpenAiParams(
  configuration?: AgentConfiguration,
): Record<string, unknown> {
  if (!configuration) {
    return {};
  }

  const { temperature, maxTokens, topP, frequencyPenalty, presencePenalty } =
    configuration;
  const params: Record<string, unknown> = {};

  if (temperature !== undefined) params.temperature = temperature;
  if (maxTokens !== undefined) params.max_tokens = maxTokens;
  if (topP !== undefined) params.top_p = topP;
  if (frequencyPenalty !== undefined)
    params.frequency_penalty = frequencyPenalty;
  if (presencePenalty !== undefined) params.presence_penalty = presencePenalty;

  return params;
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
      ...toOpenAiParams(configuration),
    });

    return completion.choices[0].message;
  }
}
