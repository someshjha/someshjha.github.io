# Brand mark: Structural Clarity

The site's mark — the arch used in the header roundel, the favicon, and
`assets/brand/logo-mark.png` — is built on a design philosophy called
**Structural Clarity**. This file records that philosophy and the practical
details of how the mark is constructed, so future changes stay consistent
with it rather than drifting into arbitrary decoration.

## The philosophy

Structural Clarity holds that authority is drawn, not declared. It borrows
its grammar from the architect's hand — the elevation drawing, the drafting
table, the title block in the corner of a blueprint — where every line
exists because it was decided upon, and every decision is visible as a
line. Nothing is illustrated for effect. What appears on the page is
load-bearing. This is a philosophy for marks that must be trusted at a
glance: it communicates competence not through ornament but through the
evident precision of its own construction.

Space is structural, never decorative. Forms read as elevations — the plan
view of an idea rather than a picture of one. A single architectural
gesture, rendered as fine unbroken line, carries more authority than a page
of ornament ever could, because restraint is itself evidence of expertise.
Negative space is treated as load: the eye rests in it, and what surrounds
it is understood to be holding something up.

Color behaves like ink and graphite behave on a drafting sheet: overwhelmingly
absent, so that its rare appearance carries weight. A warm, aged paper ground
and a single deep ink line are the entire vocabulary; one measured accent —
the color of sealing wax, of a hand-stamped approval — is permitted exactly
once, at the single point in the composition where a decision is actually
being made.

Typography is a drafting instrument, not a headline. Letterforms are treated
the way an architect treats dimension text on a blueprint — small, evenly
tracked, subordinate to the drawing. Text is never explanatory. It is a
stamp, a signature, a scale bar — never a paragraph.

Composition follows the logic of a technical drawing: a fixed baseline, an
implied grid, generous margins that function as the blank border of a
drafting sheet rather than empty space to be filled. Hierarchy is
established through line weight alone: the heaviest line is the one doing
the most structural work, and everything else recedes in careful,
deliberate steps from there.

Above all, this is a philosophy of master-level execution. Every arc true,
every tick mark evenly spaced, every margin measured rather than guessed.
Nothing is added that cannot justify its own weight. The result should feel
less designed than *engineered* — a mark that could be filed, stamped, and
trusted, because it was clearly drawn by a hand that understood exactly what
it was building before it drew the first line.

## What the mark actually is

A Roman arch, drawn in elevation: two piers rising to a semicircular band
divided into voussoirs (the wedge-shaped stones of a real arch), capped by
a keystone. The keystone is the one point of color in the mark — the
moment the structure makes its decision — echoing "Architecture is useful
only when teams can deliver it," the line the homepage opens with.

The full lockup (`assets/brand/logo-mark.png`) sets this inside a drafting-
sheet frame with corner crop-marks, a ground line with architect's-scale
tick marks, and a quiet title block in the corner reading `NO. 001` /
`SCALE 1:1` / `EST. 2013` — a small nod to the 13+ years referenced
throughout the site's copy — plus a `REV. A` revision mark opposite it.

## Where it lives

- **Header roundel** (`.brand-mark` in every page): an inline SVG, simplified
  to piers + arch band + copper keystone circle, no voussoir ticks or frame
  (too fine to read at 34px). Uses `fill="currentColor"` for the ink shapes
  so it follows `--panel-dark` automatically in both themes, and
  `style="fill:var(--copper)"` for the keystone punch-through.
- **Favicon / apple-touch-icon** (`assets/brand/favicon-{16,32,48,180,512}.png`,
  `assets/brand/apple-touch-icon.png`): the same simplified arch, rendered at
  each size from `assets/brand/` and linked from every page's `<head>`.
- **Full lockup** (`assets/brand/logo-mark.png`): the complete drafting-sheet
  composition with wordmark, tagline, and title block — for anywhere the
  mark needs to stand alone (press/profile use, not currently placed on the
  site itself).

## Palette

Reuses the site's Blueprint technical tokens (`styles.css`) rather than
introducing a separate mark palette:

| Role | Variable | Value |
|---|---|---|
| Ink (arch, piers, ground line) | `--panel-dark` / `--ink` | `#142433` / `#1a2a3a` |
| Paper ground | `--paper` | `#e8eef4` |
| Keystone / accent | `--copper` | `#2f5f8a` |
| Muted title-block text | `--muted` | `#5a6f84` region |

Typography: IBM Plex Sans (display) · Source Sans 3 (body) · IBM Plex Mono (labels).

For swapping the live site to another design triad (or extending tokens), see
`THEME.md` and the Project playbook `docs/theme-switch-playbook.md`
(`/cursor/stores/self/docs/theme-switch-playbook.md` in agent environments).

## Extending it

Any new mark, icon, or diagram added to the site should ask the same
question this one was built to answer: does this line exist because a
decision was made, or is it here to fill space? If it's the latter, per the
philosophy above, it doesn't belong.
