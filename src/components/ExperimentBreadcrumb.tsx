import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AppLink } from '@/components/ui/AppLink';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface ExperimentBreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function ExperimentBreadcrumb({
  items,
  className = '',
}: ExperimentBreadcrumbProps) {
  // Build the complete breadcrumb items array
  const allItems: BreadcrumbItem[] = [
    { label: 'Experiments', href: '/experiments' },
    ...items,
  ];

  const firstItem = allItems[0];
  const middleItems = allItems.slice(1, -1);
  const lastItem = allItems[allItems.length - 1];
  const hasMiddleItems = middleItems.length > 0;

  return (
    <nav className={`w-full ${className}`}>
      <Breadcrumb className="w-full">
        <BreadcrumbList className="flex-nowrap">
          {/* First item - always show */}
          <BreadcrumbItem className="flex-shrink-0">
            <BreadcrumbLink asChild>
              <AppLink to={firstItem.href!} className="xs:min-w-max">
                {firstItem.label}
              </AppLink>
            </BreadcrumbLink>
          </BreadcrumbItem>

          {/* Separator after first item */}
          <BreadcrumbSeparator className="flex-shrink-0" />

          {/* Middle items section */}
          {hasMiddleItems && (
            <>
              {/* Ellipsis for small screens */}
              <BreadcrumbItem className="flex-shrink-0 xs:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger className="flex items-center gap-1">
                    <BreadcrumbEllipsis className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {middleItems.map((item, index) => (
                      <DropdownMenuItem key={index} asChild>
                        {item.href ? (
                          <AppLink to={item.href}>{item.label}</AppLink>
                        ) : (
                          <span>{item.label}</span>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </BreadcrumbItem>

              {/* Full middle items for larger screens */}
              {middleItems.map((item, index) => (
                <BreadcrumbItem
                  key={`middle-${index}`}
                  className="hidden xs:block flex-shrink-0"
                >
                  {item.href ? (
                    <BreadcrumbLink asChild>
                      <AppLink
                        to={item.href}
                        className="truncate max-w-[120px] sm:max-w-[160px] md:max-w-[200px] lg:max-w-none"
                      >
                        {item.label}
                      </AppLink>
                    </BreadcrumbLink>
                  ) : (
                    <span className="truncate max-w-[120px] sm:max-w-[160px] md:max-w-[200px] lg:max-w-none">
                      {item.label}
                    </span>
                  )}
                </BreadcrumbItem>
              ))}

              {/* Separator after middle items */}
              <BreadcrumbSeparator className="flex-shrink-0" />
            </>
          )}

          {/* Last item - can expand to fill space */}
          <BreadcrumbItem className="flex-1 min-w-0">
            {lastItem.href ? (
              <BreadcrumbLink asChild>
                <AppLink
                  to={lastItem.href}
                  className="truncate block max-w-[100px] xs:max-w-[150px] sm:max-w-[200px] md:max-w-[300px] lg:max-w-none"
                >
                  {lastItem.label}
                </AppLink>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="truncate block max-w-[100px] xs:max-w-[150px] sm:max-w-[200px] md:max-w-[300px] lg:max-w-none">
                {lastItem.label}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </nav>
  );
}
