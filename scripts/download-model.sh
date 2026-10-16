#!/usr/bin/env bash
# Downloads the embedding model (about 23 MB) into .cache/models so the server
# never has to fetch it at runtime. Used by the production build.
set -euo pipefail
dir=".cache/models/Xenova/all-MiniLM-L6-v2"
mkdir -p "$dir/onnx"
for f in config.json tokenizer.json tokenizer_config.json onnx/model_quantized.onnx; do
  curl -sSL --retry 6 --retry-all-errors --retry-delay 2 -o "$dir/$f" "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/$f"
done
echo "Embedding model ready in $dir"
