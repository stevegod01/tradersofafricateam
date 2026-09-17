const MailSentSketch = ({ className }: { className?: string }) => {
  return (
    <svg
      viewBox="0 0 160 160"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* doodle accents */}
      <path
        d="M20 26q5-7 12-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <circle cx="144" cy="32" r="2.2" fill="currentColor" opacity="0.5" />
      <circle cx="10" cy="94" r="2.2" fill="currentColor" opacity="0.5" />
      <path
        d="M138 86q7 2 7 9"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M2 58q11-5 20 1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="1 7"
        opacity="0.45"
      />
      <path
        d="M0 71q13-3 22 3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeDasharray="1 7"
        opacity="0.45"
      />

      {/* envelope body, drawn with a faint double-stroke for a sketched feel */}
      <rect
        x="25"
        y="47"
        width="111"
        height="77"
        rx="9"
        stroke="currentColor"
        strokeWidth="1.25"
        opacity="0.35"
      />
      <rect
        x="24"
        y="45"
        width="112"
        height="78"
        rx="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* open flap */}
      <path
        d="M29 53q26 22 51 44 25-22 51-44"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* verified seal badge */}
      <circle
        cx="121"
        cy="117"
        r="19"
        fill="var(--orange-light)"
        stroke="currentColor"
        strokeWidth="2.25"
      />
      <path
        d="M112.5 117.5 118.5 123.5 130.5 109.5"
        stroke="currentColor"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default MailSentSketch;
