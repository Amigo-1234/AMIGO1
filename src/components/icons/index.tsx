import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ?? "size-5"}
      {...props}
    >
      {children}
    </svg>
  );
}

/** Points toward the reading direction's "forward"; mirror with `rtl:-scale-x-100`. */
export function ArrowForwardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Icon>
  );
}

export function ArrowBackIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Icon>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
    </Icon>
  );
}

export function StudentIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" />
      <path d="M7 11.5V16c1.3 1.3 3 2 5 2s3.7-.7 5-2v-4.5M21 9.5V15" />
    </Icon>
  );
}

export function StaffIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </Icon>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </Icon>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="7" height="8" rx="1" />
      <rect x="13" y="4" width="7" height="5" rx="1" />
      <rect x="13" y="11" width="7" height="9" rx="1" />
      <rect x="4" y="14" width="7" height="6" rx="1" />
    </Icon>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="4" y="5" width="16" height="15" rx="1.5" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </Icon>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.4 3.6-5.5 7-5.5s6.2 2.1 7 5.5" />
    </Icon>
  );
}

export function ResultsIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 20V10M12 20V4M19 20v-7" />
    </Icon>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3.5" y="6" width="17" height="13" rx="1.5" />
      <path d="M16 12.5h4.5M6.5 6l8-3 1.5 3" />
    </Icon>
  );
}

export function ReportIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7 3.5h7l4 4V20.5H7z" />
      <path d="M14 3.5v4h4M10 12h5M10 15.5h5" />
    </Icon>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Icon>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </Icon>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** Points toward the reading direction's "forward"; mirror with `rtl:-scale-x-100`. */
export function ChevronForwardIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}
