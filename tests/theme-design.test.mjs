import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = await readFile(new URL('../src/theme.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const theme = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('every theme produces finite, matching UI and canvas accents, including neutral dark backgrounds', () => {
  for (const [name, config] of Object.entries(theme.THEMES)) {
    const vars = theme.deriveThemeVars(config);
    assert.match(vars['--fg-accent'], /^#[0-9a-f]{6}$/i, name);
    assert.match(vars['--fg-accent-hover'], /^#[0-9a-f]{6}$/i, name);
    assert.equal(theme.getAccentColorsForTheme(name).accent, parseInt(vars['--fg-accent'].slice(1), 16), name);
    for (const token of ['--fg-text-muted', '--fg-text-dim']) {
      assert.ok(theme.wcagContrast(vars[token], config.uiPanelBackground) >= 4.5, `${name}: ${token}`);
      assert.ok(theme.wcagContrast(vars[token], vars['--fg-workspace-shelf']) >= 4.5, `${name}: shelf ${token}`);
      assert.ok(theme.wcagContrast(vars[token], config.canvasBackground) >= 4.5, `${name}: canvas ${token}`);
    }
  }
});

test('startup palette matches the default graph before JavaScript applies its saved theme', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const defaults = theme.deriveThemeVars(theme.getTheme(theme.DEFAULT_GRAPH_THEME));
  assert.deepEqual(theme.CSS_VAR_DEFAULTS, defaults);
  for (const token of ['--fg-canvas-bg', '--fg-surface', '--fg-workspace-shelf', '--fg-input-bg', '--fg-button-bg',
    '--fg-text', '--fg-text-muted', '--fg-text-dim', '--fg-border', '--fg-accent', '--fg-color-scheme']) {
    assert.equal(html.match(new RegExp(`${token}:\\s*([^;]+);`))?.[1], defaults[token], token);
  }
});

test('the warm paper canvas keeps the Claude heading marks distinct against the paper', () => {
  const config = theme.getTheme('paper-light');
  const vars = theme.deriveThemeVars(config);
  assert.equal(vars['--fg-canvas-bg'], '#f6f0e1');
  assert.equal(vars['--fg-workspace-shelf'], '#f1ebda');
  assert.equal(vars['--fg-text'], '#251e11');
  for (const fill of config.headingColors) assert.ok(theme.wcagContrast(fill, config.canvasBackground) >= 3, fill);
});

test('Claude dark follows the Obsidian base, shelf, ink and heading colors', () => {
  const config = theme.getTheme('claude-dark');
  const vars = theme.deriveThemeVars(config);
  assert.equal(vars['--fg-color-scheme'], 'dark');
  assert.equal(vars['--fg-canvas-bg'], '#201d17');
  assert.equal(vars['--fg-surface'], '#252119');
  assert.equal(vars['--fg-workspace-shelf'], '#1d1a15');
  assert.equal(vars['--fg-text'], '#ede6d6');
  assert.deepEqual(config.headingColors, ['#d07b52', '#a85f3d', '#d3a34c', '#84b383', '#7dd3c7', '#c08ba0']);
  for (const fill of config.headingColors) assert.ok(theme.wcagContrast(fill, config.canvasBackground) >= 3, fill);
});

test('designed themes retain readable labels and primary actions in warm, dark, and light spaces', () => {
  assert.equal(theme.DEFAULT_GRAPH_THEME, 'paper-light');
  for (const name of ['paper-light', 'claude-dark', 'constellation-dark', 'constellation-light']) {
    const config = theme.getTheme(name);
    const vars = theme.deriveThemeVars(config);
    assert.ok(theme.wcagContrast(config.labelColor, config.canvasBackground) >= 7, `${name}: canvas labels`);
    assert.ok(theme.wcagContrast(vars['--fg-accent-text'], vars['--fg-accent']) >= 4.5, `${name}: action`);
    assert.ok(theme.wcagContrast(vars['--fg-text'], config.uiInputBackground) >= 4.5, `${name}: input`);
    assert.notEqual(theme.getThemeLabel(name), name);
  }
});

test('frosted floating surfaces keep readable text over each theme’s paper', async () => {
  const css = await readFile(new URL('../src/workspace-ui.css', import.meta.url), 'utf8');
  const surfaceMix = name => {
    const value = css.match(new RegExp(`${name}: color-mix\\(in srgb, var\\(--fg-surface\\) (\\d+)%, var\\(--fg-surface-glass\\)\\);`));
    assert.ok(value, name);
    return Number(value[1]) / 100;
  };
  const mix = [surfaceMix('--ns-panel'), surfaceMix('--ns-frosted-panel')];
  const composite = (front, back, opacity) => '#' + [1, 3, 5].map(start => {
    const a = parseInt(front.slice(start, start + 2), 16);
    const b = parseInt(back.slice(start, start + 2), 16);
    return Math.round(a * opacity + b * (1 - opacity)).toString(16).padStart(2, '0');
  }).join('');

  for (const [name, config] of Object.entries(theme.THEMES)) {
    const vars = theme.deriveThemeVars(config);
    const glassOpacity = Number(vars['--fg-surface-glass'].match(/,([^,]+)\)$/)[1]);
    const [toolbar, popover] = mix.map(value => value + (1 - value) * glassOpacity);
    assert.ok(0.65 <= toolbar && toolbar < popover && popover < 0.9, name);
    for (const backdrop of [vars['--fg-canvas-bg'], vars['--fg-workspace-shelf']]) {
      const textFloor = Math.min(
        4.5,
        theme.wcagContrast(vars['--fg-text'], vars['--fg-surface']),
        theme.wcagContrast(vars['--fg-text'], backdrop),
      );
      for (const opacity of [toolbar, popover]) {
        const background = composite(vars['--fg-surface'], backdrop, opacity);
        assert.ok(theme.wcagContrast(vars['--fg-text'], background) >= textFloor, `${name}: text`);
        assert.ok(theme.wcagContrast(vars['--fg-text-muted'], background) >= 4.5, `${name}: muted text`);
      }
    }
  }
});
