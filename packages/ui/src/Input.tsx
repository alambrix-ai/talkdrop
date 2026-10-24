import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={['in', className].filter(Boolean).join(' ')} {...rest} />;
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={['in', className].filter(Boolean).join(' ')} {...rest} />;
}
