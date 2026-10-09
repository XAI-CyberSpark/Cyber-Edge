# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-03-14

### Added
- **Safety Monitor**: Real-time guardrails for input injection, PII leakage, and safety policy violations.
- **Bilingual Support**: Full English and Chinese (中文) localization across all UI components.
- **Debug Scenarios**: "Medical Emergency" and "Drowsiness Alert" scenarios in Sidebar -> Env.
- **Simulation Control**: Added "Stop Simulation" button to reset system state.
- **Scenario Library**: Categorized scenarios (Smart Cockpit, Security, Perception) with config preview.
- **Model Registry**: UI for managing on-device models (LLM, VLM, Audio, TTS).
- **Deployment Wizard**: Mock deployment pipeline for edge devices.
- **Skill Library**: UI for browsing and importing agent skills.
- **Settings Panel**: Configuration for language, models, and edge devices.

### Changed
- **Architecture**: Refactored component structure into `core`, `layout`, `monitors`, `wizards`, and `nodes`.
- **UI/UX**: Improved Sidebar organization, moved global actions to context-aware locations.
- **Visuals**: Enhanced 3D scene integration and HUD overlays.
- **Performance**: Optimized rendering for monitors and graph editor.

### Fixed
- **Layout**: Fixed `TabsContent` height issues causing blank screens in monitors.
- **State Management**: Fixed issue where simulations could not be stopped/reset.
- **Usability**: Removed intrusive top-bar buttons, moving them to the Sidebar.

### Infrastructure
- **Versioning**: Locked version to 1.0.0.
- **Documentation**: Added comprehensive README and project structure documentation.
