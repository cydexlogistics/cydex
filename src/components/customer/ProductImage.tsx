import { useState } from 'react';
import { useVendorBusinessCategory } from '@/hooks/useVendorBusinessCategory';
import { businessCategoryIcon } from '@/lib/businessCategoryIcon';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  vendorId: string;
  className?: string;
  iconClassName?: string;
  /** Load straight away instead of when it's about to scroll into view (for the main photo on a page) */
  eager?: boolean;
}

// A product's photo, or (images are optional) its vendor's business category
// icon in faint grey on a grey background. Photos load lazily and decode off
// the main thread, showing grey until they arrive, so the page never waits for
// them; a broken photo falls back to the icon.
const ProductImage = ({ src, alt, vendorId, className, iconClassName, eager }: ProductImageProps) => {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!src && !failed;
  const category = useVendorBusinessCategory(vendorId, !showPhoto);

  if (showPhoto) {
    return (
      <img
        src={src}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setFailed(true)}
        className={cn('bg-gray-100 dark:bg-muted', className)}
      />
    );
  }
  const Icon = businessCategoryIcon(category);
  return (
    <div role="img" aria-label={alt} className={cn('flex items-center justify-center bg-gray-100 dark:bg-muted', className)}>
      <Icon className={cn('h-1/3 w-1/3 text-gray-300 dark:text-muted-foreground/40', iconClassName)} strokeWidth={1.5} />
    </div>
  );
};

export default ProductImage;
