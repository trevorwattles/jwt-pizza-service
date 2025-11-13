const config = require('./config.js');

class Logger {
  constructor() {
    this.logBuffer = [];
    this.bufferSize = 100;
    this.flushInterval = 5000; // 5 seconds
    
    // Start periodic flush
    if (config.logging && config.logging.url) {
      setInterval(() => this.flush(), this.flushInterval);
    }
  }

  // Sanitize sensitive data from logs
  sanitize(data) {
    if (!data) return data;
    
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Remove sensitive fields
    const sensitiveFields = ['password', 'token', 'auth', 'authorization', 'jwt', 'secret'];
    
    const recursiveSanitize = (obj) => {
      if (typeof obj !== 'object' || obj === null) return;
      
      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '***REDACTED***';
        } else if (typeof obj[key] === 'object') {
          recursiveSanitize(obj[key]);
        }
      }
    };
    
    recursiveSanitize(sanitized);
    return sanitized;
  }

  // Log any event
  log(level, type, message, details = {}) {
    const sanitizedDetails = this.sanitize(details);
    
    const logEntry = {
      level,
      type,
      message,
      ...sanitizedDetails,
      timestamp: new Date().toISOString(),
    };

    // Log to console for local development
    if (process.env.NODE_ENV !== 'production') {
      console.log(JSON.stringify(logEntry, null, 2));
    }

    // Add to buffer for Grafana
    this.logBuffer.push(logEntry);

    // Flush if buffer is full
    if (this.logBuffer.length >= this.bufferSize) {
      this.flush();
    }
  }

  // HTTP request logger middleware
  httpLogger = (req, res, next) => {
    const startTime = Date.now();
    
    // Capture the original json and send methods
    const originalJson = res.json;
    const originalSend = res.send;
    let responseBody;

    res.json = function (body) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    res.send = function (body) {
      if (!responseBody) {
        responseBody = body;
      }
      return originalSend.call(this, body);
    };

    // Log when response finishes
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      this.log('info', 'http', 'HTTP Request', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        hasAuth: !!req.headers.authorization,
        requestBody: req.body,
        responseBody: responseBody,
        ip: req.ip,
      });
    });

    next();
  };

  // Database query logger
  logDbQuery(query, params, duration, error = null) {
    this.log(
      error ? 'error' : 'info',
      'database',
      error ? 'Database query failed' : 'Database query',
      {
        query,
        params: this.sanitize(params),
        duration,
        error: error?.message,
      }
    );
  }

  // Factory request logger
  logFactoryRequest(requestBody, responseBody, statusCode, duration, error = null) {
    this.log(
      error ? 'error' : 'info',
      'factory',
      error ? 'Factory request failed' : 'Factory request',
      {
        requestBody: this.sanitize(requestBody),
        responseBody: this.sanitize(responseBody),
        statusCode,
        duration,
        error: error?.message,
      }
    );
  }

  // Unhandled exception logger
  logException(error, context = {}) {
    this.log('error', 'exception', 'Unhandled exception', {
      errorMessage: error.message,
      errorStack: error.stack,
      ...this.sanitize(context),
    });
  }

  // Flush logs to Grafana
  async flush() {
    if (this.logBuffer.length === 0) return;
    if (!config.logging || !config.logging.url) return;

    const logsToSend = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const streams = this.formatForLoki(logsToSend);
      await this.sendToGrafana(streams);
    } catch (error) {
      console.error('Failed to send logs to Grafana:', error.message);
      // Put logs back if send failed
      this.logBuffer.unshift(...logsToSend);
    }
  }

  // Format logs for Loki
  formatForLoki(logs) {
    const streamMap = {};

    logs.forEach((log) => {
      const labels = {
        level: log.level,
        type: log.type,
        source: config.logging.source || 'jwt-pizza-service',
      };

      const labelKey = JSON.stringify(labels);

      if (!streamMap[labelKey]) {
        streamMap[labelKey] = {
          stream: labels,
          values: [],
        };
      }

      const timestamp = new Date(log.timestamp).getTime() * 1000000; // Convert to nanoseconds
      streamMap[labelKey].values.push([timestamp.toString(), JSON.stringify(log)]);
    });

    return Object.values(streamMap);
  }

  // Send logs to Grafana
  async sendToGrafana(streams) {
    const body = JSON.stringify({ streams });

    const response = await fetch(config.logging.url, {
      method: 'POST',
      body: body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.logging.userId}:${config.logging.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Grafana responded with status ${response.status}`);
    }
  }
}

const logger = new Logger();

// Ensure logs are flushed on process exit
process.on('exit', () => {
  logger.flush();
});

process.on('SIGINT', () => {
  logger.flush();
  process.exit();
});

module.exports = logger;
