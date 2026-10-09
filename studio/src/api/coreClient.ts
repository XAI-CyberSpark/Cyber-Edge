// Core Protocol Client to connect Studio with Rust Microkernel / Legacy Python Backend

import { getApiBaseUrl } from "@/lib/api";

export class TelemetryClient {
  private dagSocket: WebSocket | null = null;
  private physicsSocket: WebSocket | null = null;
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  connect(
    onDagUpdate: (data: any) => void,
    onPhysicsUpdate: (data: any) => void
  ) {
    // Determine WS protocol based on HTTP protocol
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = this.baseUrl.replace(/^https?:\/\//, '');

    // Connect DAG Telemetry
    this.dagSocket = new WebSocket(`${wsProtocol}//${host}/telemetry/dag`);
    this.dagSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onDagUpdate(data);
      } catch (e) {
        console.error("Failed to parse DAG telemetry data", e);
      }
    };

    // Connect Physics Telemetry
    this.physicsSocket = new WebSocket(`${wsProtocol}//${host}/telemetry/physics`);
    this.physicsSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onPhysicsUpdate(data);
      } catch (e) {
        console.error("Failed to parse Physics telemetry data", e);
      }
    };
  }

  disconnect() {
    this.dagSocket?.close();
    this.physicsSocket?.close();
  }

  injectVirtualEvent(event: any) {
    if (this.physicsSocket?.readyState === WebSocket.OPEN) {
      this.physicsSocket.send(JSON.stringify(event));
    }
  }
}

// Singleton instance
export const coreTelemetry = new TelemetryClient(getApiBaseUrl());
