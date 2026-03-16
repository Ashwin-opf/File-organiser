import os

def analyze_file_metadata(file_path):
    """
    Analyzes a file's metadata (extension) to suggest a category/folder.
    """
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()
    
    category_map = {
        "Images": [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".svg"],
        "Documents": [".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx", ".csv"],
        "Audio": [".mp3", ".wav", ".aac", ".flac"],
        "Video": [".mp4", ".mov", ".avi", ".mkv", ".webm"],
        "Archives": [".zip", ".rar", ".tar", ".gz", ".7z"],
        "Code": [".py", ".js", ".html", ".css", ".java", ".cpp", ".json"]
    }
    
    for category, extensions in category_map.items():
        if ext in extensions:
            return category
            
    return "Others"
