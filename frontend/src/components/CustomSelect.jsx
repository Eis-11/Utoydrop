import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icons";

export function CustomSelect({ icon, label, value, options, onChange, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selectedOption = options.find((option) => (typeof option === "string" ? option : option.value) === value);
  const selectedLabel = typeof selectedOption === "string" ? selectedOption : selectedOption?.label || value;

  useEffect(() => {
    function close(event) {
      if (!ref.current?.contains(event.target)) setOpen(false);
    }
    function closeWithEscape(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeWithEscape);
    };
  }, []);

  return (
    <div className={`custom-select ${open ? "is-open" : ""} ${className}`.trim()} ref={ref}>
      <button
        type="button"
        className="custom-select-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        {icon && <Icon name={icon} size={17} />}
        <span>{selectedLabel}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="custom-select-menu" role="listbox" aria-label={label}>
          {options.map((option) => {
            const optionValue = typeof option === "string" ? option : option.value;
            const optionLabel = typeof option === "string" ? option : option.label;
            return (
              <button
                type="button"
                role="option"
                aria-selected={optionValue === value}
                className={optionValue === value ? "active" : ""}
                key={optionValue}
                onClick={() => {
                  onChange(optionValue);
                  setOpen(false);
                }}
              >
                <span>{optionLabel}</span>
                {optionValue === value && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
