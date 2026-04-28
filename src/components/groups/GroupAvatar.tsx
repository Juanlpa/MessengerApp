'use client';

interface GroupAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
};

/** Genera color de fondo a partir del nombre del grupo */
function groupColor(name: string): string {
  const colors = [
    'bg-blue-600', 'bg-indigo-600', 'bg-purple-600',
    'bg-pink-600', 'bg-teal-600', 'bg-green-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export function GroupAvatar({ name, avatarUrl, size = 'md' }: GroupAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0`}
      />
    );
  }

  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <div
      className={`${sizeClasses[size]} ${groupColor(name)} rounded-full flex items-center justify-center text-white font-semibold shrink-0`}
    >
      {initials || '#'}
    </div>
  );
}
