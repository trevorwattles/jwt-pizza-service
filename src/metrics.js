const config = require('./config.js');
const os = require('os');

class MetricsBuilder {
  constructor(source) {
    this.source = source;
    this.metrics = [];
  }

  addMetric(metricPrefix, value, metricType = 'counter') {
    const metric = `${metricPrefix},source=${this.source},type=${metricType} value=${value}`;
    this.metrics.push(metric);
  }

  toString() {
    return this.metrics.join('\n');
  }

  clear() {
    this.metrics = [];
  }
}

class Metrics {
  constructor() {
    this.totalRequests = 0;
    this.getRequests = 0;
    this.postRequests = 0;
    this.putRequests = 0;
    this.deleteRequests = 0;
    this.activeUsers = new Set();
    
    this.authAttempts = 0;
    this.authSuccesses = 0;
    this.authFailures = 0;
    
    this.pizzasSold = 0;
    this.pizzaCreationFails = 0;
    this.revenue = 0;
    
    this.serviceLatencies = [];
    this.pizzaLatencies = [];

    // Send metrics every 10 seconds
    this.sendMetricsPeriodically(10000);
  }

  incrementRequests(req) {
    this.totalRequests++;
    
    const method = req.method;
    if (method === 'GET') this.getRequests++;
    else if (method === 'POST') this.postRequests++;
    else if (method === 'PUT') this.putRequests++;
    else if (method === 'DELETE') this.deleteRequests++;
  }

  trackActiveUser(userId) {
    if (userId) {
      this.activeUsers.add(userId);
    }
  }

  trackAuthAttempt(success) {
    this.authAttempts++;
    if (success) {
      this.authSuccesses++;
    } else {
      this.authFailures++;
    }
  }

  trackPizzaPurchase(success, latency, pizzaCount, revenue) {
    if (success) {
      this.pizzasSold += pizzaCount;
      this.revenue += revenue;
    } else {
      this.pizzaCreationFails += pizzaCount;
    }
    
    if (latency) {
      this.pizzaLatencies.push(latency);
    }
  }

  trackServiceLatency(latency) {
    this.serviceLatencies.push(latency);
  }

  getCpuUsagePercentage() {
    const cpuUsage = os.loadavg()[0] / os.cpus().length;
    return (cpuUsage * 100).toFixed(2);
  }

  getMemoryUsagePercentage() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const memoryUsage = (usedMemory / totalMemory) * 100;
    return memoryUsage.toFixed(2);
  }

  requestTracker = (req, res, next) => {
    const startTime = Date.now();
    
    // Track the request
    this.incrementRequests(req);
    
    // Track active user if authenticated
    if (req.user && req.user.id) {
      this.trackActiveUser(req.user.id);
    }

    // Track auth attempts on auth endpoints
    const originalJson = res.json;
    res.json = (body) => {
      if (req.path.includes('/api/auth')) {
        if (req.method === 'POST' || req.method === 'PUT') {
          // Registration or login attempt
          const success = res.statusCode === 200;
          this.trackAuthAttempt(success);
        }
      }
      
      // Track latency
      const latency = Date.now() - startTime;
      this.trackServiceLatency(latency);
      
      return originalJson.call(res, body);
    };

    next();
  };

  async sendMetricsPeriodically(period) {
    setInterval(async () => {
      try {
        await this.sendMetricsToGrafana();
      } catch (error) {
        console.log('Error sending metrics to Grafana', error);
      }
    }, period);
  }

  async sendMetricsToGrafana() {
    // Only send if metrics are configured
    if (!config.metrics || !config.metrics.url || !config.metrics.apiKey) {
      return;
    }

    const builder = new MetricsBuilder(config.metrics.source);

    // HTTP request metrics
    builder.addMetric('http_requests_total', this.totalRequests);
    builder.addMetric('http_requests_get', this.getRequests);
    builder.addMetric('http_requests_post', this.postRequests);
    builder.addMetric('http_requests_put', this.putRequests);
    builder.addMetric('http_requests_delete', this.deleteRequests);

    // Active users
    builder.addMetric('active_users', this.activeUsers.size, 'gauge');

    // Auth metrics
    builder.addMetric('auth_attempts', this.authAttempts);
    builder.addMetric('auth_successes', this.authSuccesses);
    builder.addMetric('auth_failures', this.authFailures);

    // System metrics
    builder.addMetric('cpu_usage_percent', this.getCpuUsagePercentage(), 'gauge');
    builder.addMetric('memory_usage_percent', this.getMemoryUsagePercentage(), 'gauge');

    // Pizza metrics
    builder.addMetric('pizzas_sold', this.pizzasSold);
    builder.addMetric('pizza_creation_fails', this.pizzaCreationFails);
    builder.addMetric('revenue', this.revenue.toFixed(4));

    // Latency metrics (average)
    if (this.serviceLatencies.length > 0) {
      const avgServiceLatency = this.serviceLatencies.reduce((a, b) => a + b, 0) / this.serviceLatencies.length;
      builder.addMetric('service_latency_ms', avgServiceLatency.toFixed(2), 'gauge');
    }

    if (this.pizzaLatencies.length > 0) {
      const avgPizzaLatency = this.pizzaLatencies.reduce((a, b) => a + b, 0) / this.pizzaLatencies.length;
      builder.addMetric('pizza_creation_latency_ms', avgPizzaLatency.toFixed(2), 'gauge');
    }

    const metricsString = builder.toString();
    
    if (metricsString) {
      await this.sendToGrafana(metricsString);
    }

    // Reset latency arrays to prevent memory growth
    this.serviceLatencies = [];
    this.pizzaLatencies = [];
  }

  async sendToGrafana(metrics) {
    try {
      const response = await fetch(config.metrics.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          Authorization: `Bearer ${config.metrics.apiKey}`,
        },
        body: metrics,
      });

      if (!response.ok) {
        console.error('Failed to send metrics to Grafana:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error sending metrics to Grafana:', error.message);
    }
  }
}

const metrics = new Metrics();
module.exports = metrics;