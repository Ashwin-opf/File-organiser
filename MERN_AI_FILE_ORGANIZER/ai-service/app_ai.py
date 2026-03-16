from flask import Flask, request, jsonify
from nlp_processor import process_command
from metadata_analyzer import analyze_file_metadata
from ml_classifier import MLClassifier
import os

app = Flask(__name__)

# Initialize ML Model
ml_classifier = MLClassifier()

import hashlib

# Known Malicious Signatures (Byte patterns)
# EICAR Test File String (Standard anti-malware test file)
EICAR_SIGNATURE = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
MALICIOUS_SIGNATURES = [
    EICAR_SIGNATURE,
    b"malware_test_string", 
    b"suspicious_code_pattern",

    b"<script>eval(atob(", # Simple webshell pattern
]

# Risky Extensions
MALWARE_EXTENSIONS = [
    ".exe", ".bat", ".cmd", ".sh", ".vbs", ".js", ".jar"
]

# Known Malicious Hashes (SHA256)
# Key: Hash, Value: Threat Name
KNOWN_BAD_HASHES = {
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855": "Empty File (Test)", # Just for testing hash logic
    # Add real hashes here in production
}

def calculate_sha256(file_path):
    sha256_hash = hashlib.sha256()
    try:
        with open(file_path, "rb") as f:
            # Read and update hash string value in blocks of 4K
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()
    except Exception as e:
        print(f"Error hashing file {file_path}: {e}")
        return None

def scan_file_content(file_path):
    """
    Scans file content for malware signatures and checks against bad hashes.
    Returns: (is_malware, threat_name)
    """
    if not os.path.exists(file_path):
        return False, None

    try:
        # 1. Hash Check (Fast)
        file_hash = calculate_sha256(file_path)
        if file_hash in KNOWN_BAD_HASHES:
            return True, f"Known Bad Hash: {KNOWN_BAD_HASHES[file_hash]}"

        # 2. Content Signature Scan (Slower - Read first 1MB)
        # We limit scan to first 1MB for performance in this MVP
        with open(file_path, 'rb') as f:
            content = f.read(1024 * 1024) 
            
            for sig in MALICIOUS_SIGNATURES:
                if sig in content:
                    return True, "Detected Malicious Signature"
                    
    except Exception as e:
        print(f"Error scanning file content {file_path}: {e}")
        
    return False, None

import re

# PII Regex Patterns
PII_PATTERNS = {
    "Email": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "Credit Card": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
    "Indian Phone": r"(?:\+91[\-\s]?)?[6-9]\d{9}\b",
    "Passport": r"\b[A-Z][0-9]{7}\b" 
}

def scan_text_for_pii(text):
    """
    Scans text for PII using regex.
    Returns: (is_pii, type)
    """
    for pii_type, pattern in PII_PATTERNS.items():
        if re.search(pattern, text):
            return True, pii_type
    return False, None

def check_pii(file_path):
    """
    Checks readable files (txt, csv, logs, md) for PII.
    """
    # Only scan text-based files for now to avoid decoding errors
    ALLOWED_EXTENSIONS = ['.txt', '.csv', '.log', '.md', '.json', '.xml', '.html', '.js', '.py']
    _, ext = os.path.splitext(file_path)
    
    if ext.lower() not in ALLOWED_EXTENSIONS:
        return False, None
        
    try:
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read(1024 * 512) # Read first 512KB
            is_pii, pii_type = scan_text_for_pii(content)
            if is_pii:
                return True, pii_type
    except Exception as e:
        print(f"Error scanning PII for {file_path}: {e}")
        
    return False, None

def is_malware(file_path):
    """
    Comprehensive Malware Detection:
    1. Check risky extensions.
    2. Check filenames.
    3. Deep Content Scan.
    """
    _, ext = os.path.splitext(file_path)
    filename = os.path.basename(file_path).lower()
    
    # 1. Extension check
    if ext.lower() in MALWARE_EXTENSIONS:
        return True, "Blocked Extension"
    # ... (rest of malware check)
        
    # 2. Filename check
    if "virus" in filename or "malware" in filename:
        return True, "Suspicious Filename"
    
    # 3. Content check
    is_malicious, threat = scan_file_content(file_path)
    if is_malicious:
        return True, threat
        
    return False, None

