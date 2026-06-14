'use client';

import { useState, useRef, useEffect } from 'react';
import { MapPin, Check, Loader2 } from 'lucide-react';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

// Location input with Google Places typeahead. Selecting a suggestion marks
// the address as "verified" (it corresponds to a real place Google knows
// about); free-typed text is left as-is with no verification badge.
export default function LocationAutocomplete({ value, onChange, disabled, className, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  function handleChange(newValue) {
    onChange(newValue);
    setVerified(false);
    setActiveIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (newValue.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(newValue)}`);
        const data = await res.json();
        const results = data.suggestions ?? [];
        setSuggestions(results);
        setOpen(results.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }

  function selectSuggestion(suggestion) {
    onChange(suggestion.text);
    setVerified(true);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0) {
        e.preventDefault();
        selectSuggestion(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
        />
        {(loading || verified) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              : <Check className="w-4 h-4 text-green-500" />}
          </div>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          {suggestions.map((s, i) => (
            <button
              key={s.placeId}
              type="button"
              onClick={() => selectSuggestion(s)}
              onMouseEnter={() => setActiveIndex(i)}
              className={`w-full text-left px-3 py-2 flex items-start gap-2 text-sm transition-colors ${
                i === activeIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
            >
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium text-gray-900 dark:text-gray-100">{s.mainText || s.text}</span>
                {s.secondaryText && <span className="text-gray-500 dark:text-gray-400"> — {s.secondaryText}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      {verified && !open && (
        <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
          <Check className="w-3 h-3" /> Verified address
        </p>
      )}
    </div>
  );
}
