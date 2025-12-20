/**
 * Test setup file for Obzorarr
 *
 * This file is preloaded before all tests run.
 * Use it for global test configuration, mocks, and utilities.
 */

// Ensure tests run in a clean environment
process.env.NODE_ENV = 'test';

// Set a test database path to avoid conflicts with development database
process.env.DATABASE_PATH = ':memory:';
