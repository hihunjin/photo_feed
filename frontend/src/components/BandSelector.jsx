import React, { useEffect, useState } from 'react';
import { getBands } from '../api';

export default function BandSelector({ selectedBand, onSelectBand }) {
  const [bands, setBands] = useState([]);

  useEffect(() => {
    getBands()
      .then((data) => setBands(data.items || data.bands || []))
      .catch(() => setBands([]));
  }, []);

  if (bands.length === 0) {
    return (
      <p className="muted" style={{ textAlign: 'center', padding: 12 }}>
        No bands available. Create one in the Bands tab.
      </p>
    );
  }

  return (
    <div className="row-wrap" style={{ gap: 8 }}>
      {bands.map((band) => (
        <button
          key={band.id}
          className={`btn btn-sm ${selectedBand?.id === band.id ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => onSelectBand(band)}
        >
          {band.name}
        </button>
      ))}
    </div>
  );
}
