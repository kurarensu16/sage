import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { getAvatarUrl } from '../../lib/profileService';

// Shows the user's private profile photo through a signed URL, falling back to initials.
export default function UserAvatar({ path, initials, alt = 'Profile photo', className = '' }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    if (!path) {
      setUrl(null);
      return undefined;
    }
    getAvatarUrl(path).then(signed => { if (!cancelled) setUrl(signed); });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className={cn('rounded-full overflow-hidden flex items-center justify-center shrink-0', className)}>
      {url && !failed
        ? <img src={url} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        : initials}
    </div>
  );
}
