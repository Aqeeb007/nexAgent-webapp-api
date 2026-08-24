import { BadRequestException } from '@nestjs/common';
import { validateToolConfig } from './validate-tool-config';

describe('validateToolConfig', () => {
  it('validates and returns an http config', async () => {
    const result = await validateToolConfig('http', {
      url: 'https://example.com',
      method: 'GET',
    });

    expect(result).toEqual({
      url: 'https://example.com',
      method: 'GET',
    });
  });

  it('rejects an invalid http config', async () => {
    await expect(
      validateToolConfig('http', { url: 'not-a-url', method: 'GET' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates a postgres database config chosen via config.engine', async () => {
    const result = await validateToolConfig('database', {
      engine: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'app',
      user: 'reader',
      password: 'secret',
      query: 'SELECT 1',
    });

    expect(result).toMatchObject({ engine: 'postgres', query: 'SELECT 1' });
  });

  it('validates a mysql database config chosen via config.engine', async () => {
    const result = await validateToolConfig('database', {
      engine: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'app',
      user: 'reader',
      password: 'secret',
      query: 'SELECT 1',
    });

    expect(result).toMatchObject({ engine: 'mysql', query: 'SELECT 1' });
  });

  it('rejects a database config with a non-read-only query', async () => {
    await expect(
      validateToolConfig('database', {
        engine: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'app',
        user: 'reader',
        password: 'secret',
        query: 'DELETE FROM users',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a database config with an unrecognized engine', async () => {
    await expect(
      validateToolConfig('database', { engine: 'oracle' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('validates a custom_js config', async () => {
    const result = await validateToolConfig('custom_js', {
      code: 'return 1;',
    });

    expect(result).toEqual({ code: 'return 1;' });
  });

  it('rejects an unsupported tool type', async () => {
    await expect(validateToolConfig('webhook', {})).rejects.toThrow(
      BadRequestException,
    );
  });
});
