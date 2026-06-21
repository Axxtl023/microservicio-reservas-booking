import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  private readonly processedEvents = new Map<string, number>();
  private readonly failedEvents = new Map<string, number>();
  private readonly publishedEvents = new Map<string, number>();
  private readonly sagaStarted = new Map<string, number>();
  private readonly sagaCompleted = new Map<string, number>();
  private readonly sagaFailed = new Map<string, number>();

  incrementProcessed(eventType: string): void {
    this.processedEvents.set(eventType, (this.processedEvents.get(eventType) || 0) + 1);
  }

  incrementFailed(eventType: string): void {
    this.failedEvents.set(eventType, (this.failedEvents.get(eventType) || 0) + 1);
  }

  incrementPublished(eventType: string): void {
    this.publishedEvents.set(eventType, (this.publishedEvents.get(eventType) || 0) + 1);
  }

  incrementSagaStarted(sagaType: string): void {
    this.sagaStarted.set(sagaType, (this.sagaStarted.get(sagaType) || 0) + 1);
  }

  incrementSagaCompleted(sagaType: string): void {
    this.sagaCompleted.set(sagaType, (this.sagaCompleted.get(sagaType) || 0) + 1);
  }

  incrementSagaFailed(sagaType: string): void {
    this.sagaFailed.set(sagaType, (this.sagaFailed.get(sagaType) || 0) + 1);
  }

  getMetricsText(): string {
    let text = '';

    text += '# HELP event_bus_processed_events_total Total events processed by consumers\n';
    text += '# TYPE event_bus_processed_events_total counter\n';
    text += this.renderCounter(this.processedEvents, 'event_bus_processed_events_total', 'event_type', 'success');

    text += '\n# HELP event_bus_failed_events_total Total failed event processing\n';
    text += '# TYPE event_bus_failed_events_total counter\n';
    text += this.renderCounter(this.failedEvents, 'event_bus_failed_events_total', 'event_type', 'error');

    text += '\n# HELP event_bus_published_events_total Total events published to RabbitMQ\n';
    text += '# TYPE event_bus_published_events_total counter\n';
    text += this.renderCounter(this.publishedEvents, 'event_bus_published_events_total', 'event_type');

    text += '\n# HELP saga_started_total Total sagas started\n';
    text += '# TYPE saga_started_total counter\n';
    text += this.renderCounter(this.sagaStarted, 'saga_started_total', 'saga_type');

    text += '\n# HELP saga_completed_total Total sagas completed successfully\n';
    text += '# TYPE saga_completed_total counter\n';
    text += this.renderCounter(this.sagaCompleted, 'saga_completed_total', 'saga_type');

    text += '\n# HELP saga_failed_total Total sagas that ended in FAILED\n';
    text += '# TYPE saga_failed_total counter\n';
    text += this.renderCounter(this.sagaFailed, 'saga_failed_total', 'saga_type');

    return text;
  }

  private renderCounter(
    map: Map<string, number>,
    metricName: string,
    labelKey: string,
    extraStatus?: string,
  ): string {
    if (map.size === 0) {
      const status = extraStatus ? `,status="${extraStatus}"` : '';
      return `${metricName}{${labelKey}="none"${status}} 0\n`;
    }
    let out = '';
    for (const [key, count] of map.entries()) {
      const status = extraStatus ? `,status="${extraStatus}"` : '';
      out += `${metricName}{${labelKey}="${key}"${status}} ${count}\n`;
    }
    return out;
  }
}
