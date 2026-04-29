import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function PhotoLightbox({ photos, initialIndex, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [touchStart, setTouchStart] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const photo = photos[currentIndex];
  const isVideo = photo?.media_type === 'video';

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
  }, [photos.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
  }, [photos.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden'; // Prevent scrolling
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [onClose, handlePrev, handleNext]);

  const onStart = (clientX) => {
    setTouchStart(clientX);
    setIsDragging(true);
  };

  const onEnd = (clientX) => {
    if (!isDragging || touchStart === null) return;
    const diff = touchStart - clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    setTouchStart(null);
    setIsDragging(false);
  };

  const handleTouchStart = (e) => onStart(e.touches[0].clientX);
  const handleTouchEnd = (e) => onEnd(e.changedTouches[0].clientX);

  const handleMouseDown = (e) => onStart(e.clientX);
  const handleMouseUp = (e) => onEnd(e.clientX);
  const handleMouseLeave = () => { if (isDragging) setIsDragging(false); };

  if (!photo) return null;

  return createPortal(
    <div className="lightbox-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <button className="lightbox-close" onClick={onClose} aria-label="Close">✕</button>
      
      <div 
        className="lightbox-content"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onMouseDown={!isVideo ? handleMouseDown : undefined}
        onMouseUp={!isVideo ? handleMouseUp : undefined}
        onMouseLeave={!isVideo ? handleMouseLeave : undefined}
        style={{ touchAction: isVideo ? 'auto' : 'none', userSelect: 'none' }}
      >
        <div className="lightbox-image-container">
          {isVideo ? (
            <video
              key={photo.id}
              src={photo.original_path}
              className="lightbox-image fade-in"
              controls
              autoPlay
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <>
              <img 
                key={photo.id}
                src={photo.original_path} 
                alt={`Photo ${currentIndex + 1}`} 
                className="lightbox-image fade-in"
                draggable={false}
              />
              <div className="lightbox-spinner-container">
                <div className="spinner"></div>
              </div>
            </>
          )}
        </div>

        {photos.length > 1 && (
          <>
            <button className="lightbox-nav lightbox-prev" onClick={handlePrev} aria-label="Previous">‹</button>
            <button className="lightbox-nav lightbox-next" onClick={handleNext} aria-label="Next">›</button>
            <div className="lightbox-counter">
              {currentIndex + 1} / {photos.length}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
