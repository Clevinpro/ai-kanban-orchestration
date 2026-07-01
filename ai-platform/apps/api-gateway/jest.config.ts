import type { Config } from 'jest';

const config: Config = {
  displayName: 'api-gateway',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  verbose: true,
  // Unit run matches only `*.spec.ts`; `*.e2e-spec.ts` belongs to jest.e2e.config.ts.
  testPathIgnorePatterns: ['/node_modules/', '\\.e2e-spec\\.ts$'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api-gateway',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
