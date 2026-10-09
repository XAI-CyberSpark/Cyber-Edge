#!/usr/bin/env python3
import os
import argparse
import subprocess
import sys

def check_requirements():
    # Check if llama.cpp quantize tool exists
    # Assumption: User has built llama.cpp and it's in PATH or specified via env
    quantize_path = os.environ.get("LLAMA_CPP_QUANTIZE_PATH", "quantize")
    try:
        subprocess.run([quantize_path, "--help"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        return quantize_path
    except FileNotFoundError:
        print("Error: 'quantize' tool not found.")
        print("Please build llama.cpp and add 'quantize' to PATH, or set LLAMA_CPP_QUANTIZE_PATH.")
        sys.exit(1)

def quantize_model(model_path, output_path, method):
    quantize_cmd = check_requirements()
    
    print(f"=== Starting Quantization ===")
    print(f"Input: {model_path}")
    print(f"Output: {output_path}")
    print(f"Method: {method}")
    
    cmd = [quantize_cmd, model_path, output_path, method]
    
    try:
        subprocess.run(cmd, check=True)
        print(f"\n✅ Quantization successful! Model saved to {output_path}")
        
        # Calculate compression ratio
        orig_size = os.path.getsize(model_path)
        new_size = os.path.getsize(output_path)
        ratio = (1 - new_size / orig_size) * 100
        print(f"Compression: {orig_size/1024/1024:.2f}MB -> {new_size/1024/1024:.2f}MB ({ratio:.1f}% reduction)")
        
    except subprocess.CalledProcessError:
        print("\n❌ Quantization failed.")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OAKEgde Studio Model Quantizer (GGUF)")
    parser.add_argument("input_model", help="Path to input GGUF (f16/f32) or HF directory")
    parser.add_argument("output_model", help="Path to output GGUF file")
    parser.add_argument("--method", default="Q5_K_M", help="Quantization method (default: Q5_K_M)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_model):
        print(f"Error: Input model {args.input_model} not found.")
        sys.exit(1)
        
    quantize_model(args.input_model, args.output_model, args.method)
