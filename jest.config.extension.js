module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/ext-src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node']
}
