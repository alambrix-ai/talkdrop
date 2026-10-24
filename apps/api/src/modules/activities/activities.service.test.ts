import { describe, expect, it } from 'vitest';
import { ActivitiesService } from './activities.service.js';

describe('ActivitiesService', () => {
  const svc = new ActivitiesService();

  it('starts would-you-rather', () => {
    const round = svc.startWouldYouRather(0);
    expect(round.activity).toBe('would-you-rather');
    expect(round.options).toHaveLength(2);
  });

  it('starts co-draw canvas and co-watch player sessions', () => {
    const draw = svc.startCoDraw(1);
    const watch = svc.startCoWatch(2);
    expect(draw.activity).toBe('co-draw');
    expect(draw.stub).toBe(false);
    expect(draw.canvas.width).toBe(640);
    expect(watch.activity).toBe('co-watch');
    expect(watch.stub).toBe(false);
    expect(watch.catalog.length).toBeGreaterThan(0);
    expect(watch.state.url).toContain('http');
  });

  it('scores trivia', () => {
    const round = svc.startTrivia(0);
    const result = svc.scoreTrivia(round.roundId, round._answer);
    expect(result.correct).toBe(true);
  });
});
