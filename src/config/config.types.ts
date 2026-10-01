import { type ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from './env.validation';

/**
 * Typed config: `config.get('PORT', { infer: true })`.
 * For constructor injection write `ConfigService<EnvironmentVariables, true>` directly
 * (a type alias would break Nest's reflection-based DI).
 */
export type AppConfigService = ConfigService<EnvironmentVariables, true>;
