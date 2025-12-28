import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';

interface ValidationTooltipIconProps {
  message: string | string[];
}

export const ValidationTooltipIcon: React.FC<ValidationTooltipIconProps> = ({ message }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ top: 0, right: 0 });
  const iconRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setPosition({
        top: rect.top + rect.height / 2,
        right: window.innerWidth - rect.left
      });
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const messageArray = Array.isArray(message) ? message : [message];
  const displayMessage = messageArray.length === 1 ? messageArray[0] : messageArray;

  const tooltipContent = isHovered ? (
    <div
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        right: `${position.right + 8}px`,
        transform: 'translateY(-50%)',
        zIndex: 9999,
        pointerEvents: 'none'
      }}
    >
      <div style={{
        backgroundColor: '#f9fafb',
        color: '#1f2937',
        padding: '12px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        maxWidth: '500px',
        minWidth: '300px',
        direction: 'rtl',
        textAlign: 'right',
        lineHeight: '1.6',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        border: '2px solid #ef4444',
        whiteSpace: 'pre-line'
      }}>
        {Array.isArray(displayMessage) ? (
          displayMessage.map((msg, index) => (
            <div key={index} style={{ marginBottom: index < displayMessage.length - 1 ? '8px' : '0' }}>
              {msg}
            </div>
          ))
        ) : (
          displayMessage
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <div 
        ref={iconRef}
        className="w-4 h-4 flex items-center justify-center flex-shrink-0"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <AlertCircle className="h-4 w-4 text-red-600" />
      </div>
      {tooltipContent && createPortal(tooltipContent, document.body)}
    </>
  );
};

