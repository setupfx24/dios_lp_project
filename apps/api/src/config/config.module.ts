import { Global, Injectable, Module } from '@nestjs/common';
import {
  ConfigModule as NestConfigModule,
  ConfigService as NestConfigService,
} from '@nestjs/config';

import { envSchema, type Env } from './env.schema.js';

@Injectable()
export class AppConfigService {
  constructor(private readonly nest: NestConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.nest.get(key, { infer: true });
  }

  get isDev(): boolean {
    return this.get('NODE_ENV') === 'development';
  }
  get isProd(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
  get isTest(): boolean {
    return this.get('NODE_ENV') === 'test';
  }
}

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Fail fast on misconfigured envs.
      validate: (raw: Record<string, unknown>) => {
        const parsed = envSchema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
            .join('\n');
          throw new Error(`Invalid environment configuration:\n${issues}`);
        }
        return parsed.data;
      },
    }),
  ],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
