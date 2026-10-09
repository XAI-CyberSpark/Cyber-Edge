# Bloub source

Upstream: https://github.com/jeremy-prt/bloub

Retrieved 2026-09-15 from https://codeload.github.com/jeremy-prt/bloub/tar.gz/refs/heads/main (package version 0.1.1). Commit ID was not available; sha256.json records the exact acquired core snapshot. All non-test src/bot/*.ts files are copied unchanged. No Vue runtime dependency is added.

Code: MIT, Copyright (c) 2026 Jérémy Perret; see LICENSE. Upstream README states the license covers repository code, not the x.ai design it imitates.

React renderer in components/avatar/BloubAvatar.tsx adapts src/components/BloubBot.vue, retaining masks, layers, particles, gradients and viewBox. Preview controls are OAKEgde-Studio-specific; pause freezes the animation clock whereas upstream stop only stops sequence progression. Gaze scripts, pointer-follow and the website customizer are not wired into the preview. The unmodified engine retains the look/shape/expression APIs.
