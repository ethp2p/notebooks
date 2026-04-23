import { Routes, Route } from 'react-router';
import Home from '@/routes/Home';
import About from '@/routes/About';
import Archive from '@/routes/Archive';
import Data from '@/routes/Data';
import Workspace from '@/routes/Workspace';
import Legacy from '@/routes/Legacy';
import NotFound from '@/routes/NotFound';
import Gallery from '@/__gallery__/Gallery';
import ChartGallery from '@/__gallery__/Chart';

const isDev = import.meta.env.DEV;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/data" element={<Data />} />
      <Route path="/w" element={<Workspace />} />
      <Route path="/w/:encoded" element={<Workspace />} />
      {/* Legacy notebook URL redirects — must sit before the catch-all */}
      <Route path="/latest/:id" element={<Legacy />} />
      <Route path="/:year/:month/:day" element={<Legacy />} />
      <Route path="/:year/:month/:day/:id" element={<Legacy />} />
      {isDev ? <Route path="/__gallery__" element={<Gallery />} /> : null}
      {isDev ? <Route path="/__gallery__/chart" element={<ChartGallery />} /> : null}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
