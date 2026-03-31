import { describe, it, expect } from 'vitest';
import { getAgentColor, formatBytes, truncate, slugify } from '../lib/utils';

describe('getAgentColor', () => {
  it('returns a valid HSL color string', () => {
    const color = getAgentColor('developer');
    expect(color).toMatch(/^hsl\(\d+, 50%, 68%\)$/);
  });

  it('returns consistent color for same name', () => {
    expect(getAgentColor('architect')).toBe(getAgentColor('architect'));
  });

  it('returns different colors for different names', () => {
    const names = ['developer', 'architect', 'critic', 'north-star', 'facilitator', 'designer'];
    const colors = names.map(getAgentColor);
    const unique = new Set(colors);
    // Most names should produce unique colors (some hash collisions are possible but rare)
    expect(unique.size).toBeGreaterThan(3);
  });

  it('handles empty string', () => {
    const color = getAgentColor('');
    expect(color).toMatch(/^hsl\(/);
  });

  it('hue is in 0-359 range', () => {
    const testNames = ['developer', 'project-manager', 'critic', 'north-star', 'a', 'z', '123'];
    for (const name of testNames) {
      const color = getAgentColor(name);
      const hue = parseInt(color.match(/hsl\((\d+),/)![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });
});

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1 KB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('truncate', () => {
  it('returns original string if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis when over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello w…');
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('uses unicode ellipsis not three dots', () => {
    const result = truncate('hello world', 8);
    expect(result.endsWith('\u2026')).toBe(true);
    expect(result.endsWith('...')).toBe(false);
  });

  it('handles limit of 1', () => {
    const result = truncate('hello', 1);
    // The ellipsis occupies the 1 slot, so we get just the ellipsis
    expect(result).toBe('\u2026');
    expect(result.length).toBe(1);
  });
});

describe('slugify', () => {
  it('lowercases input', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugify('my project name')).toBe('my-project-name');
  });

  it('removes special characters', () => {
    expect(slugify('auth: flow!')).toBe('auth-flow');
    expect(slugify('[OPEN] what is this?')).toBe('open-what-is-this');
  });

  it('collapses multiple separators', () => {
    expect(slugify('hello   world')).toBe('hello-world');
    expect(slugify('auth--flow')).toBe('auth-flow');
  });

  it('strips leading and trailing hyphens', () => {
    expect(slugify('-hello-world-')).toBe('hello-world');
    expect(slugify('!hello!')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('preserves numbers', () => {
    expect(slugify('v2 api design')).toBe('v2-api-design');
    expect(slugify('auth-flow-123')).toBe('auth-flow-123');
  });
});
