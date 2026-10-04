// components/ConnectivityStatus.tsx
// Phase 7: small non-blocking offline indicator. Local workflow never waits
// for the network; this only informs. No sync functionality.

import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

const ConnectivityStatus: React.FC = () => {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-900 bg-amber-100 border-b border-amber-200"
    >
      <WifiOff size={14} className="shrink-0" />
      Offline — changes are saved on this device.
    </div>
  );
};

export default ConnectivityStatus;
