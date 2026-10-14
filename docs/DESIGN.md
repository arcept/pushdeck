---
name: Push Deck
description: A dark control-room UI around a Push 2 replica, plus a pure-black 960x160 display system, both coloured by the active profile.
colors:
  workspace: "#0d0d10"
  module: "#141418"
  raised: "#1c1c22"
  raised-high: "#25252d"
  hairline: "rgba(255,255,255,.07)"
  hairline-strong: "rgba(255,255,255,.13)"
  text: "#eeeef3"
  text-2: "#b3b3c0"
  text-3: "#8a8a97"
  accent: "#d97757"
  on-accent: "#17110f"
  good: "#3cdc78"
  warn: "#ffbe32"
  bad: "#ff5a5a"
  display-bg: "#000000"
  display-ink: "#ffffff"
  display-ink-2: "#b4b4c0"
  display-ink-3: "#9a9aa8"
  display-ink-4: "#3a3a44"
  display-track: "#1c1c24"
  display-hairline: "#24242c"
  display-on-accent: "#100e12"
  display-good: "#3cdc78"
  display-warn: "#ffbe32"
  display-bad: "#ff5050"
  display-info: "#5aa0ff"
typography:
  ui-body:
    fontFamily: "Quicksand, Helvetica Neue, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.45
  ui-heading:
    fontFamily: "Quicksand, Helvetica Neue, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  ui-control:
    fontFamily: "Quicksand, Helvetica Neue, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
  data:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
  legend:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.09em"
  display-title:
    fontFamily: "Quicksand"
    fontSize: "38px"
    fontWeight: 700
  display-value:
    fontFamily: "Quicksand"
    fontSize: "26px"
    fontWeight: 700
  display-caption:
    fontFamily: "IBM Plex Mono"
    fontSize: "13px"
    fontWeight: 400
rounded:
  chip: "6px"
  control: "8px"
  control-sm: "7px"
  panel: "12px"
  dialog: "14px"
  pill: "999px"
  display-zone: "5px"
  display-bar: "3px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  xl: "22px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    typography: "{typography.ui-control}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 14px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.control}"
    height: "34px"
  button-danger-armed:
    backgroundColor: "{colors.bad}"
    textColor: "#190808"
  segmented:
    backgroundColor: "{colors.workspace}"
    rounded: "9px"
  field:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 10px"
  chip-badge:
    backgroundColor: "{colors.raised-high}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.chip}"
    height: "22px"
  popover:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.panel}"
  palette:
    backgroundColor: "{colors.raised}"
    rounded: "{rounded.dialog}"
  sheet:
    backgroundColor: "{colors.module}"
    width: "760px"
  toast:
    backgroundColor: "{colors.raised-high}"
    rounded: "10px"
  display-zone-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.display-on-accent}"
    rounded: "{rounded.display-zone}"
    width: "105px"
    height: "34px"
  display-chip:
    backgroundColor: "{colors.display-track}"
    textColor: "{colors.display-ink-2}"
    rounded: "{rounded.chip}"
---

# Design System: Push Deck

## Overview

**Creative North Star: "The Control Room"**

The browser UI is a control room built around one object: the Push 2 replica sits centred at maximum size and every panel is a rack module that serves it. The chrome is flat graphite with hairline dividers, and the single accent is the active profile's LED colour, so the screen, the replica and the hardware read as one instrument. The Push's own 960x160 display follows the same logic in a harsher register: pure black, a strict 8-column grid, and the same accent.

Density is that of an operate-mode studio tool: 34px controls, 14px body, small mono legends for data. Rare things (tests, calibration, power, knob mapping) are tucked behind a sheet or the command palette rather than laid out on the page. The accent is rare on purpose: selection, the primary action and live state only.

**Key Characteristics:**
- Three graphite steps (workspace, module, raised) separated by hairlines, no nested cards.
- Accent is runtime-driven by the active profile (`--accent`, animated 0.5s), with a paired `--on-accent` for text on it.
- Quicksand for words, IBM Plex Mono for ids, values and engraved micro-legends.
- One drawn icon family: 24px grid, 1.75 stroke, round caps (`ui/src/icons.tsx`). Text glyphs are never icons.
- Display: pure black ground, 8 x 120px columns aligned over the encoders, 105x34 label zones, an 80px body.

## Colors

