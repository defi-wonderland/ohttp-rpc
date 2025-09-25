/**
 * Test logger utility that controls log output based on verbosity level
 * Now uses the new structured logger system but respects TEST_LOG_LEVEL
 * 
 * By default, tests run completely silently (no output).
 * Use TEST_LOG_LEVEL environment variable to control output:
 * - TEST_LOG_LEVEL=silent or unset: No output (default)
 * - TEST_LOG_LEVEL=error: Only errors
 * - TEST_LOG_LEVEL=warn: Warnings and errors
 * - TEST_LOG_LEVEL=info: Info, warnings, and errors
 * - TEST_LOG_LEVEL=debug: All output including debug
 */

import { createLogger, type LogLevel } from "@ohttp/shared";

export class TestLogger {
  private static verbosityLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug' = 'silent';
  private static structuredLogger = createLogger('test');

  static {
    // Initialize verbosity from environment variable - default to silent
    const verbosity = process.env.TEST_LOG_LEVEL?.toLowerCase() || 'silent';
    
    if (['silent', 'error', 'warn', 'info', 'debug'].includes(verbosity)) {
      TestLogger.verbosityLevel = verbosity as typeof TestLogger.verbosityLevel;
    }
    
    // Configure the structured logger based on test verbosity
    let logLevel: LogLevel = 'error';
    let destination: 'console' | 'none' = 'none'; // Silent by default
    
    switch (verbosity) {
      case 'silent':
        destination = 'none';
        logLevel = 'error';
        break;
      case 'error':
        destination = 'console';
        logLevel = 'error';
        break;
      case 'warn':
        destination = 'console';
        logLevel = 'warn';
        break;
      case 'info':
        destination = 'console';
        logLevel = 'info';
        break;
      case 'debug':
        destination = 'console';
        logLevel = 'debug';
        break;
    }
    
    TestLogger.structuredLogger.configure({
      level: logLevel,
      destination,
      enableTimestamp: false,
      enableContext: verbosity === 'debug',
      format: 'text'
    });
  }

  static log(...args: any[]) {
    if (TestLogger.verbosityLevel === 'silent') return;
    TestLogger.structuredLogger.info(args.join(' '));
  }

  static debug(...args: any[]) {
    if (!['debug'].includes(TestLogger.verbosityLevel)) return;
    TestLogger.structuredLogger.debug(args.join(' '));
  }

  static info(...args: any[]) {
    if (!['info', 'debug'].includes(TestLogger.verbosityLevel)) return;
    TestLogger.structuredLogger.info(args.join(' '));
  }

  static warn(...args: any[]) {
    if (!['warn', 'info', 'debug'].includes(TestLogger.verbosityLevel)) return;
    TestLogger.structuredLogger.warn(args.join(' '));
  }

  static error(...args: any[]) {
    if (TestLogger.verbosityLevel === 'silent') return;
    TestLogger.structuredLogger.error(args.join(' '));
  }

  /**
   * Get current verbosity level
   */
  static getVerbosity() {
    return TestLogger.verbosityLevel;
  }
}

// Export a default instance for convenience
export const logger = TestLogger;
