# Theme (live site)

**Live triad: Blueprint technical.**

Accent and surfaces are CSS variables in `styles.css` (`:root` + `html[data-theme="dark"]`). The accent token is still named `--copper` / `--copper-deep` but resolves to blueprint blue (`#2f5f8a` / `#1e4566` light; ice `#6a9cc4` / `#8ab4d4` dark).

| Variable | Role |
|---|---|
| `--paper`, `--ink`, `--muted`, `--line` | Surfaces + text |
| `--copper`, `--copper-deep` | Accent (CTAs, links, keystone) |
| `--ground-*` | Section grounds |
| `--display`, `--sans`, `--mono` | Type |
| `--radius-control` | Squared controls (`2px`) |
| `--panel-dark`, `--on-dark` | Fixed dark chrome (footers, article nav) — do not flip with theme |

Hero: brand-first name as `h1`, work-artifact diagram (`assets/mock/hero-architecture.svg` + `-dark.svg`), no orbit clutter.

**To switch themes** (Ink / Concrete / Minimal or a new triad): follow the Project Context playbook  
`docs/theme-switch-playbook.md`  
(absolute path on agent hosts: `/cursor/stores/self/docs/theme-switch-playbook.md`).

Alternate triad mocks: `mock-ink-signal.html`, `mock-concrete.html`, `mock-minimal.html`, `mock-compare.html`.
