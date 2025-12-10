/**
 * Processes a column definition header
 * Returns the header name with a tooltip
 * CSS will handle ellipsis when header doesn't fit the width
 */
export function processColumnHeader(headerName: string | undefined): {
  headerName: string;
  headerTooltip?: string;
  headerComponent?: React.ComponentType<any>;
} {
  if (!headerName) {
    return { headerName: '' };
  }
  
  // Return header name with tooltip - CSS will handle ellipsis on overflow
  return {
    headerName,
    headerTooltip: headerName
  };
}
