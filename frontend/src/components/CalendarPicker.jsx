import React, { useEffect, useRef, useState } from 'react';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];

export default function CalendarPicker({ availableDates = [], selectedDate, onSelectDate, onClose }) {
  const ref = useRef(null);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // Close when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Build set for O(1) lookup
  const dateSet = new Set(availableDates);

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function toDateStr(d) {
    return `${year}-${pad(month + 1)}-${pad(d)}`;
  }

  const cells = [];
  // Empty leading cells
  for (let i = 0; i < firstDay; i++) {
    cells.push(<div key={`e-${i}`} className="calendar-day calendar-day--empty" />);
  }
  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = toDateStr(d);
    const available = dateSet.has(ds);
    const selected = ds === selectedDate;
    const isToday = ds === `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    cells.push(
      <button
        key={d}
        type="button"
        className={[
          'calendar-day',
          available ? 'calendar-day--available' : 'calendar-day--disabled',
          selected ? 'calendar-day--selected' : '',
          isToday ? 'calendar-day--today' : '',
        ].filter(Boolean).join(' ')}
        disabled={!available}
        onClick={() => onSelectDate?.(ds)}
      >
        {d}
        {available && <span className="calendar-dot" />}
      </button>
    );
  }

  return (
    <div className="calendar-popup" ref={ref}>
      <div className="calendar-header">
        <button type="button" className="btn btn-ghost btn-sm" onClick={prevMonth}>◀</button>
        <strong>{year}년 {month + 1}월</strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={nextMonth}>▶</button>
      </div>
      <div className="calendar-weekdays">
        {DAYS_KO.map(d => <div key={d} className="calendar-weekday">{d}</div>)}
      </div>
      <div className="calendar-grid">
        {cells}
      </div>
      {selectedDate && (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          style={{ width: '100%', marginTop: 6 }}
          onClick={() => onSelectDate?.(null)}
        >
          필터 해제
        </button>
      )}
    </div>
  );
}
