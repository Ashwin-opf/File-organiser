import re

def process_command(command_text):
    """
    Extracts intent and criteria from a natural language command.
    Example: "Move all PDFs to Documents"
    Returns: { "intent": "organize", "criteria": { "file_type": "pdf", "target_folder": "Documents" } }
    """
    command_text = command_text.lower()
    
    # default intent
    intent = "unknown"
    criteria = {}

    # Simple Keyword Matching for MVP
    if "move" in command_text or "organize" in command_text or "sort" in command_text:
        intent = "organize"
        
        # Extract File Type
        # Looking for patterns like "pdfs", "images", "jpgs"
        file_type_map = {
            "pdf": [".pdf"],
            "image": [".jpg", ".jpeg", ".png", ".gif"],
            "photo": [".jpg", ".jpeg", ".png", ".gif"],
            "doc": [".doc", ".docx", ".txt"],
            "video": [".mp4", ".mov", ".avi"],
            "music": [".mp3", ".wav"]
        }
        
        found_extensions = []
        for key, exts in file_type_map.items():
            if key in command_text:
                found_extensions.extend(exts)
        
        if found_extensions:
            criteria["extensions"] = found_extensions
        
        # Extract Destination (Simplified: assume word after 'to' or 'into' is folder)
        # Regex to find "to [Folder]"
        match = re.search(r'(?:to|into)\s+(\w+)', command_text)
        if match:
            criteria["target_folder_name"] = match.group(1).capitalize()
    
    return intent, criteria
