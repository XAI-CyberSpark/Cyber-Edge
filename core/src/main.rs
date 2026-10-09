mod engine;
mod event_bus;
mod telemetry;
mod healing;

use tracing::{info, Level};

fn resolve_manifest_path() -> String {
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        if arg == "--manifest" {
            if let Some(path) = args.next() {
                return path;
            }
        }
    }

    std::env::var("GEDGE_MANIFEST_PATH")
        .unwrap_or_else(|_| "../manifests/smart_cabin_v2.yaml".to_string())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_max_level(Level::INFO).init();
    
    info!("Starting G-Edge Core Microkernel...");
    let manifest_path = resolve_manifest_path();

    // Initialize Telemetry
    #[cfg(feature = "telemetry_ui")]
    {
        info!("Telemetry UI feature enabled. Starting WebSocket server...");
        telemetry::start_server("0.0.0.0:8081").await?;
    }

    // Initialize Event Bus
    let _bus = event_bus::EventBus::new();
    
    // Initialize Scheduler
    let mut scheduler = engine::Scheduler::new();
    scheduler.load_manifest(&manifest_path).await?;

    info!("G-Edge Core running. Awaiting events...");
    
    // Keep alive
    tokio::signal::ctrl_c().await?;
    info!("Shutting down G-Edge Core.");
    
    Ok(())
}
