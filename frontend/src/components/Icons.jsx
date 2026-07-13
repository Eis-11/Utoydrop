export function Icon({ name, size = 20 }) {
  const paths = {
    home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    search: <path d="m21 21-4.4-4.4m2.4-5.1a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z" />,
    filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
    instagram: <><rect x="4" y="4" width="16" height="16" rx="5" /><circle cx="12" cy="12" r="3.5" /><path d="M17.5 6.5h.01" /></>,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    eye: <><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
    spark: <path d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm7 12 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M7 7l1 14h8l1-14M9 7V4h6v3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    ruler: <><path d="M4 19.5 19.5 4 21 5.5 5.5 21 4 19.5Z" /><path d="m14.5 9 1.5 1.5M11.5 12l1.5 1.5M8.5 15l1.5 1.5" /></>,
    logout: <><path d="M10 5H5v14h5M14 8l4 4-4 4m4-4H9" /></>,
    edit: <><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="m13.5 8 3 3" /></>,
    upload: <><path d="M12 16V4m0 0L7 9m5-5 5 5" /><path d="M5 15v5h14v-5" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}
