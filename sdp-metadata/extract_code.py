import os

# --- Configuration ---
# The path to your React/Node application
TARGET_DIR = '/home/hadoop/sdp-metadata'

# The file where all the code will be saved
OUTPUT_FILE = 'sdp_metadata_full_code.txt'

# Folders to completely ignore (crucial for keeping the file size manageable)
IGNORE_DIRS = {
    'node_modules', '.git', 'build', 'dist', 
    'coverage', '.next', '__pycache__', 'venv'
}

# File extensions you want to include
ALLOWED_EXTENSIONS = {
    '.js', '.jsx', '.ts', '.tsx', 
    '.json', '.css', '.scss', '.html', 
    '.py', '.sh', '.md', '.env.example'
}
# ---------------------

def extract_codebase(target_dir, output_file):
    print(f"🚀 Scanning directory: {target_dir}")
    
    with open(output_file, 'w', encoding='utf-8') as outfile:
        file_count = 0
        
        for root, dirs, files in os.walk(target_dir):
            # Modify dirs in-place to skip ignored directories
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS]
            
            for file in files:
                # Get the file extension
                _, ext = os.path.splitext(file)
                
                if ext.lower() in ALLOWED_EXTENSIONS:
                    file_path = os.path.join(root, file)
                    relative_path = os.path.relpath(file_path, target_dir)
                    
                    try:
                        # Read the file content
                        with open(file_path, 'r', encoding='utf-8', errors='ignore') as infile:
                            content = infile.read()
                            
                        # Write a clear separator and file path header
                        outfile.write(f"\n\n{'='*80}\n")
                        outfile.write(f"📁 FILE: {relative_path}\n")
                        outfile.write(f"{'='*80}\n\n")
                        
                        # Write the actual code
                        outfile.write(content)
                        outfile.write("\n")
                        
                        file_count += 1
                        print(f"Added: {relative_path}")
                        
                    except Exception as e:
                        print(f"⚠️ Could not read {relative_path}: {e}")

    print(f"\n✅ Extraction complete! {file_count} files saved to {output_file}")

if __name__ == "__main__":
    if not os.path.exists(TARGET_DIR):
        print(f"❌ Error: Target directory '{TARGET_DIR}' does not exist.")
    else:
        extract_codebase(TARGET_DIR, OUTPUT_FILE)
