import { Test, TestingModule } from '@nestjs/testing';
import {
  OpenAiService,
  OPENAI_CLIENT,
  type AgentConfiguration,
} from './openai.service';

interface CreateParamsCallArg {
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  seed?: number;
}

describe('OpenAiService', () => {
  let service: OpenAiService;
  let mockClient: {
    chat: { completions: { create: jest.Mock } };
  };

  beforeEach(async () => {
    mockClient = {
      chat: { completions: { create: jest.fn() } },
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

  it('returns the first choice message from the completion', async () => {
    const message = { role: 'assistant', content: 'hello' };
    mockClient.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message }],
    });

    const result = await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toEqual(message);
  });

  it('omits the tools param entirely when no tools are given', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });

    await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    });

    const [call] = mockClient.chat.completions.create.mock.calls[0] as [
      CreateParamsCallArg,
    ];
    expect(call.tools).toBeUndefined();
  });

  it('passes tools through when provided', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });
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
    mockClient.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });

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
    mockClient.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });

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
});
