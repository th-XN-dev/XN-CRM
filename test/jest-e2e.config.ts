import { type Config } from 'jest';

const config: Config = {
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.ts$': 'ts-jest' },
  globalSetup: '<rootDir>/test/utils/global-setup.ts',
  setupFiles: ['<rootDir>/test/utils/set-test-env.ts'],
  testTimeout: 30_000,
};

export default config;
