#!/bin/bash
# Runs the Linux sandbox tests (src-tauri/src/agent/confine.rs) inside a Linux
# container, from any machine with Docker. The module is built alone in a tiny
# crate, so none of the app's GUI libraries are needed. Node is installed in
# the container, for the test that runs a real Node program under the rules.
#
#   scripts/test-linux-sandbox.sh
#
# A kernel without Landlock fails the run instead of skipping the tests.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"

docker run --rm \
  -v "$repo/src-tauri/src/agent/confine.rs":/work/confine.rs:ro \
  -e YOMU_REQUIRE_LANDLOCK=1 \
  rust:1 bash -c '
    set -e
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y -qq nodejs >/dev/null 2>&1
    mkdir -p /tmp/crate/src
    printf "[package]\nname = \"confine-check\"\nversion = \"0.0.0\"\nedition = \"2021\"\n\n[dependencies]\nlandlock = \"0.4\"\n" > /tmp/crate/Cargo.toml
    printf "#[path = \"/work/confine.rs\"]\npub mod confine;\n" > /tmp/crate/src/lib.rs
    cd /tmp/crate
    uname -sr
    cargo test --lib -- --nocapture
  '
