import { useEffect, useId, useRef, useState } from 'react';

export default function CustomSelect({ value, options, onChange, disabled = false, labelId }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const valueId = useId();
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, []);

  useEffect(() => {
    if (!open) return;

    const menu = menuRef.current;
    const initialOption = menu.querySelector('.active') || menu.firstElementChild;
    initialOption?.focus();
  }, [open]);

  const closeMenu = () => {
    triggerRef.current.focus();
    setOpen(false);
  };

  const handleKeyDown = (event) => {
    if (open && event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      return;
    }

    if (disabled || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;

    event.preventDefault();
    if (!open) {
      setOpen(true);
      return;
    }

    const menu = menuRef.current;
    const currentOption = event.target.parentElement === menu ? event.target : null;
    const nextOption = event.key === 'ArrowDown'
      ? currentOption?.nextElementSibling || menu.firstElementChild
      : currentOption?.previousElementSibling || menu.lastElementChild;
    nextOption?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={`custom-select ${open ? 'open' : ''}`}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="custom-select-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-labelledby={labelId ? `${labelId} ${valueId}` : undefined}
      >
        <span id={valueId}>{selectedOption?.label || 'Select'}</span>
        <span className="custom-select-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div ref={menuRef} id={menuId} className="custom-select-menu">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`custom-select-option ${option.value === value ? 'active' : ''}`}
              onClick={() => {
                onChange(option.value);
                closeMenu();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
