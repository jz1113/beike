import { useEffect, useRef, useState } from 'react';

/** A tool closes after a real task is queued; generation success belongs to the result node. */
export function useCanvasToolSubmission(isOpen: boolean, onClose: () => void) {
  const lock = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  useEffect(() => { if (isOpen) setSubmitError(''); }, [isOpen]);
  const submit = async (enqueue: () => void | Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setIsSubmitting(true);
    setSubmitError('');
    try { await enqueue(); onClose(); }
    catch (error) { setSubmitError(error instanceof Error ? error.message : '无法创建生成任务，请重试'); }
    finally { lock.current = false; setIsSubmitting(false); }
  };
  return { isSubmitting, submitError, submit };
}
