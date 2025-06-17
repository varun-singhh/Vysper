const logger = require('../core/logger').createServiceLogger('SESSION');
const config = require('../core/config');

class SessionManager {
  constructor() {
    this.sessionMemory = [];
    this.compressionEnabled = true;
    this.maxSize = config.get('session.maxMemorySize');
    this.compressionThreshold = config.get('session.compressionThreshold');
  }

  addEvent(action, details = {}) {
    const event = this.createEvent(action, details);
    this.sessionMemory.push(event);
    
    logger.debug('Session event added', {
      action,
      eventId: event.id,
      totalEvents: this.sessionMemory.length
    });

    this.performMaintenanceIfNeeded();
    return event.id;
  }

  createEvent(action, details) {
    return {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      action,
      category: this.categorizeAction(action),
      primaryContent: this.extractPrimaryContent(action, details),
      metadata: this.extractMetadata(action, details),
      contextSummary: this.generateContextSummary(action, details)
    };
  }

  generateEventId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  categorizeAction(action) {
    const actionLower = action.toLowerCase();
    
    if (actionLower.includes('screenshot') || actionLower.includes('ocr')) {
      return 'capture';
    }
    if (actionLower.includes('speech') || actionLower.includes('transcription')) {
      return 'speech';
    }
    if (actionLower.includes('llm') || actionLower.includes('gemini')) {
      return 'llm';
    }
    if (actionLower.includes('skill') || actionLower.includes('switch')) {
      return 'navigation';
    }
    
    return 'system';
  }

  extractPrimaryContent(action, details) {
    if (details.text && typeof details.text === 'string') {
      return details.text.substring(0, 200);
    }
    if (details.response && typeof details.response === 'string') {
      return details.response.substring(0, 200);
    }
    if (details.preview && typeof details.preview === 'string') {
      return details.preview;
    }
    
    return null;
  }

  extractMetadata(action, details) {
    const metadata = {};
    
    const metadataFields = ['skill', 'duration', 'size', 'textLength', 'processingTime'];
    metadataFields.forEach(field => {
      if (details[field] !== undefined) {
        metadata[field] = details[field];
      }
    });
    
    return Object.keys(metadata).length > 0 ? metadata : null;
  }

  generateContextSummary(action, details) {
    const category = this.categorizeAction(action);
    
    switch (category) {
      case 'capture':
        return `Screen capture with ${details.textLength || 0} characters extracted`;
      case 'speech':
        return `Speech recognition: ${details.text ? 'successful' : 'failed'}`;
      case 'llm':
        return `AI analysis using ${details.skill || 'default'} skill`;
      case 'navigation':
        return `Switched to ${details.skill || details.window || 'unknown'} context`;
      default:
        return action;
    }
  }

  performMaintenanceIfNeeded() {
    if (this.sessionMemory.length > this.maxSize) {
      this.performMaintenance();
    } else if (this.compressionEnabled && this.sessionMemory.length > this.compressionThreshold) {
      this.compressOldEvents();
    }
  }

  performMaintenance() {
    const beforeCount = this.sessionMemory.length;
    
    this.removeOldSystemEvents();
    this.consolidateSimilarEvents();
    
    const afterCount = this.sessionMemory.length;
    
    logger.info('Session memory maintenance completed', {
      beforeCount,
      afterCount,
      eventsRemoved: beforeCount - afterCount
    });
  }

