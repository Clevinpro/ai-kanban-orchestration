import type { Config } from 'jest';

/**
 * E2E Jest config — picks up ONLY `*.e2e-spec.ts` (supertest, in-process).
 * The default unit run (`jest.config.ts`) ignores these, so `nx test` and
 * `nx e2e` never overlap. No coverage thresholds here: E2E covers HTTP flows,
 * not line coverage.
 */
const config: Config = {
  displayName: 'api-gateway-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};

export default config;
