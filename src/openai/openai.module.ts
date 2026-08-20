import { Module } from '@nestjs/common';

import { OpenAiService, openAiClientProvider } from './openai.service';

@Module({
  providers: [openAiClientProvider, OpenAiService],
  exports: [OpenAiService],
})
export class OpenAiModule {}