  removeOldSystemEvents() {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    
    this.sessionMemory = this.sessionMemory.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      const shouldKeep = event.category !== 'system' || eventTime > cutoffTime;
      return shouldKeep;
    });
  }

  consolidateSimilarEvents() {
    const groups = this.groupSimilarEvents();
    const consolidated = [];
    
    for (const group of groups) {
      if (group.length === 1) {
        consolidated.push(group[0]);
      } else {
        consolidated.push(this.createConsolidatedEvent(group));
      }
    }
    
    this.sessionMemory = consolidated;
  }

  groupSimilarEvents() {
    const groups = [];
    const processed = new Set();
    
    for (let i = 0; i < this.sessionMemory.length; i++) {
      if (processed.has(i)) continue;
      
      const group = [this.sessionMemory[i]];
      processed.add(i);
      
      for (let j = i + 1; j < this.sessionMemory.length; j++) {
        if (processed.has(j)) continue;
        
        if (this.areEventsSimilar(this.sessionMemory[i], this.sessionMemory[j])) {
          group.push(this.sessionMemory[j]);
          processed.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  areEventsSimilar(event1, event2) {
    const timeDiff = Math.abs(
      new Date(event1.timestamp).getTime() - new Date(event2.timestamp).getTime()
    );
    
    return event1.category === event2.category && 
           event1.action === event2.action && 
           timeDiff < 60000; // Within 1 minute
  }

  createConsolidatedEvent(events) {
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    return {
      ...firstEvent,
      id: this.generateEventId(),
      timestamp: lastEvent.timestamp,
      contextSummary: `${firstEvent.contextSummary} (${events.length} similar events)`,
      metadata: {
        ...firstEvent.metadata,
        consolidatedCount: events.length,
        timeSpan: {
          start: firstEvent.timestamp,
          end: lastEvent.timestamp
        }
      }
    };
  }

  compressOldEvents() {
    const cutoffTime = Date.now() - (2 * 60 * 60 * 1000); // 2 hours
    
    this.sessionMemory = this.sessionMemory.map(event => {
      const eventTime = new Date(event.timestamp).getTime();
      
      if (eventTime < cutoffTime && event.primaryContent && event.primaryContent.length > 100) {
        return {
          ...event,
          primaryContent: event.primaryContent.substring(0, 100) + '...[compressed]',
          compressed: true
        };
      }
      
      return event;
    });
  }

  getOptimizedHistory() {
    const recent = this.getRecentEvents(10);
    const important = this.getImportantEvents(5);
    const summary = this.generateSessionSummary();
    
    return {
      recent,
      important,
      summary,
      totalEvents: this.sessionMemory.length
    };
  }

  getRecentEvents(count = 10) {
    return this.sessionMemory
      .slice(-count)
      .map(event => ({
        timestamp: event.timestamp,
        action: event.action,
        category: event.category,
        summary: event.contextSummary,
        metadata: event.metadata
      }));
  }

  getImportantEvents(count = 5) {
    return this.sessionMemory
      .filter(event => ['capture', 'llm'].includes(event.category))
      .slice(-count)
      .map(event => ({
        timestamp: event.timestamp,
        category: event.category,
        summary: event.contextSummary,
        content: event.primaryContent?.substring(0, 150) || null
      }));
  }

  generateSessionSummary() {
    const categoryStats = this.getCategoryStatistics();
    const timeSpan = this.getSessionTimeSpan();
    const primaryActivities = this.getPrimaryActivities();
    
    return {
      duration: timeSpan,
      activities: categoryStats,
      focus: primaryActivities,
      eventCount: this.sessionMemory.length
    };
  }

  getCategoryStatistics() {
    const stats = {};
    
    this.sessionMemory.forEach(event => {
      stats[event.category] = (stats[event.category] || 0) + 1;
    });
    
    return stats;
  }

  getSessionTimeSpan() {
    if (this.sessionMemory.length === 0) return null;
    
    const timestamps = this.sessionMemory.map(e => new Date(e.timestamp).getTime());
    const start = Math.min(...timestamps);
    const end = Math.max(...timestamps);
    
    return {
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      durationMs: end - start
    };
  }

  getPrimaryActivities() {
    const activities = {};
    
    this.sessionMemory.forEach(event => {
      if (event.metadata?.skill) {
        activities[event.metadata.skill] = (activities[event.metadata.skill] || 0) + 1;
      }
    });
    
    return Object.entries(activities)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([skill, count]) => ({ skill, count }));
  }

  clear() {
    const eventCount = this.sessionMemory.length;
    this.sessionMemory = [];
    
    logger.info('Session memory cleared', { eventCount });
  }

  getMemoryUsage() {
    const totalSize = JSON.stringify(this.sessionMemory).length;
    
    return {
      eventCount: this.sessionMemory.length,
      approximateSize: `${(totalSize / 1024).toFixed(2)} KB`,
      utilizationPercent: Math.round((this.sessionMemory.length / this.maxSize) * 100)
    };
  }
}

module.exports = new SessionManager(); 