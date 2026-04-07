FROM parseable/parseable:latest

# ── Storage ────────────────────────────────────────────────────────────────────
# local-store mode: no S3 / object storage required
ENV P_FS_DIR=/tmp/parseable/data
ENV P_STAGING_DIR=/tmp/parseable/staging

# ── Auth (override in Railway dashboard or railway.toml) ───────────────────────
ENV P_USERNAME=admin
ENV P_PASSWORD=admin

# ── Logging ────────────────────────────────────────────────────────────────────
ENV RUST_LOG=warn

# Default bind address. On Railway this is overridden by the startCommand
# in railway.toml to use the dynamically assigned $PORT.
# Locally, set P_ADDR explicitly in your docker-compose environment section.
ENV P_ADDR=0.0.0.0:8000

EXPOSE 8000

# Exec form — no shell required (the base image is distroless).
CMD ["parseable", "local-store"]
