import { Test, TestingModule } from '@nestjs/testing';
import {
  OpenAiService,
  OPENAI_CLIENT,
  type AgentConfiguration,
} from './openai.service';

interface CreateParamsCallArg {
  tools?: unknown[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
}

// Minimal stand-in for the fields of ChatCompletionChunk.choices[0].delta
// this service actually reads.
interface FakeChunk {
  choices: [
    {
      delta: {
        content?: string | null;
        tool_calls?: {
          index: number;
          id?: string;
          function?: { name?: string; arguments?: string };
        }[];
      };
    },
  ];
}

// Fakes the async-iterable Stream<ChatCompletionChunk> the real SDK resolves
// to when `stream: true` is passed — a plain resolved array wouldn't be
// iterable with `for await`.
function fakeStream(chunks: FakeChunk[]): AsyncIterable<FakeChunk> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function contentChunk(content: string): FakeChunk {
  return { choices: [{ delta: { content } }] };
}

describe('OpenAiService', () => {
  let service: OpenAiService;
  let mockClient: {
    chat: { completions: { create: jest.Mock } };
    embeddings: { create: jest.Mock };
  };

  beforeEach(async () => {
    mockClient = {
      chat: { completions: { create: jest.fn() } },
      embeddings: { create: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAiService,
        { provide: OPENAI_CLIENT, useValue: mockClient },
      ],
    }).compile();

    service = module.get<OpenAiService>(OpenAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('accumulates streamed content chunks into the final result', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([contentChunk('hel'), contentChunk('lo')]),
    );

    const result = await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toEqual({ content: 'hello', tool_calls: undefined });
  });

  it('invokes onDelta once per content chunk with the exact fragment', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([contentChunk('hel'), contentChunk('lo')]),
    );
    const onDelta = jest.fn();

    await service.createChatCompletion(
      { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] },
      onDelta,
    );

    expect(onDelta).toHaveBeenNthCalledWith(1, 'hel');
    expect(onDelta).toHaveBeenNthCalledWith(2, 'lo');
  });

  it('concatenates tool-call name/argument fragments split across chunks by index', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_1', function: { name: 'weat' } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { name: 'her', arguments: '{"city":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: '"NYC"}' } },
                ],
              },
            },
          ],
        },
      ]),
    );

    const result = await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'weather in NYC' }],
    });

    expect(result).toEqual({
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'weather', arguments: '{"city":"NYC"}' },
        },
      ],
    });
  });

  it('sets stream: true and omits the tools param entirely when no tools are given', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([contentChunk('ok')]),
    );

    await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [call] = mockClient.chat.completions.create.mock.calls[0] as [
      CreateParamsCallArg,
    ];
    expect(call.stream).toBe(true);
    expect(call.tools).toBeUndefined();
  });

  it('passes tools through when provided', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([contentChunk('ok')]),
    );
    const tools = [
      {
        type: 'function' as const,
        function: { name: 'weather', description: '', parameters: {} },
      },
    ];

    await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      tools,
    });

    const [call] = mockClient.chat.completions.create.mock.calls[0] as [
      CreateParamsCallArg,
    ];
    expect(call.tools).toEqual(tools);
  });

  it('maps every known configuration field to its OpenAI param name', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([contentChunk('ok')]),
    );

    await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      configuration: {
        temperature: 0.7,
        maxTokens: 1024,
        topP: 0.9,
        frequencyPenalty: 0.5,
        presencePenalty: -0.5,
      },
    });

    const [call] = mockClient.chat.completions.create.mock.calls[0] as [
      CreateParamsCallArg,
    ];
    expect(call.temperature).toBe(0.7);
    expect(call.max_tokens).toBe(1024);
    expect(call.top_p).toBe(0.9);
    expect(call.frequency_penalty).toBe(0.5);
    expect(call.presence_penalty).toBe(-0.5);
  });

  it('only forwards known configuration fields, dropping anything unrecognized', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce(
      fakeStream([contentChunk('ok')]),
    );

    await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      // Simulates a row written before configuration was validated —
      // OpenAiService must not forward it to OpenAI verbatim.
      configuration: { temperature: 0.5, seed: 42 } as AgentConfiguration,
    });

    const [call] = mockClient.chat.completions.create.mock.calls[0] as [
      CreateParamsCallArg,
    ];
    expect(call.temperature).toBe(0.5);
    expect(call.seed).toBeUndefined();
  });

  describe('createEmbeddings', () => {
    it('returns embeddings in input order alongside total token usage', async () => {
      mockClient.embeddings.create.mockResolvedValueOnce({
        data: [
          { index: 0, embedding: [0.1, 0.2] },
          { index: 1, embedding: [0.3, 0.4] },
        ],
        usage: { prompt_tokens: 10, total_tokens: 10 },
      });

      const result = await service.createEmbeddings(['a', 'b']);

      expect(result).toEqual({
        embeddings: [
          [0.1, 0.2],
          [0.3, 0.4],
        ],
        totalTokens: 10,
      });
      expect(mockClient.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['a', 'b'],
      });
    });
  });

  describe('usage reporting on chat completions', () => {
    it('requests include_usage and surfaces the final chunk\'s usage totals', async () => {
      mockClient.chat.completions.create.mockResolvedValueOnce(
        fakeStream([
          contentChunk('ok'),
          {
            choices: [],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 2,
              total_tokens: 7,
            },
          } as unknown as FakeChunk,
        ]),
      );

      const result = await service.createChatCompletion({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'hi' }],
      });

      const [call] = mockClient.chat.completions.create.mock.calls[0] as [
        { stream_options?: { include_usage: boolean } },
      ];
      expect(call.stream_options).toEqual({ include_usage: true });
      expect(result.usage).toEqual({
        promptTokens: 5,
        completionTokens: 2,
        totalTokens: 7,
      });
    });
  });
});
