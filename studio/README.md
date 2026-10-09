# OAKEgde Studio v1.0.0

**OAKEgde Studio** is a professional-grade, browser-based IDE for developing, testing, and deploying Edge AI Agents. It provides a visual orchestration environment, hardware-in-the-loop simulation, and real-time monitoring for edge devices.

## 🚀 Key Features

### 1. Visual Orchestration
- **Drag-and-Drop Editor**: Build complex agent flows using React Flow.
- **Node Library**: Includes LLM, VLM, Audio, TTS, Tools, Logic, and Memory nodes.
- **Real-time Validation**: Instant feedback on node connections and configurations.

### 2. Hardware-in-the-Loop (HIL) Simulation
- **Multi-domain Support**: Automotive, Logistics (UAV), and Manufacturing (Robotics) modes.
- **3D Visualization**: Interactive 3D scene powered by Three.js/React Three Fiber.
- **Sensor Simulation**: Mock Camera, LiDAR, and Microphone data streams.

### 3. Full-Stack Monitoring
- **HAL Monitor**: Visualize sensor status, bus load (CAN-FD), and V2X connectivity.
- **Kernel Monitor**: Track NPU utilization, VRAM usage, and task scheduling.
- **Memory Monitor**: Inspect Working Memory, Vector DB (RAG), and Knowledge Graphs.
- **Safety Monitor**: Real-time guardrails for input injection, PII leakage, and safety policy violations.

### 4. Enterprise-Grade Tooling
- **Deployment Wizard**: One-click deployment pipeline to edge devices (e.g., NVIDIA Orin).
- **Model Registry**: Manage and download optimized models (GGUF, TensorRT-LLM).
- **Skill Library**: Extensible marketplace for agent capabilities.
- **Bilingual Support**: Full English and Chinese (中文) localization.

## 📂 Project Structure

```
src/
├── components/
│   ├── core/           # Core engine components (FlowCanvas, VehicleSimulator)
│   ├── layout/         # UI layout (Sidebar, Settings, Properties)
│   ├── monitors/       # System monitors (Kernel, Memory, HAL, Safety)
│   ├── nodes/          # Graph node implementations
│   ├── spatial/        # 3D visualization scenes
│   ├── ui/             # Shadcn/UI primitive components
│   └── wizards/        # Dialog wizards (Deployment, Scenario, Skills)
├── context/            # Global state (AppContext, i18n)
├── data/               # Static data and configurations
└── lib/                # Utilities
```

## 🛠️ Getting Started

1.  **Install Dependencies**
    ```bash
    npm install
    ```

2.  **Run Development Server**
    ```bash
    npm run dev
    ```

3.  **Build for Production**
    ```bash
    npm run build
    ```

## 🌍 Localization

Toggle between English and Chinese using the globe icon in the top header. Translations are managed in `src/context/AppContext.tsx`.

## 🤝 Contributing

This project is part of the **OAKEgde Studio OS** ecosystem.

---
*Powered by React, Vite, Tailwind CSS, and React Flow.*
