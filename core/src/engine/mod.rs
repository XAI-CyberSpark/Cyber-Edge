use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct Manifest {
    pub api_version: String,
    pub kind: String,
}

pub struct Scheduler;

impl Scheduler {
    pub fn new() -> Self {
        Scheduler {}
    }

    pub async fn load_manifest(&mut self, _path: &str) -> Result<(), Box<dyn std::error::Error>> {
        // Mock loading
        tracing::info!("Loaded manifest from {}", _path);
        Ok(())
    }
}
