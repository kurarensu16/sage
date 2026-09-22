import React from 'react';

export function SageLogoWhite(props) {
  return <SageLogo variant="white" {...props} />;
}

export default function SageLogo({
  className = 'h-6 w-6',
  variant = 'default',
  color,
  ...props
}) {
  const fill = variant === 'white'
    ? '#ffffff'
    : (variant === 'brand' || variant === 'primary')
      ? '#1E3A8A'
      : color || 'currentColor';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 50 50"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M25 30L10 38.75V33.75L25 25L40 33.75V38.75L25 30Z"
        fill={fill}
      />
      <path
        d="M25 21.25L10 30V25L25 16.25L40 25V30L25 21.25Z"
        fill={fill}
      />
      <path
        d="M25 12.5L10 21.25V16.25L25 7.5L40 16.25V21.25L25 12.5Z"
        fill={fill}
      />
    </svg>
  );
}

