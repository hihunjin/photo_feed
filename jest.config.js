module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: [
    'backend/**/*.js',
    '!backend/index.js'
  ],
  testTimeout: 30000,
  maxWorkers: 1  // Run tests serially to avoid SQLite lock conflicts
};
