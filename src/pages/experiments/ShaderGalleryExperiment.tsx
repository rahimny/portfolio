import { Routes, Route } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AnimatedCounter } from '@/components/AnimatedCounter';
import { ShaderCard } from '@/components/ShaderCard';
import { ExperimentBreadcrumb } from '@/components/ExperimentBreadcrumb';
import { useBreadcrumbFromRoute } from '@/hooks/useBreadcrumbFromRoute';
import { PageLayout, PageSection } from '@/components/PageLayout';
import { getStudy } from '@/features/lab/registry';

const GenericShaderExperiment = lazy(() => import('./GenericShaderExperiment'));

const gallery = getStudy('shader-gallery')!;

// Main gallery grid component
function ShaderGalleryGrid() {
  const variants = gallery.variants ?? [];
  const breadcrumbItems = useBreadcrumbFromRoute();

  return (
    <PageLayout>
      {/* Desktop breadcrumb overlay - positioned at top-left */}
      {breadcrumbItems.length > 0 && (
        <div className="absolute inset-0 p-2 pointer-events-none hidden sm:block z-20">
          <div className="flex justify-start items-start h-full">
            <div className="bg-background/60 backdrop-blur-sm px-4 py-2 rounded-lg border shadow-lg pointer-events-auto">
              <ExperimentBreadcrumb items={breadcrumbItems} />
            </div>
          </div>
        </div>
      )}

      <PageSection variant="hero">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
            {gallery.title}
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-8">
            {gallery.summary}
          </p>
          <AnimatedCounter target={variants.length} label="Shaders" />
        </div>
      </PageSection>

      <PageSection variant="content">
        {/* Shader Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mb-16 items-stretch">
          {variants.map((variant) => (
            <ShaderCard key={variant.slug} variant={variant} />
          ))}
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t">
          <p className="text-muted-foreground">
            More shaders coming soon! Built with Three.js, WebGL & GLSL.
          </p>
        </div>
      </PageSection>
    </PageLayout>
  );
}

// Loading component
function ShaderLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading shader...</p>
      </div>
    </div>
  );
}

export default function ShaderGalleryExperiment() {
  return (
    <Routes>
      <Route index element={<ShaderGalleryGrid />} />
      <Route
        path=":shaderId"
        element={
          <Suspense fallback={<ShaderLoader />}>
            <GenericShaderExperiment />
          </Suspense>
        }
      />
    </Routes>
  );
}