@app.route('/analyze', methods=['POST'])
def analyze():
    """
    Receives { 
        "command": "...", 
        "file_paths": [...],
        "options": { ... },
        "destination_override": "/path/to/dest" (Optional)
    }
    """
    data = request.json
    command = data.get('command', '')
    file_paths = data.get('file_paths', [])
    context = data.get('context', {}) # content snippets
    options = data.get('options', {})
    destination_override = data.get('destination_override', None)
    
    check_malware_flag = options.get('checkMalware', True)
    strategy = options.get('strategy', 'subfolders')

    # 1. Process NLP Command if present
    intent = "organize"
    criteria = {}
    
    if command:
        intent, criteria = process_command(command)
        
    if intent == "unknown":
        return jsonify({"error": "Could not understand command"}), 400

    # 2. Build Actions Plan
    actions = []
    
    for file_path in file_paths:
        new_name = None  # Initialize new_name to avoid UnboundLocalError
        # A. Security Check (Malware)
        if check_malware_flag:
            is_unsafe, threat_type = is_malware(file_path)
            if is_unsafe:
                actions.append({
                    "file": file_path,
                    "status": "malware_detected",
                    "operation": "skip",
                    "threat": threat_type
                })
                continue

            # A2. Privacy Check (PII)
            is_sensitive, pii_type = check_pii(file_path)
            if is_sensitive:
                actions.append({
                    "file": file_path,
                    "status": "pii_detected",
                    "operation": "move",  # Suggest moving to Vault
                    "threat": pii_type,
                    "destination_folder": os.path.join(os.path.dirname(file_path), "Secure_Vault") 
                })
                continue

        # B. Determine Base Destination
        if destination_override:
            base_dir = destination_override
        else:
            # Default: Organize IN-PLACE (within Source Folder)
            # Previously created an 'Organized' subfolder, which confused users.
            base_dir = os.path.dirname(file_path)

        # C. Determine Subfolder (Strategy or NLP)
        subfolder = ""
        
        # If NLP command rules apply
        if criteria.get("target_folder_name"):
             # Check if file matches criteria (e.g. extension)
             should_move = False
             if criteria.get("extensions"):
                 _, ext = os.path.splitext(file_path)
                 if ext.lower() in criteria["extensions"]:
                     should_move = True
             else:
                 should_move = True # No extension restriction
                 
             if should_move:
                 subfolder = criteria["target_folder_name"]
             else:
                 actions.append({
                     "file": file_path,
                     "status": "skipped",
                     "error": "Does not match command criteria"
                 })
                 continue
        else:
            # Automatic Organization
            if strategy == 'subfolders':
                # HYBRID APPROACH:
                # 1. Rule-Based (Fast)
                category = analyze_file_metadata(file_path)
                new_name = None
                
                # 2. ML-Based (Smart)
                if category in ["Documents", "Others", "Text", "Images"]: 
                    try:
                        # CONTENT-AWARE OVERRIDE
                        file_text = context.get(file_path, "").lower()
                        new_name = None
                        
                        if "invoice" in file_text or "bill" in file_text or "receipt" in file_text:
                            category = "Finance"
                            # Magic Renaming Logic
                            import time
                            # Simple rename strategy: Invoice_TIMESTAMP.ext
                            # In real app, we'd extract date via NLP
                            _, ext = os.path.splitext(file_path)
                            new_name = f"Invoice_{int(time.time())}{ext}"
                            
                        elif "salary" in file_text or "offer letter" in file_text:
                            category = "Career"
                        
                        elif not file_text: # Fallback to filename ML if no text
                            prediction = ml_classifier.predict(os.path.basename(file_path))
                            if prediction:
                                category = prediction
                                
                    except Exception as e:
                        print(f"ML/Content Error: {e}")

                subfolder = category
            else:
                # Flat organization -> directly into base_dir
                subfolder = "" 
        
        # Construct full destination
        if subfolder:
            full_destination = os.path.join(base_dir, subfolder)
        else:
            full_destination = base_dir
        
        action_obj = {
            "file": file_path,
            "operation": "move",
            "destination_folder": full_destination
        }
        
        if new_name:
            action_obj["new_filename"] = new_name
            
        actions.append(action_obj)

    return jsonify({
        "intent": intent,
        "actions": actions
    })

if __name__ == '__main__':
    app.run(port=5001, debug=False)
