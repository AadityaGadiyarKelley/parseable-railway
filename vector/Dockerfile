FROM timberio/vector:latest-alpine

# Copy Vector configuration
COPY vector.toml /etc/vector/vector.toml

# HTTP log drain receiver port
EXPOSE 9292

# The base image sets ENTRYPOINT ["vector"]; we only need to pass arguments.
CMD ["--config", "/etc/vector/vector.toml"]
