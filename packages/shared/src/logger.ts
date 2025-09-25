/**
 * Configurable Logger System
 * 
 * Provides structured logging with different verbosity levels for debugging purposes.
 * Replaces verbose console.log statements throughout the codebase.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogContext {
  component?: string;
  requestId?: string;
  userId?: string;
  [key: string]: any;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
  error?: Error;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  enableTimestamp: boolean;
  enableContext: boolean;
  format: 'json' | 'text';
  destination: 'console' | 'file' | 'none';
}

/**
 * Default logger configuration
 */
const DEFAULT_CONFIG: LoggerConfig = {
  level: 'info',
  enableTimestamp: true,
  enableContext: true,
  format: 'text',
  destination: 'console'
};

/**
 * Log level hierarchy for filtering
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4
};

/**
 * ANSI color codes for console output
 */
const COLORS = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[35m', // Magenta
  trace: '\x1b[37m', // White
  reset: '\x1b[0m'
};

/**
 * Main Logger class
 */
export class Logger {
  private config: LoggerConfig;
  private context: LogContext;

  constructor(config: Partial<LoggerConfig> = {}, context: LogContext = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): Logger {
    return new Logger(this.config, { ...this.context, ...context });
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Check if a log level should be output
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.config.level];
  }

  /**
   * Format log entry for output
   */
  private formatEntry(entry: LogEntry): string {
    if (this.config.format === 'json') {
      return JSON.stringify(entry);
    }

    // Text format
    let output = '';
    
    // Add timestamp
    if (this.config.enableTimestamp) {
      output += `[${entry.timestamp}] `;
    }

    // Add level with color
    const color = COLORS[entry.level];
    const levelStr = entry.level.toUpperCase().padEnd(5);
    output += `${color}${levelStr}${COLORS.reset} `;

    // Add component context
    if (this.config.enableContext && entry.context?.component) {
      output += `[${entry.context.component}] `;
    }

    // Add message
    output += entry.message;

    // Add additional context
    if (this.config.enableContext && entry.context) {
      const contextKeys = Object.keys(entry.context).filter(k => k !== 'component');
      if (contextKeys.length > 0) {
        const contextStr = contextKeys
          .map(k => `${k}=${entry.context![k]}`)
          .join(' ');
        output += ` (${contextStr})`;
      }
    }

    // Add error details
    if (entry.error) {
      output += `\n  Error: ${entry.error.message}`;
      if (entry.error.stack && this.config.level === 'debug') {
        output += `\n  Stack: ${entry.error.stack}`;
      }
    }

    return output;
  }

  /**
   * Output log entry
   */
  private output(entry: LogEntry): void {
    if (this.config.destination === 'none') {
      return;
    }

    const formatted = this.formatEntry(entry);

    if (this.config.destination === 'console') {
      switch (entry.level) {
        case 'error':
          console.error(formatted);
          break;
        case 'warn':
          console.warn(formatted);
          break;
        default:
          console.log(formatted);
          break;
      }
    }
    // File destination could be implemented here
  }

  /**
   * Create and output log entry
   */
  private log(level: LogLevel, message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...context },
      error
    };

    this.output(entry);
  }

  /**
   * Log error message
   */
  error(message: string, context?: LogContext, error?: Error): void {
    this.log('error', message, context, error);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log info message
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log debug message
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Log trace message
   */
  trace(message: string, context?: LogContext): void {
    this.log('trace', message, context);
  }

  /**
   * Log HTTP request
   */
  request(method: string, url: string, status?: number, latency?: number): void {
    const context: LogContext = { method, url };
    if (status) context.status = status;
    if (latency) context.latency = `${latency}ms`;
    
    const level = status && status >= 400 ? 'warn' : 'info';
    this.log(level, `HTTP ${method} ${url}`, context);
  }

  /**
   * Log crypto operation
   */
  crypto(operation: string, success: boolean, details?: LogContext): void {
    const level = success ? 'debug' : 'error';
    const message = `Crypto operation: ${operation} ${success ? 'succeeded' : 'failed'}`;
    this.log(level, message, details);
  }

  /**
   * Log performance metric
   */
  performance(operation: string, duration: number, details?: LogContext): void {
    const context = { operation, duration: `${duration}ms`, ...details };
    this.log('debug', `Performance: ${operation}`, context);
  }
}

/**
 * Detect if we're in a test environment
 */
function isTestEnvironment(): boolean {
  return !!(
    process.env.NODE_ENV === 'test' || 
    process.env.VITEST === 'true' || 
    process.env.JEST_WORKER_ID !== undefined ||
    process.env.BUN_TEST === 'true' ||
    // Check if we're running via bun test
    process.argv.some(arg => arg.includes('bun') && process.argv.includes('test'))
  );
}

/**
 * Create logger from environment variables
 */
export function createLoggerFromEnv(component?: string): Logger {
  const isTestEnv = isTestEnvironment();
  
  let level: LogLevel;
  let destination: 'console' | 'file' | 'none' = 'console';
  let enableTimestamp = true;
  let enableContext = true;
  
  if (isTestEnv) {
    // Test environment: use TEST_LOG_LEVEL
    const testLogLevel = process.env.TEST_LOG_LEVEL?.toLowerCase();
    
    if (testLogLevel === 'silent' || testLogLevel === 'none') {
      // Completely silent - no output at all
      destination = 'none';
      level = 'error';
    } else if (testLogLevel && ['error', 'warn', 'info', 'debug', 'trace'].includes(testLogLevel)) {
      level = testLogLevel as LogLevel;
      enableTimestamp = false; // Cleaner test output
      enableContext = process.env.TEST_LOG_CONTEXT === 'true'; // Off by default for tests
    } else {
      // Default for tests: only errors
      level = 'error';
      enableTimestamp = false;
      enableContext = false;
    }
  } else {
    // Production environment: use LOG_LEVEL
    level = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
    enableTimestamp = process.env.LOG_TIMESTAMP !== 'false';
    enableContext = process.env.LOG_CONTEXT !== 'false';
  }
  
  const format = (process.env.LOG_FORMAT || 'text') as 'json' | 'text';

  const config: LoggerConfig = {
    level,
    format,
    enableTimestamp,
    enableContext,
    destination
  };

  const context: LogContext = component ? { component } : {};
  
  return new Logger(config, context);
}

/**
 * Default logger instance
 */
export const logger = createLoggerFromEnv();

/**
 * Create component-specific logger
 */
export function createLogger(component: string, config?: Partial<LoggerConfig>): Logger {
  const baseLogger = createLoggerFromEnv(component);
  if (config) {
    baseLogger.configure(config);
  }
  return baseLogger;
}

/**
 * Create a silent logger for tests
 */
export function createTestLogger(component?: string): Logger {
  return new Logger({
    level: 'error',
    format: 'text',
    enableTimestamp: false,
    enableContext: false,
    destination: 'none'
  }, component ? { component } : {});
}
