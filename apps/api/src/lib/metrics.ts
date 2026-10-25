/**
 * Lightweight in-process metrics (Phase 6 observability basics).
 * Expose Prometheus text at GET /metrics. Swap for OTel exporter when OTEL_EXPORTER_OTLP_ENDPOINT is set.
 */

type Labels = Record<string, string>;

class Counter {
  private values = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  inc(labels: Labels = {}, by = 1) {
    const key = JSON.stringify(labels);
    this.values.set(key, (this.values.get(key) ?? 0) + by);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [key, value] of this.values) {
      const labels = JSON.parse(key) as Labels;
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${this.name}${labelStr ? `{${labelStr}}` : ''} ${value}`);
    }
    return lines.join('\n');
  }
}

class Histogram {
  private sums = new Map<string, number>();
  private counts = new Map<string, number>();
  constructor(public name: string, public help: string) {}
  observe(labels: Labels, ms: number) {
    const key = JSON.stringify(labels);
    this.sums.set(key, (this.sums.get(key) ?? 0) + ms);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }
  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} summary`];
    for (const [key, sum] of this.sums) {
      const labels = JSON.parse(key) as Labels;
      const count = this.counts.get(key) ?? 0;
      const labelStr = Object.entries(labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      const suffix = labelStr ? `{${labelStr}}` : '';
      lines.push(`${this.name}_sum${suffix} ${sum}`);
      lines.push(`${this.name}_count${suffix} ${count}`);
    }
    return lines.join('\n');
  }
}

export const metrics = {
  httpRequests: new Counter('talkdrop_http_requests_total', 'HTTP requests'),
  matches: new Counter('talkdrop_matches_total', 'Successful matches'),
  moderationCuts: new Counter('talkdrop_moderation_cuts_total', 'Moderation cuts'),
  matchLatency: new Histogram('talkdrop_match_latency_ms', 'Time in queue until match'),
  cutLatency: new Histogram('talkdrop_cut_latency_ms', 'Time from sample to cut'),
  callSetup: new Histogram('talkdrop_call_setup_ms', 'Match to session start'),
};

export function renderMetrics(): string {
  return [
    metrics.httpRequests.render(),
    metrics.matches.render(),
    metrics.moderationCuts.render(),
    metrics.matchLatency.render(),
    metrics.cutLatency.render(),
    metrics.callSetup.render(),
    '',
  ].join('\n');
}

/** Optional OTEL bootstrap — no-op unless endpoint configured. */
export async function initOtel(serviceName: string): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  console.info(`[otel] would export traces for ${serviceName} to ${endpoint} (scaffold)`);
}
