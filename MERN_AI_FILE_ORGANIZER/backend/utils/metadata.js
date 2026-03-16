const path = require('path');

function analyzeFileMetadata(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const filename = path.basename(filePath).toLowerCase();

    // 1. Keyword-Based (Specific) - High Priority
    if (filename.includes('invoice') || filename.includes('receipt') || filename.includes('bill')) return 'Finance';
    if (filename.includes('resume') || filename.includes('cv')) return 'Career';
    if (filename.includes('screenshot')) return 'Images';

    // 2. Extension-Based (General)
    if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'].includes(ext)) return 'Images';
    if (['.mp4', '.mkv', '.avi', '.mov', '.wmv'].includes(ext)) return 'Videos';
    if (['.mp3', '.wav', '.flac', '.aac'].includes(ext)) return 'Audio';
    if (['.pdf', '.docx', '.doc', '.txt', '.xlsx', '.pptx', '.csv'].includes(ext)) return 'Documents';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'Archives';
    if (['.exe', '.msi', '.dmg', '.pkg', '.deb'].includes(ext)) return 'Installers';
    if (['.py', '.js', '.html', '.css', '.java', '.cpp', '.json'].includes(ext)) return 'Developer';

    return 'Others';
}

module.exports = { analyzeFileMetadata };
