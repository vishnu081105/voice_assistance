import { cn } from '@/lib/utils';

type BrandLogoProps = {
  className?: string;
  imgClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
  alt?: string;
};

export const brandLogoSrc = '/cubeai-logo.svg';

export function BrandLogo({
  className,
  imgClassName,
  subtitle,
  subtitleClassName,
  alt = 'CubeAI Solutions',
}: BrandLogoProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      <img
        src={brandLogoSrc}
        alt={alt}
        className={cn('h-12 w-auto max-w-full object-contain', imgClassName)}
      />
      {subtitle ? (
        <span className={cn('mt-1 text-xs text-muted-foreground', subtitleClassName)}>
          {subtitle}
        </span>
      ) : null}
    </div>
  );
}
