# -----------------------------------------------------------------------------
# Base Image for Python Backend
# Uses slim version for smaller image size.
# -----------------------------------------------------------------------------
FROM python:3.10-slim as builder

WORKDIR /app

# Install system dependencies required for compilation (e.g., paramiko, chroma)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# -----------------------------------------------------------------------------
# Production Image
# -----------------------------------------------------------------------------
FROM python:3.10-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Ensure local bin is in PATH
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1

# Copy source code
COPY . .

# Expose API port
EXPOSE 8000

# Command to run the application using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
