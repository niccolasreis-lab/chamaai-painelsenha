---
colors:
  surface: '#fcf8ff'
  surface-dim: '#dcd8e5'
  surface-bright: '#fcf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f2ff'
  surface-container: '#f0ecf9'
  surface-container-high: '#eae6f4'
  surface-container-highest: '#e4e1ee'
  on-surface: '#1b1b24'
  on-surface-variant: '#464555'
  inverse-surface: '#302f39'
  inverse-on-surface: '#f3effc'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#00687a'
  on-secondary: '#ffffff'
  secondary-container: '#57dffe'
  on-secondary-container: '#006172'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#acedff'
  secondary-fixed-dim: '#4cd7f6'
  on-secondary-fixed: '#001f26'
  on-secondary-fixed-variant: '#004e5c'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#fcf8ff'
  on-background: '#1b1b24'
  surface-variant: '#e4e1ee'
typography:
  ticket-display:
    fontFamily: Syne
    fontSize: 120px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  h1:
    fontFamily: Syne
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Syne
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  body:
    fontFamily: DM Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-caps:
    fontFamily: DM Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.15em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin: 32px
---

## Brand & Style
The design system is engineered for high-visibility environments where clarity and reduced cognitive load are paramount. It evokes a sense of organized calm through a "clean tech" aesthetic, blending professional corporate reliability with a vibrant, modern energy. The interface prioritizes legibility at a distance, particularly for public-facing displays, while maintaining a sophisticated atmosphere for administrative users.

The style leverages a modern digital-first approach: heavy on whitespace, utilizing depth through soft indigo-tinted shadows, and employing high-contrast typography to guide users through the queueing process seamlessly.

## Colors
The palette is rooted in a deep "Principal Indigo" to establish authority and trust, complemented by an "Electric Cyan" for secondary accents and interactive highlights. The background utilizes a very subtle blue tint to reduce the harshness of pure white, which is reserved for card surfaces to create distinct visual layers. 

Status colors are strictly functional: Emerald Green for successful actions and ticket completions, and a crisp Alert Red for cancellations or urgent notifications. Gradients are used sparingly to add depth to primary touchpoints and environmental screens (Totems/Displays), moving from the primary indigo to a deeper violet.

## Typography
This design system employs a dual-font strategy to balance character with utility. **Syne** is utilized for all high-impact numerical and display elements; its geometric and slightly eccentric letterforms ensure that ticket numbers are unmistakable even from a distance. **DM Sans** provides a neutral, highly readable counterpoint for all functional UI text, descriptions, and administrative data.

Hierarchy is enforced through extreme scale contrast—particularly the 120px ticket display—ensuring the most critical information is never missed.

## Layout & Spacing
The layout philosophy is built on "Generous Breathing Room." A 12-column fluid grid is used for administrative dashboards, while public-facing Totem and Telão (Big Screen) views utilize a centered, fixed-layout approach to maintain focus. 

Spacing follows a 4px/8px baseline rhythm. Generous internal padding within cards (minimum 32px) ensures that information does not feel crowded. Components are grouped using proximity logic, with larger gaps (40px+) used to separate distinct functional areas like "Current Ticket" and "Waiting List."

## Elevation & Depth
Depth in the design system is achieved through soft, tinted ambient shadows rather than traditional gray-scale blurs. Surfaces sit on the background with a 16px blur shadow that carries an 8% opacity tint of the primary Indigo (#4F46E5). This creates a "submerged" feeling where elements appear to float slightly above the bluish-white base.

- **Level 0 (Background):** #F8FAFF or Ambient Gradient.
- **Level 1 (Cards/Containers):** #FFFFFF with the signature indigo shadow.
- **Level 2 (Modals/Popovers):** #FFFFFF with a slightly more pronounced shadow (0 8px 24px rgba(79,70,229,0.12)).

## Shapes
The shape language is defined by large, friendly radii. A standard 20px corner radius is applied to all primary cards and containers, softening the overall aesthetic. Interactive elements like buttons and input fields use a slightly tighter radius (10px-12px) to signify they are clickable components within the larger card structures. Icons must always be "Outline" style with a consistent 2px stroke weight and rounded terminals to match the container geometry.

## Components

### Buttons
- **Primary:** Features the Indigo-to-Violet gradient. Text is white, bold. 12px border radius.
- **Secondary:** Outline style using the primary Indigo for both border and text.
- **Action (Success):** Solid Emerald Green (#10B981) for specific queue-call actions.

### Cards
All cards must be #FFFFFF with the 20px border radius and signature indigo shadow. Padding should be 32px for top-level containers.

### Inputs & Selection
Input fields use a subtle #EEF2FF background and a 1px #E0E7FF border. On focus, the border transitions to Primary Indigo with a soft outer glow. Labels always use the 11px uppercase "Label Caps" style.

### Ticket Display (Telão)
The focal point of the system. The current ticket number is rendered in Syne Bold, 120px, Primary Indigo. It is usually housed within a secondary surface container (#EEF2FF) to differentiate it from the sidebar waiting lists.

### Chips/Badges
Small, pill-shaped indicators for status (e.g., "Priority", "Canceled"). Use 8px padding-x and the secondary surface color as a base, with text in Text Secondary.