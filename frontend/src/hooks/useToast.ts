'use client';

import { toast as sonnerToast } from 'sonner';

interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive' | 'success';
  duration?: number;
}

export function useToast() {
  const toast = ({ title, description, variant = 'default', duration = 5000 }: ToastOptions) => {
    if (variant === 'destructive') {
      sonnerToast.error(title, {
        description,
        duration,
      });
    } else if (variant === 'success') {
      sonnerToast.success(title, {
        description,
        duration,
      });
    } else {
      sonnerToast(title, {
        description,
        duration,
      });
    }
  };

  return { toast };
}

export default useToast;
