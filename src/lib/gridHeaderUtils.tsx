import React from 'react';
import { 
  Info, Calendar, DollarSign, Home, Building, MapPin, Tag, 
  Ruler, Layers, FileText, User, Hash, ArrowUpDown, Percent,
  Image, Edit, Trash2, Eye, CheckCircle, X, Plus, Search,
  Settings, Download, Upload, Filter, BarChart, PieChart
} from 'lucide-react';
import { IHeaderParams } from 'ag-grid-community';

/**
 * Counts the number of words in a string
 */
export function countWords(text: string | undefined | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Gets an appropriate icon for a header based on its content
 */
function getHeaderIcon(headerName: string): React.ComponentType<any> {
  const lowerName = headerName.toLowerCase();
  
  // Date-related
  if (lowerName.includes('תאריך') || lowerName.includes('date') || lowerName.includes('measurement')) {
    return Calendar;
  }
  
  // Money/Payment related
  if (lowerName.includes('תשלום') || lowerName.includes('payer') || lowerName.includes('discount') || lowerName.includes('הנחה')) {
    return DollarSign;
  }
  
  // Building/Home related
  if (lowerName.includes('מבנה') || lowerName.includes('building') || lowerName.includes('קומה') || lowerName.includes('floor') || lowerName.includes('גג') || lowerName.includes('penthouse')) {
    return Building;
  }
  
  // Location/Address related
  if (lowerName.includes('כתובת') || lowerName.includes('address') || lowerName.includes('אזור') || lowerName.includes('region')) {
    return MapPin;
  }
  
  // Asset type related
  if (lowerName.includes('סוג') || lowerName.includes('type') || lowerName.includes('asset type')) {
    return Tag;
  }
  
  // Size/Measurement related
  if (lowerName.includes('גודל') || lowerName.includes('size') || lowerName.includes('שטח') || lowerName.includes('area')) {
    return Ruler;
  }
  
  // Sub-asset related
  if (lowerName.includes('נכס משנה') || lowerName.includes('sub') || lowerName.includes('משנה')) {
    return Layers;
  }
  
  // Document/File related
  if (lowerName.includes('מסמך') || lowerName.includes('document') || lowerName.includes('file') || lowerName.includes('drawing') || lowerName.includes('תרשים')) {
    return FileText;
  }
  
  // User/Person related
  if (lowerName.includes('משתמש') || lowerName.includes('user') || lowerName.includes('payer')) {
    return User;
  }
  
  // ID/Number related
  if (lowerName.includes('מספר') || lowerName.includes('id') || lowerName.includes('code')) {
    return Hash;
  }
  
  // Actions related
  if (lowerName.includes('פעולות') || lowerName.includes('actions')) {
    return Settings;
  }
  
  // Image/Photo related
  if (lowerName.includes('תמונה') || lowerName.includes('image') || lowerName.includes('photo') || lowerName.includes('drawing')) {
    return Image;
  }
  
  // Default to Info icon
  return Info;
}

/**
 * Custom header component for long headers with dedicated icons
 */
function createLongHeaderComponent(headerName: string): React.ComponentType<IHeaderParams> {
  const IconComponent = getHeaderIcon(headerName);
  
  return class LongHeaderComponent extends React.Component<IHeaderParams> {
    render() {
      return (
        <div className="flex items-center justify-center h-full w-full" title={headerName}>
          <IconComponent className="h-4 w-4 text-slate-600" />
        </div>
      );
    }
  };
}

/**
 * Processes a column definition to add icon header and tooltip for long headers (>2 words)
 * Returns an object with headerName, headerTooltip, and optionally headerComponent
 */
export function processColumnHeader(headerName: string | undefined): {
  headerName: string;
  headerTooltip?: string;
  headerComponent?: React.ComponentType<IHeaderParams>;
} {
  if (!headerName) {
    return { headerName: '' };
  }
  
  const wordCount = countWords(headerName);
  
  // If 2 words or less, return normal header
  if (wordCount <= 2) {
    return { headerName };
  }
  
  // If more than 2 words, return icon header with tooltip
  return {
    headerName: '', // Empty string so icon shows
    headerTooltip: headerName,
    headerComponent: createLongHeaderComponent(headerName)
  };
}

/**
 * Gets the header tooltip for a column
 * Returns the header name if it has more than 2 words, otherwise undefined
 */
export function getHeaderTooltip(headerName: string | undefined): string | undefined {
  if (!headerName) return undefined;
  
  const wordCount = countWords(headerName);
  
  // Return tooltip only if more than 2 words
  if (wordCount > 2) {
    return headerName;
  }
  
  return undefined;
}

