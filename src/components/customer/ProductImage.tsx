import { useVendorBusinessCategory } from '@/hooks/useVendorBusinessCategory';
import { businessCategoryIcon } from '@/lib/businessCategoryIcon';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  src: string | null | undefined;
  alt: string;
  vendorId: string;
  className?: string;
  iconClassName?: string;
}

// A product's photo, or (images are optional) its vendor's business category
// icon in faint grey on a grey background
const ProductImage = ({ src, alt, vendorId, className, iconClassName }: ProductImageProps) => {
  const category = useVendorBusinessCategory(vendorId, !src);
  if (src) return <img src={src} alt={alt} className={className} />;
  const Icon = businessCategoryIcon(category);
  return (
    <div role="img" aria-label={alt} className={cn('flex items-center justify-center bg-gray-100 dark:bg-muted', className)}>
      <Icon className={cn('h-1/3 w-1/3 text-gray-300 dark:text-muted-foreground/40', iconClassName)} strokeWidth={1.5} />
    </div>
  );
};

export default ProductImage;
