import { IsIn, IsObject, IsOptional, IsUrl } from 'class-validator';

export type HttpToolMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class HttpToolConfigDto {
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  url!: string;

  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method!: HttpToolMethod;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
