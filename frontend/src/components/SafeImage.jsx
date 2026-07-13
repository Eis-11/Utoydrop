const fallbackImage = "/img/logo-utoy-drop-small.jpg";

export function SafeImage({ src, alt, className = "", fallback = fallbackImage, onError, ...props }) {
  function handleError(event) {
    if (event.currentTarget.dataset.fallbackApplied === "true") return;
    event.currentTarget.dataset.fallbackApplied = "true";
    event.currentTarget.classList.add("is-fallback");
    event.currentTarget.src = fallback;
    onError?.(event);
  }

  return (
    <img
      src={src || fallback}
      alt={alt}
      className={`safe-image ${className}`.trim()}
      decoding="async"
      onError={handleError}
      {...props}
    />
  );
}
