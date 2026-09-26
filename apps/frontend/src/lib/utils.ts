import { currency, percentage } from './presentation';
import { clsx, type ClassValue } from 'clsx'; import { twMerge } from 'tailwind-merge';
export function cn(...inputs:ClassValue[]){return twMerge(clsx(inputs))}
export function money(value: number | null | undefined,currencyCode='KES'){return currency(value,currencyCode)}
export function pct(value:number | null | undefined){return percentage(value)}
