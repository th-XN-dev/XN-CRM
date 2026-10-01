// Must run before AppModule is imported: ConfigModule picks `.env.test` when NODE_ENV=test.
process.env.NODE_ENV = 'test';
