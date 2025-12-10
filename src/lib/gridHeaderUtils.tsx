/**
 * Counts the number of words in a string
 */
function countWords(text: string | undefined | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Processes a column definition header
 * If header has more than 3 words, shortens it with ellipses and adds tooltip
 */
export function processColumnHeader(headerName: string | undefined): {
  headerName: string;
  headerTooltip?: string;
  headerComponent?: React.ComponentType<any>;
} {
  if (!headerName) {
    return { headerName: '' };
  }
  
  const wordCount = countWords(headerName);
  
  // If 3 words or less, return normal header
  if (wordCount <= 3) {
    return { headerName };
  }
  
  // If more than 3 words, shorten with ellipses and add tooltip
  const words = headerName.trim().split(/\s+/);
  const shortened = words.slice(0, 3).join(' ') + '...';
  
  return {
    headerName: shortened,
    headerTooltip: headerName
  };
}