A graphite, blue-leaning neutral ladder with one borrowed accent and three status hues.

### Primary
- **Profile LED Accent** (`accent`, default #d97757): selection rings, primary buttons, switch-on track, focus ring, progress fills, active display zones. It is replaced at runtime by the active profile's colour; the default is the fallback only. Text on it uses `on-accent`.

### Neutral
- **Workspace** (#0d0d10): page ground, segmented-control well, sheet nav.
- **Module** (#141418): top bar, rail, inspector, sheet body.
- **Raised** (#1c1c22) and **Raised High** (#25252d): buttons, fields, popovers, palette; hover and pressed states step up one.
- **Hairlines** (7% and 13% white): every divider and control border. Depth comes from these, not from fills.
- **Text / Text 2 / Text 3** (#eeeef3 / #b3b3c0 / #8a8a97): primary, secondary, and tertiary/hints and legends.

### Status
- **Good** (#3cdc78), **Warn** (#ffbe32), **Bad** (#ff5a5a): chips, dots, toasts, banners and the armed destructive button. Mixed into surfaces with `color-mix` at 12-20%. State always pairs with an icon or label, never colour alone.

### Display palette
Pure black (#000000) ground; ink steps #ffffff / #b4b4c0 / #9a9aa8 / #3a3a44 (the last only for empty-zone dashes and the toast border); track #1c1c24; status good/warn/bad (#ff5050)/info (#5aa0ff). Source of truth is `daemon/push_daemon/display/tokens.py`; `ui/src/display/tokens.json` is generated from it.

### Named Rules
**The Profile Colour Rule.** The accent is the active profile's colour and nothing else; never introduce a second brand hue. It marks selection, the primary action and live state.
**The Black Ground Rule.** The Push display background is always #000000.
**The Not-Colour-Alone Rule.** Status colour is always backed by an icon, label or text.

## Typography

**UI Font:** Quicksand variable, 300-700 (fallback Helvetica Neue, system-ui)
**Data Font:** IBM Plex Mono 400/700 (fallback ui-monospace)

**Character:** Rounded, friendly Quicksand carries all language; Plex Mono carries anything that is a value, id or key, like the hardware's printed legends. (PRODUCT.md notes the final display font is undecided; this pair is the shipped one.)

### Hierarchy
- **Heading** (700, 20px / 1.2): inspector and sheet titles. Panel heads 15-16px.
- **Body** (500, 14px / 1.45): default text. Hints and descriptions 12-13px in Text 3.
- **Control** (600, 13px; 12px small): buttons, fields, segmented, chips (chip badge 11px).
- **Data** (Plex Mono 400, 12px): ids, shortcuts, values; keycap tags 11px/600.
- **Section legend** (Plex Mono 700, 11px, 0.09em, uppercase, Text 3): the heading of a rail group, inspector section or settings group. It is the section's h3/label itself, not a line above another heading.
- **Display scale** (px on the 160px canvas): display 60, title 38, metric 34, value 26, label 15, note 14, caption 13. Zone labels autofit 15 down to 11 in bold Plex Mono, ALL CAPS by default.

### Named Rules
**The Mono Is Data Rule.** Plex Mono is for ids, values, keys and display captions; prose and headings stay Quicksand.

## Layout

The app is a three-column grid: 272px profile rail, fluid stage (max 1180px column, centred), 344px inspector, under a 56px-min top bar. Below 1180px it collapses to one column ordered stage, inspector, rail; below 760px labels and the ring legends hide. Spacing is on a loose 2/4/6/8/10/14/16/22px rhythm; field gap 6px, group padding 14-16px, settings padding 22x28px.

**Display grid.** The 960x160 canvas is 8 columns of 120px over the 8 encoders and 8+8 display buttons. The top and bottom 40px hold the 16 label zones (105x34, 2px margin from the edge, centred in the column); the 80px body between (y 40 to 120) holds widgets placed by `col` and `span`. Widget padding is 14px.

## Elevation & Depth

Flat and tonal. Depth is conveyed by the three graphite steps and hairlines; shadows appear only on things that float or press.

- **Button rest** (`0 1px 0 rgba(255,255,255,.06) inset, 0 1px 2px rgba(0,0,0,.45)`): a soft keycap edge. Pressed: 1px down with an inset shadow.
- **Popover** (`0 14px 34px rgba(0,0,0,.5)`), **toast** (`0 12px 30px rgba(0,0,0,.5)`), **tooltip** (`0 10px 28px rgba(0,0,0,.55)`), **palette** (`0 24px 60px rgba(0,0,0,.6)`).
- **Focus** (inputs): border to accent plus a 3px 22% accent ring. Elsewhere `:focus-visible` is a 2px accent outline at 2px offset.

The display has no shadows at all.

### Named Rules
**The Float-Only Shadow Rule.** Resting surfaces never carry a drop shadow; only overlays and the pressed keycap do.

## Shapes

Soft, small radii: chips 6px, controls 8px (small 7px), segmented 9px, popover 12px, palette 14px, switches and device chip fully round. Icon family: round caps and joins. Display: zones 5px, chip 6px, bars 3px. Replica controls highlight with an accent stroke and glow.

## Components

### Buttons
- **Default:** Raised fill, hairline-strong border, 34px high (28px small, 34px square icon), 8px radius, 600 13px text, keycap edge.
- **Primary:** accent fill with `on-accent` text; hover mixes 12% white in.
- **Ghost:** transparent, Text 2, raised on hover.
- **Danger:** bad-coloured outline; destructive actions use a two-step ConfirmButton that arms for 3s and then fills solid bad.
- **Disabled:** 45% opacity.

### Segmented, Switch
Segmented: workspace-coloured well with hairline, active segment Raised High with a faint top highlight. Switch: 36x20 track, thumb slides 16px; on = accent track with `on-accent` thumb.

### Inputs / Fields
34px, Raised fill, hairline-strong border, 8px radius; label above in 12px 600 Text 2, hint below in Text 3. Mono variant for ids and shortcuts. Recording state uses a bad border and ring.

### Chips and badges
22px, 6px radius, Raised High; accent/good/warn/bad variants tint 16-20% over Raised. Kind and icon pickers are selectable tiles: accent border and 14% accent tint when pressed.

### Popover, Sheet, Palette, Toast, Tooltip
Popover (Raised, 12px, closes on outside click or Escape). Sheet: native dialog from the right, 760px, Module fill, slides in 0.26s. Palette: native dialog, 580px, 14px radius. Toast: bottom-right, Raised High, good/bad border tint, icon plus text, 4.2s. Tooltip: #08080a, leads with the control's function in 14px bold with a mono 11px small-print line. Motion uses `cubic-bezier(.16,1,.3,1)`, and reduced-motion collapses all durations.

### Display widgets
Scenes are data; Python (`render.py`) and the browser (`render.ts`) draw them identically, supersampled 2x.
- **title:** centred text, optional note-size subtitle in ink-3; sizes display 60 / title 38.
- **meter:** mono caption (caps), 26px value, 6px track bar (3px radius) filled with a status colour or the accent; sits above the global encoders.
- **dial:** 30px radius, 8px thick ring on a track, status-coloured by level (under 60 good, under 85 warn, otherwise bad), caption + 34px metric + note beside it.
- **chip:** caps caption on a track-coloured pill (6px radius) at y 128 by default.
- **note:** one mono 14px line, y 140 by default.
- **wave:** 48 rounded bars in a rolling hue; **rainbow:** full-width hue sweep with black text, used for test only.
- **toast:** 380x76 centred panel on black, 14px radius, 2px ink-4 border, accent icon, caps label, 24px value and a 12px accent bar.
- **Label zones:** ink-3 text on black; the active control's zone fills accent with on-accent text; empty zones show a 2px ink-4 dash.

## Do's and Don'ts

### Do:
- **Do** take every UI colour from the custom properties in `ui/src/styles.css` and every display value from `tokens.py`; regenerate `tokens.json` rather than editing it.
- **Do** separate surfaces with the graphite steps and 7%/13% hairlines.
- **Do** use the accent only for selection, the primary action and live state.
- **Do** add new icons to `icons.tsx` on the 24px / 1.75 stroke grid.
- **Do** keep display content on the 120px column grid inside the 80px body, with labels in the 105x34 zones.
- **Do** require a second press for risky actions.

### Don't:
- **Don't** nest cards or use a sidebar-of-cards page; the replica is the hero.
- **Don't** use text glyphs as icons or add a second accent hue.
- **Don't** set the display ground to anything but #000000.
- **Don't** put prose or headings in Plex Mono.
- **Don't** add resting drop shadows.
