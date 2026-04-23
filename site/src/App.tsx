import { Routes, Route } from 'react-router';
import Home from '@/routes/Home';
import About from '@/routes/About';
import Archive from '@/routes/Archive';
import Data from '@/routes/Data';
import NotFound from '@/routes/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/archive" element={<Archive />} />
      <Route path="/data" element={<Data />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
