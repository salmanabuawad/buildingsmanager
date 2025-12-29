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
      className="tooltip-container"
      style={{
        top: `${position.top}px`,
        right: `${position.right + 8}px`,
        transform: 'translateY(-50%)'
      }}
    >
      <div className="tooltip-content">
        {Array.isArray(displayMessage) ? (
          displayMessage.map((msg, index) => (
            <div key={index} className="tooltip-message-item">
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

