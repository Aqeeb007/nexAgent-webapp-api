import { plainToInstance } from 'class-transformer';
import { Trim } from './trim.decorator';

class TrimTestDto {
  @Trim()
  value: unknown;
}

describe('Trim', () => {
  it('trims leading and trailing whitespace from a string', () => {
    const result = plainToInstance(TrimTestDto, {
      value: '  jane@example.com  ',
    });

    expect(result.value).toBe('jane@example.com');
  });

  it('leaves non-string values untouched', () => {
    const result = plainToInstance(TrimTestDto, { value: 42 });

    expect(result.value).toBe(42);
  });
});
