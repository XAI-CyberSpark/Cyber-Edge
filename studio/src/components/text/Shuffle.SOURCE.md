# Shuffle

Source: https://reactbits.dev/text-animations/shuffle
Official component: https://github.com/DavidHDev/react-bits/blob/main/src/ts-default/TextAnimations/Shuffle/Shuffle.tsx
Retrieved 2026-09-20 via official Shuffle-TS-CSS registry; MIT + Commons Clause (adjacent license).

Uses the reference's rightward even/odd character strips, duration0.35s, stagger0.03s, power3.out, one shuffle and hover replay. Press Start 2P is the reference font, self-hosted through @fontsource/press-start-2p (SIL OFL, npm package LICENSE).

Adaptations: preserve title case, responsive title sizing and the existing green/cyan/blue gradient; explicitly load font before measuring; cancel font callback on unmount; visible static fallback for reduced motion and slow font loading; watch preference changes; rebuild metrics after viewport resize; use React.JSX for React19 typing. No permanent animation loop.

2026-09-20 smoothness fix: homepage uses a continuous wave (0.65s per glyph, 0.018s stagger, sine.inOut). Batch initial glyph measurements, retain strips and restart the same timeline on hover; hide idle copies to avoid fractional-width edge bleed. Release will-change and use automatic 3D promotion at rest. Even/odd mode remains available but is no longer used by the homepage.
