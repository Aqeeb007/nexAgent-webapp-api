import { Test, TestingModule } from '@nestjs/testing';
import { OpenAiService, OPENAI_CLIENT } from './openai.service';

interface CreateParamsCallArg {
  tools?: unknown[];
  temperature?: number;
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

  it('spreads agent configuration (e.g. temperature) into the request', async () => {
    mockClient.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { role: 'assistant', content: 'ok' } }],
    });

    await service.createChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      configuration: { temperature: 0.2 },
    });

    const [call] = mockClient.chat.completions.create.mock.calls[0] as [
      CreateParamsCallArg,
    ];
    expect(call.temperature).toBe(0.2);
  });
});
