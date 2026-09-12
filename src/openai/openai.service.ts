import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
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

// The subset of the SDK's ChatCompletionMessage that callers actually use —
// role/refusal/annotations/audio are dropped since nothing here reads them,
// and reconstructing them from a token stream wouldn't be meaningful anyway.
export interface ChatCompletionResult {
  content: string | null;
  tool_calls?: ChatCompletionMessageToolCall[];
}

// Accumulator for one in-progress tool call across the stream — id/type
// arrive once, name/arguments arrive fragmented and must be concatenated
// (never overwritten) as more chunks land at the same index.
interface AccumulatingToolCall {
  id?: string;
  name: string;
  arguments: string;
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

// Hardcoded, not per-agent configurable — agent.model is about the chat
// completion model only. Dimensions must match EMBEDDING_DIMENSIONS in
// src/database/schema/document-chunks.ts.
const EMBEDDING_MODEL = 'text-embedding-3-small';

@Injectable()
export class OpenAiService {
  constructor(@Inject(OPENAI_CLIENT) private readonly client: OpenAI) {}

  async createEmbeddings(input: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: EMBEDDING_MODEL,
      input,
    });

    return response.data.map((embedding) => embedding.embedding);
  }

  async createChatCompletion(
    { model, messages, tools, configuration }: CreateChatCompletionInput,
    onDelta?: (content: string) => void,
  ): Promise<ChatCompletionResult> {
    const stream = await this.client.chat.completions.create({
      model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      stream: true,
      ...toOpenAiParams(configuration),
    });

    let content = '';
    const toolCallsByIndex = new Map<number, AccumulatingToolCall>();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (!delta) {
        continue;
      }

      if (delta.content) {
        content += delta.content;
        onDelta?.(delta.content);
      }

      for (const toolCallDelta of delta.tool_calls ?? []) {
        const existing = toolCallsByIndex.get(toolCallDelta.index) ?? {
          name: '',
          arguments: '',
        };

        if (toolCallDelta.id) {
          existing.id = toolCallDelta.id;
        }
        if (toolCallDelta.function?.name) {
          existing.name += toolCallDelta.function.name;
        }
        if (toolCallDelta.function?.arguments) {
          existing.arguments += toolCallDelta.function.arguments;
        }

        toolCallsByIndex.set(toolCallDelta.index, existing);
      }
    }

    const toolCalls: ChatCompletionMessageToolCall[] = [
      ...toolCallsByIndex.entries(),
    ]
      .sort(([a], [b]) => a - b)
      .map(([, toolCall]) => ({
        id: toolCall.id ?? '',
        type: 'function',
        function: { name: toolCall.name, arguments: toolCall.arguments },
      }));

    return {
      content: content || null,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
