import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom';
import { Suspense, lazy, useEffect } from 'react';
import { Navbar } from './components/navbar';
import { FpsCounter } from './components/FpsCounter';
import { NotFound } from './components/NotFound';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';

const Home = lazy(() => import('./pages/Home'));
const About = lazy(() => import('./pages/About'));
const Experiments = lazy(() => import('./pages/Experiments'));
const StyleGuide = lazy(() => import('./pages/StyleGuide'));

/**
 * Route-transition fallback.
 *
 * A spinner is a stalling animation with no information in it. This is the
 * page's own metadata voice saying which document is being fetched, on the
 * same ground the page will land on, so nothing flashes.
 */
function PageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <p className="font-meta text-fg-subtle">Loading</p>
    </div>
  );
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <ScrollToTop />
      <FpsCounter />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:bg-ink focus:px-3 focus:py-2 focus:font-meta focus:text-on-ink"
      >
        Skip to content
      </a>
      <Navbar />
      <main id="main">
        <RouteErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
              <Route path="/experiments/*" element={<Experiments />} />
              <Route path="/style-guide" element={<StyleGuide />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </RouteErrorBoundary>
      </main>
    </Router>
  );
}

export default App;
