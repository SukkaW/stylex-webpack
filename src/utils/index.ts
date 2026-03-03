import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import type { StaticStyles } from '@stylexjs/stylex';

export function stylexPropsWithClassName(stylexProps: Readonly<{
  className?: string,
  'data-style-src'?: string,
  style?: Readonly<{ [$$Key$$: string]: string | number }>
}>, ...inputs: ClassValue[]) {
  return {
    ...stylexProps,
    className: clsx(stylexProps.className, ...inputs)
  };
}

export function stylexPropsWithStyleObject(stylexProps: Readonly<{
  className?: string,
  'data-style-src'?: string,
  style?: Readonly<{ [$$Key$$: string]: string | number }>
}>, style: Readonly<{ [$$Key$$: string]: string | number }>) {
  return {
    ...stylexProps,
    style: {
      ...stylexProps.style,
      ...style
    }
  };
}

export type WithXStyleProps<T = object, X extends StaticStyles = StaticStyles> = Omit<T, 'className' | 'style'> & { xstyle?: X };

export const DEFAULT_XSTYLE: StaticStyles = [];
