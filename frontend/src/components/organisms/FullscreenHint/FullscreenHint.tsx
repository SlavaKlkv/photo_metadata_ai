import React, { useEffect, useRef, useState } from 'react';
import styles from './FullscreenHint.module.scss';

export const FULLSCREEN_HINT_DURATION_MS = 2500;

export const FullscreenHint: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [version, setVersion] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const subscribe = window.desktopShell?.onEnterFullscreen;
    if (!subscribe) {
      return;
    }

    const unsubscribe = subscribe(() => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
      setVersion((current) => current + 1);
      setIsVisible(true);
      hideTimer.current = setTimeout(() => {
        setIsVisible(false);
        hideTimer.current = null;
      }, FULLSCREEN_HINT_DURATION_MS);
    });

    return () => {
      unsubscribe();
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    };
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <div key={version} className={styles.hint} role="status">
      Press <kbd>Esc</kbd> to exit full screen
    </div>
  );
};
