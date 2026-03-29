import { describe, it, expect } from 'vitest';
import { fillTemplate, parseFrontmatter, serializeFrontmatter } from '../lib/agent-templates';

describe('fillTemplate', () => {
  it('replaces a single placeholder', () => {
    const result = fillTemplate('Hello {{NAME}}', { NAME: 'World' });
    expect(result).toBe('Hello World');
  });

  it('replaces all occurrences of the same placeholder', () => {
    const result = fillTemplate('{{A}} and {{A}}', { A: 'foo' });
    expect(result).toBe('foo and foo');
  });

  it('replaces multiple different placeholders', () => {
    const result = fillTemplate('{{X}} and {{Y}}', { X: 'alpha', Y: 'beta' });
    expect(result).toBe('alpha and beta');
  });

  it('leaves unresolved placeholders as fallback text', () => {
    const result = fillTemplate('Hello {{MISSING}}', {});
    expect(result).toBe('Hello [missing]');
  });

  it('handles multi-word placeholder keys with underscores', () => {
    const result = fillTemplate('Using {{PROJECT_NAME}} for {{PACKAGE_MANAGER}}', {
      PROJECT_NAME: 'my-app',
      PACKAGE_MANAGER: 'npm',
    });
    expect(result).toBe('Using my-app for npm');
  });

  it('handles empty values', () => {
    const result = fillTemplate('Name: {{NAME}}', { NAME: '' });
    expect(result).toBe('Name: ');
  });

  it('handles values containing special characters', () => {
    const result = fillTemplate('Stack: {{FRAMEWORK}}', {
      FRAMEWORK: 'Next.js, React, Tailwind',
    });
    expect(result).toBe('Stack: Next.js, React, Tailwind');
  });

  it('does not replace partial placeholder matches', () => {
    const template = '{{FOO}} vs {{FOOBAR}}';
    const result = fillTemplate(template, { FOO: 'a', FOOBAR: 'b' });
    expect(result).toBe('a vs b');
  });

  it('preserves surrounding content', () => {
    const template = `---
name: {{NAME}}
role: developer
---
# {{NAME}} Agent`;
    const result = fillTemplate(template, { NAME: 'Alice' });
    expect(result).toBe(`---
name: Alice
role: developer
---
# Alice Agent`);
  });
});

describe('parseFrontmatter', () => {
  it('parses simple key-value frontmatter', () => {
    const content = `---
name: Developer
role: developer
description: Writes code
---
# Body here`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter['name']).toBe('Developer');
    expect(frontmatter['role']).toBe('developer');
    expect(frontmatter['description']).toBe('Writes code');
    expect(body.trim()).toBe('# Body here');
  });

  it('returns empty frontmatter if no delimiter found', () => {
    const content = 'No frontmatter here';
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter).toEqual({});
    expect(body).toBe('No frontmatter here');
  });

  it('parses YAML list values', () => {
    const content = `---
name: Test
tools:
  - Read
  - Write
  - Grep
---
Body`;
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter['name']).toBe('Test');
    expect(frontmatter['tools']).toEqual(['Read', 'Write', 'Grep']);
  });

  it('handles boolean-like values as strings', () => {
    const content = `---
required: true
enabled: false
---
Body`;
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter['required']).toBe('true');
    expect(frontmatter['enabled']).toBe('false');
  });

  it('handles values with colons in them', () => {
    const content = `---
description: Builds things for us
---
Body`;
    const { frontmatter } = parseFrontmatter(content);
    expect(frontmatter['description']).toBe('Builds things for us');
  });

  it('preserves body content with multiple lines', () => {
    const content = `---
name: Agent
---
# Heading

Paragraph one.

Paragraph two.`;
    const { body } = parseFrontmatter(content);
    expect(body).toContain('# Heading');
    expect(body).toContain('Paragraph one.');
    expect(body).toContain('Paragraph two.');
  });

  it('handles frontmatter with only a required field', () => {
    const content = `---
required: true
---
Body here`;
    const { frontmatter, body } = parseFrontmatter(content);
    expect(frontmatter['required']).toBe('true');
    expect(body.trim()).toBe('Body here');
  });
});

describe('serializeFrontmatter', () => {
  it('serializes simple key-value pairs', () => {
    const result = serializeFrontmatter({ name: 'Developer', role: 'developer' });
    expect(result).toContain('name: Developer');
    expect(result).toContain('role: developer');
  });

  it('serializes arrays as YAML lists', () => {
    const result = serializeFrontmatter({ tools: ['Read', 'Write'] });
    expect(result).toContain('tools:');
    expect(result).toContain('  - Read');
    expect(result).toContain('  - Write');
  });

  it('quotes values containing special characters', () => {
    const result = serializeFrontmatter({ description: 'Chief: of Staff' });
    expect(result).toContain('"');
    expect(result).toContain('Chief: of Staff');
  });

  it('handles boolean values', () => {
    const result = serializeFrontmatter({ required: true });
    expect(result).toContain('required: true');
  });

  it('produces valid round-trip output', () => {
    const original = {
      name: 'Test Agent',
      role: 'tester',
      description: 'Runs tests',
    };
    const serialized = serializeFrontmatter(original);
    const wrapped = `---\n${serialized}\n---\nBody`;
    const { frontmatter } = parseFrontmatter(wrapped);
    expect(frontmatter['name']).toBe('Test Agent');
    expect(frontmatter['role']).toBe('tester');
    expect(frontmatter['description']).toBe('Runs tests');
  });

  it('handles empty object', () => {
    const result = serializeFrontmatter({});
    expect(result).toBe('');
  });
});

describe('template + frontmatter integration', () => {
  it('fills a realistic agent template', () => {
    const template = `---
name: Developer
role: developer
description: Core engineer for {{PROJECT_NAME}}
---
# Developer

You are the developer for {{PROJECT_NAME}}. Stack: {{FRAMEWORK}}.

Testing: {{TESTING_LIBS}}
`;
    const filled = fillTemplate(template, {
      PROJECT_NAME: 'my-app',
      FRAMEWORK: 'Next.js',
      TESTING_LIBS: 'Vitest',
    });

    const { frontmatter, body } = parseFrontmatter(filled);
    expect(frontmatter['description']).toBe('Core engineer for my-app');
    expect(body).toContain('You are the developer for my-app');
    expect(body).toContain('Stack: Next.js');
    expect(body).toContain('Testing: Vitest');
  });
});
