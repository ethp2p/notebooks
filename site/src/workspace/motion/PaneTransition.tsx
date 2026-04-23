import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function PaneTransition({ focused, children }: { focused: boolean; children: ReactNode }) {
  return (
    <motion.div
      className="h-full w-full"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ boxShadow: focused ? '0 0 0 1px var(--fg)' : undefined }}
    >
      {children}
    </motion.div>
  );
}
