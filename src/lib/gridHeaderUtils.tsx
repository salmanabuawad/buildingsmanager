import React from 'react';
import { 
  Info, Calendar, DollarSign, Home, Building, MapPin, Tag, 
  Ruler, Layers, FileText, User, Hash, Percent, Image, 
  Settings, CheckCircle, Store, Calculator, 
  Package, SquareStack, Building2, AlertCircle,
  TrendingDown, Minus, Plus, X, Search,
  Landmark, Box, Grid3x3, TrendingUp, ArrowDown, ArrowUp,
  BarChart3, PieChart, Activity, Zap, Target, Shield,
  Clipboard, List, Grid, Columns, Table, Database,
  Folder, File, FileCheck, FileX, FileSearch, FileBarChart,
  Home2, Factory, Warehouse, Hotel, School,
  Briefcase, ShoppingBag, ShoppingCart, Truck, Car, Bike,
  TreePine, Mountain, Waves, Sun, Moon, Star,
  Heart, ThumbsUp, ThumbsDown, Flag, Award, Trophy,
  Bell, MessageSquare, Mail, Phone, Video, Camera,
  Music, Film, Book, BookOpen, GraduationCap, Lightbulb,
  Wrench, Hammer, Cog, Sliders, Filter
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
 * Uses exact header name matching first, then pattern matching
 * Ensures each unique header gets a unique icon
 */
function getHeaderIcon(headerName: string): React.ComponentType<any> {
  const lowerName = headerName.toLowerCase();
  const normalizedName = headerName.trim();
  
  // Exact header name mappings for unique icons (most specific first)
  // Each long header (>2 words) gets a unique, descriptive icon
  const exactMappings: Record<string, React.ComponentType<any>> = {
    // BuildingsList headers (>2 words)
    'אחוז העמסה': Activity,
    'שטח משותף מגורים': Home2,
    'שטח משותף עסקים': Store,
    'ס"כ גודל': BarChart3,
    'שטח לבקרה': Shield,
    'בית פרטי חד משפחתי דו משפחתי': Home,
    'מבנים צמודי קרקע טוריים מעל 2 יחידות': Building2,
    
    // AssetTypes headers (>2 words)
    'תיאור אזור לתצוגה בלשונית': Clipboard,
    'בית פרטי חד משפחתי דו משפחתי': Home,
    'מבנים צמודי קרקע טוריים מעל 2 יחידות': Building2,
    
    // Discount/Date headers (>2 words)
    'תאריך הנחה מ': Calendar,
    'תאריך הנחה עד': Calendar,
    'תאריך מדידה': Calendar,
    
    // Sub-asset type headers (translated, >2 words would be like "סוג נכס משנה 1" but these are usually 2 words)
    // Adding for completeness in case they appear as longer forms
    'סוג נכס משנה 1': Package,
    'סוג נכס משנה 2': Box,
    'סוג נכס משנה 3': Grid3x3,
    'סוג נכס משנה 4': Layers,
    'סוג נכס משנה 5': SquareStack,
    'סוג נכס משנה 6': Database,
  };
  
  // Check exact match first
  if (exactMappings[normalizedName]) {
    return exactMappings[normalizedName];
  }
  
  // Pattern-based matching with unique icons for different patterns
  // Using hash of header name to ensure consistent unique icon assignment
  
  // Create a deterministic hash for consistent icon selection
  // This ensures the same header always gets the same icon
  const hash = normalizedName.split('').reduce((acc, char) => {
    return ((acc << 5) - acc) + char.charCodeAt(0);
  }, 0);
  
  // Large pool of unique icons for hash-based assignment
  // Ensures different headers get different icons
  const iconPool = [
    Settings, CheckCircle, TrendingDown, Calendar, DollarSign, Percent, Bank,
    Building2, Building, Layers, Home, MapPin, Tag, SquareStack, Ruler,
    Package, Store, Home2, FileText, Image, User, Hash, AlertCircle, Calculator,
    X, Minus, Plus, Info, Activity, BarChart3, Shield, Clipboard, Box, Grid3x3,
    Database, TrendingUp, ArrowDown, ArrowUp, PieChart, Zap, Target, List,
    Grid, Columns, Table, Folder, File, FileCheck, FileX, FileSearch, FileBarChart,
    Factory, Warehouse, Hotel, School, Briefcase, ShoppingBag, ShoppingCart,
    Truck, Car, Bike, TreePine, Mountain, Waves, Sun, Moon, Star, Heart,
    ThumbsUp, ThumbsDown, Flag, Award, Trophy, Bell, MessageSquare, Mail,
    Phone, Video, Camera, Music, Film, Book, BookOpen, GraduationCap, Lightbulb,
    Wrench, Hammer, Cog, Sliders, Filter, Search
  ];
  
  // Select icon based on hash (ensures same header always gets same unique icon)
  const selectedIcon = iconPool[Math.abs(hash) % iconPool.length];
  
  // But first, try pattern matching for semantic meaning
  // Actions/Operations
  if (lowerName.includes('פעולות') || lowerName.includes('actions')) {
    return Settings;
  }
  
  // Active/Status
  if (lowerName.includes('פעיל') || lowerName.includes('active') || lowerName.includes('status')) {
    return CheckCircle;
  }
  
  // Discount
  if (lowerName.includes('הנחה') || lowerName.includes('discount')) {
    return TrendingDown;
  }
  
  // Date-related
  if (lowerName.includes('תאריך') || lowerName.includes('date') || lowerName.includes('measurement')) {
    return Calendar;
  }
  
  // Payment/Payer
  if (lowerName.includes('תשלום') || lowerName.includes('payer') || lowerName.includes('payment')) {
    return DollarSign;
  }
  
  // Percentage/Load
  if (lowerName.includes('אחוז') || lowerName.includes('percent') || lowerName.includes('העמסה') || lowerName.includes('load')) {
    return Percent;
  }
  
  // Tax region
  if (lowerName.includes('אזור מיסים') || lowerName.includes('אזור מס') || lowerName.includes('tax region')) {
    return Landmark;
  }
  
  // Building number
  if (lowerName.includes('מספר מבנה') || lowerName.includes('מספר בניין') || lowerName.includes('building number')) {
    return Building2;
  }
  
  // Building/Home
  if (lowerName.includes('מבנה') || lowerName.includes('building') || lowerName.includes('בית') || lowerName.includes('home')) {
    return Building;
  }
  
  // Floor
  if (lowerName.includes('קומה') || lowerName.includes('floor') || lowerName.includes('level')) {
    return Layers;
  }
  
  // Penthouse
  if (lowerName.includes('גג') || lowerName.includes('penthouse') || lowerName.includes('roof')) {
    return Home;
  }
  
  // Address
  if (lowerName.includes('כתובת') || lowerName.includes('address') || lowerName.includes('location')) {
    return MapPin;
  }
  
  // Region
  if (lowerName.includes('אזור') || lowerName.includes('region') || lowerName.includes('zone')) {
    return MapPin;
  }
  
  // Asset type
  if (lowerName.includes('סוג נכס') || lowerName.includes('סוג') || lowerName.includes('type') || lowerName.includes('category')) {
    return Tag;
  }
  
  // Shared area
  if (lowerName.includes('שטח משותף') || lowerName.includes('shared area')) {
    return SquareStack;
  }
  
  // Area/Size
  if (lowerName.includes('שטח') || lowerName.includes('area') || lowerName.includes('size') || lowerName.includes('גודל')) {
    return Ruler;
  }
  
  // Sub-asset
  if (lowerName.includes('נכס משנה') || lowerName.includes('sub asset') || lowerName.includes('sub-asset')) {
    return Package;
  }
  
  // Business
  if (lowerName.includes('עסקים') || lowerName.includes('business') || lowerName.includes('commercial')) {
    return Store;
  }
  
  // Residential
  if (lowerName.includes('מגורים') || lowerName.includes('residential')) {
    return Home;
  }
  
  // Document
  if (lowerName.includes('מסמך') || lowerName.includes('document') || lowerName.includes('file') || lowerName.includes('תרשים') || lowerName.includes('drawing')) {
    return FileText;
  }
  
  // Image
  if (lowerName.includes('תמונה') || lowerName.includes('image') || lowerName.includes('photo')) {
    return Image;
  }
  
  // User
  if (lowerName.includes('משתמש') || lowerName.includes('user') || lowerName.includes('person')) {
    return User;
  }
  
  // ID/Number
  if (lowerName.includes('מספר') || lowerName.includes('id') || lowerName.includes('code')) {
    return Hash;
  }
  
  // Description
  if (lowerName.includes('תיאור') || lowerName.includes('description') || lowerName.includes('text')) {
    return FileText;
  }
  
  // Control
  if (lowerName.includes('בקרה') || lowerName.includes('control') || lowerName.includes('inspection')) {
    return AlertCircle;
  }
  
  // Sum/Total
  if (lowerName.includes('ס"כ') || lowerName.includes('סה"כ') || lowerName.includes('total') || lowerName.includes('sum')) {
    return Calculator;
  }
  
  // Not accountable
  if (lowerName.includes('לא נספר') || lowerName.includes('not accountable') || lowerName.includes('excluded')) {
    return X;
  }
  
  // Min
  if (lowerName.includes('מ') && (lowerName.includes('שטח') || lowerName.includes('size'))) {
    return Minus;
  }
  
  // Max
  if (lowerName.includes('עד') && (lowerName.includes('שטח') || lowerName.includes('size'))) {
    return Plus;
  }
  
  // Fallback to hash-based unique icon
  return selectedIcon;
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

